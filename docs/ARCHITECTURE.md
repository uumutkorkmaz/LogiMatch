# LogiMatch — Mimari

> Durum: **onaylandı (2026-09-24)** · Kapsam: MVP (teslim adımları 1–13)

## 1. Genel bakış

LogiMatch, **modüler monolit** olarak kurulur: tek bir NestJS kod tabanı, iki süreç tipi
(HTTP API ve arka plan worker'ı), tek PostgreSQL veritabanı. Mikroservis yok. Sebep: MVP'de
ekip küçük, domain sınırları hâlâ oturuyor ve kritik akışlar (teklif kabulü → sevkiyat →
komisyon kilidi) tek transaction'da atomik olmalı. Modüller arası bağımlılık kuralları
(aşağıda) sayesinde ileride bir modül (ör. matching) ayrı servise çıkarılabilir.

```
                   ┌──────────────────────────────┐
  Tarayıcı ───────►│ apps/web  (Next.js 15, BFF)  │
                   └──────────────┬───────────────┘
                                  │ REST /api/v1 (Bearer JWT)
                   ┌──────────────▼───────────────┐        ┌──────────────┐
                   │ apps/api  — HTTP süreci      │◄──────►│ Redis 7      │
                   │ (controller → app service →  │ enqueue│ cache, BullMQ│
                   │  domain)                     │        │ rate limit,  │
                   └──────────────┬───────────────┘        │ dedup        │
                                  │ Prisma + raw SQL        └──────▲───────┘
                   ┌──────────────▼───────────────┐               │ consume
                   │ PostgreSQL 16 + PostGIS      │◄──────┐       │
                   │ btree_gist, pg_trgm, citext  │       │ ┌─────┴────────────────┐
                   └──────────────────────────────┘       └─┤ apps/api — worker    │
                                                            │ (aynı kod, ayrı      │
                                                            │  entrypoint)         │
                                                            └──────────────────────┘
```

## 2. Monorepo yerleşimi

| Paket             | Sorumluluk                                                                                                                                                 | Bağımlı olabileceği          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `packages/shared` | zod şemaları (API girdi/çıktı), enum'lar, **state machine tanımları**, value object'lerin saf kısmı (`Money`, `TimeWindow`, `Distance`), TR validator'ları | yalnızca `zod`, `decimal.js` |
| `packages/db`     | Prisma şeması, migration'lar (+ ham SQL: PostGIS, EXCLUDE, tetikleyiciler), seed, `createPrismaClient`                                                     | `@prisma/client`             |
| `packages/ui`     | shadcn/ui tabanlı bileşenler                                                                                                                               | `react`                      |
| `apps/api`        | NestJS modülleri, worker, entegrasyon adaptörleri                                                                                                          | shared, db                   |
| `apps/web`        | Next.js App Router, i18n, harita                                                                                                                           | shared, ui                   |

State machine ve zod şemalarının `shared`'da olması bilinçli: web aynı şemayla form
doğrular ve "bu durumda hangi aksiyonlar mümkün" sorusunu backend ile aynı tanımdan yanıtlar.

## 3. API iç katmanları

Her domain modülü (`apps/api/src/<modül>/`) üç katmandan oluşur:

```
<modül>/
  domain/        saf TS: kurallar, hesaplar, politika fonksiyonları. NestJS/Prisma import'u YASAK.
                 %90+ test kapsamı hedefi burada (matching, pricing, state machine).
  application/   use-case servisleri: transaction sınırı, repository çağrıları, event yayını.
  infra/         Prisma repository'leri, raw SQL sorguları, BullMQ processor'ları, adaptörler.
  http/          controller'lar, DTO ↔ zod eşlemesi, OpenAPI dekoratörleri.
```

Kurallar (ESLint `no-restricted-imports` ile zorlanacak):

- `domain/` hiçbir framework'ü import etmez; girdi olarak düz nesne alır, düz nesne döner.
- Modüller birbirinin `infra/`'sına erişmez; yalnızca dışa açılan application servislerini veya
  domain event'lerini kullanır.
- Controller'da iş kuralı yok; controller = doğrula → use-case çağır → serileştir.

### Modül listesi

| Modül            | İçerik                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `auth`           | kayıt, login, refresh rotasyonu, e-posta/telefon doğrulama, şifre sıfırlama                                               |
| `identity`       | User, Company, CompanyMember, KVKK ihraç/anonimleştirme                                                                   |
| `documents`      | Document yükleme/inceleme, **uyumluluk önbelleği** (bkz. §7.3), süre dolumu taraması                                      |
| `fleet`          | Vehicle, Trailer, Driver                                                                                                  |
| `loads`          | Load, LoadStop, yayınlama, moderasyon, arama                                                                              |
| `truck-postings` | TruckPosting, yayınlama, arama                                                                                            |
| `matching`       | aday ön-eleme (PostGIS), hard filtre, skorlama, Match yaşam döngüsü                                                       |
| `negotiation`    | Offer zinciri, kabul → Shipment oluşturma                                                                                 |
| `pricing`        | tahmin, komisyon, KDV, tevkifat, iptal cezası, settlement, fatura taslağı                                                 |
| `shipments`      | durum makinesi, ShipmentEvent, POD, iptal/uyuşmazlık                                                                      |
| `messaging`      | Conversation/Message, `contact_leak_detector`                                                                             |
| `ratings`        | Rating, reliability istatistikleri                                                                                        |
| `notifications`  | şablonlar, kanallar, dedup, DLQ                                                                                           |
| `admin`          | doğrulama kuyruğu, askıya alma, uyuşmazlık, metrikler, risk bayrakları                                                    |
| `platform`       | config tabloları (Pricing/Matching/Cancellation/ExchangeRate), audit, idempotency, health                                 |
| `integrations`   | `IGeocodingProvider`, `IRoutingProvider`, `ISmsProvider`, `IPaymentProvider`, `ITaxIdVerifier`, `IFileStorage` + mock'lar |

## 4. Süreçler ve arka plan işleri

API ve worker aynı imajdan, farklı entrypoint'le (`main.ts` / `worker.ts`) çalışır.
Worker HTTP dinlemez; yalnızca BullMQ kuyruklarını tüketir.

| Kuyruk                   | Tetikleyici                                                                | Not                                                                          |
| ------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `match.compute`          | Load / TruckPosting yayınlandı                                             | jobId = `{entity}:{id}:{version}` → aynı sürüm için tekil                    |
| `match.recompute`        | ilan güncellendi, admin toplu tetik, carrier cancel sonrası yeniden açılma | debounce 30 sn                                                               |
| `offer.expire`           | Offer oluşturuldu                                                          | **delayed job**, `delay = validUntil - now`; işlenirken durum yeniden okunur |
| `listing.expire`         | Load/TruckPosting yayınlandı                                               | delayed job, `expiresAt` / `availableUntil`                                  |
| `document.expiry-scan`   | günlük repeatable (03:00 İstanbul)                                         | 15/7/1 gün uyarıları, dolan belge → EXPIRED + ilgili varlık INACTIVE         |
| `notification.send`      | domain event'leri                                                          | 3 deneme, exponential backoff (5s, 25s, 125s) → `notification.dlq`           |
| `shipment.no-show-check` | Shipment ASSIGNED                                                          | delayed job, `pickupWindowEnd + grace`                                       |

Delayed job'lar kaybolursa diye (Redis flush vb.) worker açılışında bir **uzlaştırma taraması**
çalışır: süresi geçmiş ama hâlâ PENDING/ACTIVE olan kayıtları kapatır. Bu cron değil, bir
güvenlik ağıdır; birincil mekanizma delayed job'dır.

### Domain event'leri ve outbox

Use-case transaction'ı içinde `OutboxEvent` tablosuna satır yazılır; worker bunu okuyup kuyruğa
basar (transactional outbox). Böylece "DB commit oldu ama job kuyruğa girmedi" veya tersi olmaz.
MVP'de outbox dispatcher 1 sn aralıkla poll eder.

## 5. Veri katmanı

- **Prisma 6** ana ORM. Prisma'nın desteklemediği tipler `Unsupported(...)` ile tanımlanır ve
  migration SQL'i elle eklenir:
  - `geography(Point,4326)` — `Load.pickupLocation`, `Load.deliveryLocation`, `LoadStop.location`,
    `TruckPosting.originLocation`, `Driver.homeBaseLocation`. GIST index.
    `geography` seçildi çünkü `ST_DWithin` metre cinsinden doğru küresel mesafe verir.
  - `tstzrange` — `Shipment.assignmentPeriod`; `EXCLUDE USING gist` kısıtları (bkz. DOMAIN §8).
- Coğrafi sorgular `$queryRaw` ile, tipli sonuç eşleyicileriyle `infra/` altında.
- **Para**: `Decimal(14,2)`; kurlar `Decimal(18,8)`; oranlar `Decimal(7,6)`. JS tarafında
  `decimal.js` (Prisma.Decimal ile aynı kütüphane). `number` ile para hesabı lint kuralıyla yasak
  olacak (`Money` dışında `.toNumber()` çağrısı yok).
- **Zaman**: tüm kolonlar `timestamptz`, UTC. Sunumda `Europe/Istanbul`.
- **Soft delete**: silinebilen her tabloda `deletedAt`; Prisma client extension varsayılan olarak
  `deletedAt IS NULL` filtreler. Mali kayıtlar (Shipment, Invoice, Offer, AuditLog, ShipmentEvent)
  hiç silinmez.
- **Optimistic lock**: `Load`, `TruckPosting`, `Match`, `Offer`, `Shipment` üzerinde `version Int`.
- **Index politikası**: her FK'ye B-tree; durum + tarih bileşik index'leri; coğrafi kolonlara GIST;
  dizi kolonlarına (`requiredTrailerTypes`, `preferredDestinations`, `features`) GIN;
  firma adına `pg_trgm` GIN.
- **Append-only** tablolar (`ShipmentEvent`, `AuditLog`): `UPDATE/DELETE`'i reddeden trigger.

## 6. Güvenlik ve erişim

### Kimlik doğrulama

- Access JWT (15 dk, `sub`, `role`, `companyIds`), refresh token (30 gün) **opak**, DB'de argon2id
  hash'i ile `RefreshToken` tablosunda, **rotasyonlu + yeniden kullanım tespiti**
  (aynı aileden eski token gelirse tüm aile iptal).
- Şifre: argon2id. Login ve doğrulama uçlarında rate limit (5/dk, IP + e-posta anahtarlı).

### Yetkilendirme (iki katman)

1. **RBAC guard**: `@Roles(...)` — platform rolü (`SHIPPER_USER`, `CARRIER_USER`, `DRIVER`, `ADMIN`, `OPS`).
2. **Policy (kaynak sahipliği)**: `@Policy('load:update')` + domain'de saf policy fonksiyonları
   `canUpdateLoad(actor, load)`. Actor = kullanıcı + firma üyelikleri + firma rolleri
   (`OWNER|MANAGER|DISPATCHER|ACCOUNTANT`). Ör. ACCOUNTANT teklif veremez ama settlement görür.

### Web oturumu (BFF)

Next.js route handler'ları login/refresh çağrısını API'ye proxy'ler ve token'ları **httpOnly,
Secure, SameSite=Lax** cookie'de tutar. Server component'ler API'yi bu cookie'den okunan
bearer ile çağırır. Tarayıcı JS'i token görmez.

### Maskeleme (disintermediation önlemi)

- Serileştirme katmanında `ContactVisibilityPolicy`: karşı tarafın firma unvanı, VKN, telefon,
  e-posta, adres detayı, IBAN, şoför adı/telefonu ve **plaka** Shipment oluşana kadar maskelenir.
  Maskeli profil: takma kimlik (`Taşıyıcı #7F3A`), il, doğrulama rozeti, puan, tamamlanan sefer.
- Mesajlar `contact_leak_detector`'dan geçer (DOMAIN §9).

### Diğer

- `Idempotency-Key` header'ı tüm mutasyonlarda desteklenir: `IdempotencyRecord(key, userId,
method, path, requestHash, status, responseBody, expiresAt)`. Aynı anahtar + farklı gövde → 422.
  İşlem sürerken aynı anahtar → 409.
- Rate limit `@nestjs/throttler` + Redis storage: auth 5/dk, arama 60/dk, yazma 30/dk.
- Hata formatı RFC 7807 (`application/problem+json`): `type`, `title`, `status`, `detail`,
  `instance`, `code` (makine okunur, ör. `OFFER_ALREADY_ACCEPTED`), `requestId`, `errors[]`.
- Dosya yükleme: MIME + boyut kontrolü, rastgele isim, `IFileStorage` (MVP: yerel disk,
  imzalı ve süreli indirme URL'i). Belge dosyaları asla public değil.
- AuditLog: her mutasyon için interceptor (actor, action, entity, ip, userAgent) +
  hassas varlıklarda servis içinden before/after.

## 7. Eşleştirme motoru — çalışma şekli

Ayrıntılı kurallar DOMAIN §6'da. Mimari açıdan:

### 7.1 Akış

```
Load.publish (tx) ──► OutboxEvent(load.published) ──► match.compute job
   worker:
     1. Aday ön-eleme  (tek SQL, PostGIS + ucuz hard filtreler)
     2. Kalan hard filtreler (JS, saf fonksiyon)
     3. Skorlama (JS, saf fonksiyon, MatchingConfig ağırlıkları)
     4. Eşik (≥40) + ilk 20 → Match UPSERT (unique loadId+truckPostingId)
     5. Artık aday olmayan eski SUGGESTED eşleşmeler → EXPIRED
     6. Yeni eşleşmeler için notification event'leri
```

TruckPosting yayınında simetrik akış çalışır (posting başına ilk 20 Load).

### 7.2 Aday ön-eleme SQL'i (taslak)

```sql
SELECT p.*, ST_Distance(p.origin_location, $pickup) / 1000 AS straight_km
FROM truck_posting p
JOIN trailer t ON t.id = p.trailer_id
JOIN compliance_snapshot cs ON ...            -- §7.3
WHERE p.status = 'ACTIVE'
  AND ST_DWithin(p.origin_location, $pickup, p.max_deadhead_km * 1000 / $roadFactor)
  AND t.trailer_type = ANY($requiredTrailerTypes)
  AND t.capacity_kg >= $weightKg AND t.volume_m3 >= $volumeM3 AND t.loading_meters >= $ldm
  AND p.available_from < $pickupEnd AND p.available_until > $pickupStart
  AND p.company_id <> $shipperCompanyId
  AND NOT EXISTS (SELECT 1 FROM block_list b WHERE ...)
LIMIT 500;
```

`$roadFactor` ile düz mesafe yarıçapı daraltılır; kesin deadhead JS'te `düz km × roadFactor`
ile hesaplanır (bkz. ASSUMPTIONS). Gerçek routing çağrısı eşleştirmede **yapılmaz**, yalnızca
fiyat tahmini ve sevkiyat oluşturmada yapılır — 10k ilanda 800 ms hedefinin ön koşulu.

### 7.3 Uyumluluk önbelleği

Her eşleştirmede belge tablosunu join'lemek pahalı. Bunun yerine `Company`, `Vehicle`, `Trailer`,
`Driver` üzerinde türetilmiş alanlar tutulur ve belge onay/ret/süre dolumunda yeniden hesaplanır:

| Alan                               | Anlamı                                                               |
| ---------------------------------- | -------------------------------------------------------------------- |
| `complianceValidUntil`             | zorunlu belgelerin (APPROVED) en erken `expiresAt`'i; eksikse `null` |
| `adrValidUntil` (Driver, Trailer)  | ADR yetkinliği bitişi                                                |
| `intlValidUntil` (Company, Driver) | uluslararası yetki / pasaport bitişi                                 |

Hard filtre: `complianceValidUntil > load.deliveryWindowEnd`. Zorunlu belge seti
`RequiredDocumentRule` config tablosundan gelir.

### 7.4 Performans hedefi ve ölçüm

- Hedef: 10.000 aktif TruckPosting'de tek Load için p95 < 800 ms (ön-eleme + skorlama + yazma).
- Adım 7'de `bench/matching.bench.ts` ile seed'den 10k sentetik ilan üretilip ölçülecek.
- Reliability ve history skorları için `CompanyStats` ve `CompanyPairStats` önceden hesaplanır
  (sevkiyat tamamlanınca/iptal edilince güncellenir); skorlama sırasında N+1 sorgu yok.

## 8. Eşzamanlılık stratejisi

| Senaryo                                        | Mekanizma                                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aynı TruckPosting'e iki teklif aynı anda kabul | `SERIALIZABLE` tx + `UPDATE truck_posting SET status='RESERVED', version=version+1 WHERE id=$1 AND version=$2 AND status='ACTIVE'`; etkilenen satır 0 → `409 CONFLICT`. Serialization hatası (P2034/40001) → 1 kez retry, sonra 409. |
| Aynı Load için iki teklif aynı anda kabul      | Aynı desen, `Load.version` ve `status IN (open)` ile                                                                                                                                                                                 |
| Aynı araç/şoför/dorse çakışan iki sevkiyat     | `EXCLUDE USING gist` (DB son savunma hattı; uygulama önceden kontrol eder)                                                                                                                                                           |
| Kabul sırasında yük iptali                     | Kabul tx'i Load'u `SELECT ... FOR UPDATE` ile yeniden okur; iptal de aynı satırı kilitler — sıralanırlar                                                                                                                             |
| Offer expire job'ı ile kabulün yarışı          | expire job `UPDATE ... WHERE status='PENDING'`; kabul `validUntil > now()` şartını tx içinde kontrol eder                                                                                                                            |

Test: adım 8'de gerçek PostgreSQL'e karşı paralel `Promise.all` ile yarış testleri.

## 9. Entegrasyon sınırları

Tümü interface + mock, DI token'ı ile değiştirilebilir:

| Interface                                                                           | Mock davranışı                                                            | Gerçek aday            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------- |
| `IGeocodingProvider`                                                                | TR il/ilçe merkez koordinat gazetteer'i (+ seed koridorlarındaki ülkeler) | Nominatim / Google     |
| `IRoutingProvider` (OSRM uyumlu `route(coords[]) → {distanceM, durationS, legs[]}`) | haversine × 1.25, 65 km/s tır ortalaması                                  | OSRM (kendi sunucu)    |
| `ISmsProvider`                                                                      | log + MailHog'a kopya                                                     | Netgsm / İleti Merkezi |
| `IPaymentProvider`                                                                  | no-op, her şey "pending"                                                  | Iyzico / Stripe (v2)   |
| `ITaxIdVerifier`                                                                    | VKN/TCKN checksum + sabit ret listesi                                     | GİB / e-Devlet         |
| `IFileStorage`                                                                      | yerel disk + HMAC imzalı URL                                              | S3 / MinIO             |

## 10. Gözlemlenebilirlik

- pino JSON log, her istekte `X-Request-Id` (gelen korunur, yoksa üretilir) → log `reqId`.
  Job'lara `reqId` payload ile taşınır, worker log'ları aynı korelasyonu kullanır.
- `/health` (liveness), `/ready` (DB + Redis ping), `/metrics` (prom-client: HTTP süreleri,
  kuyruk derinlikleri, eşleştirme süresi histogramı, DLQ boyutu).
- Hassas alanlar log'da redakte: `authorization`, `cookie`, `password`, `iban`, `taxNumber`.

## 11. Web uygulaması

- App Router, route grupları: `(public)`, `(shipper)/dashboard`, `(carrier)/carrier`, `(admin)/admin`.
  Middleware rol bazlı yönlendirme yapar; gerçek yetki kontrolü her zaman API'de.
- Veri: server component'ler + `fetch`; mutasyonlar server action → API. Liste filtreleri URL
  search param'larında (paylaşılabilir link), sunucu tarafında uygulanır.
- Form: `react-hook-form` + `zodResolver(shared şema)` — backend ile aynı şema.
- Harita: MapLibre GL + OpenFreeMap (API key yok).
- i18n: `next-intl`, `tr` (varsayılan) ve `en`; locale cookie'de, URL öneki yok.
- Her ekran: loading skeleton (`loading.tsx`), boş durum, hata sınırı (`error.tsx`).

## 12. Test stratejisi

| Katman                                    | Araç                                                      | Hedef                                                         |
| ----------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| domain (matching, pricing, state machine) | Vitest, saf fonksiyon, tablo testleri                     | %90+ satır/branch                                             |
| application + infra                       | Vitest + gerçek Postgres (test DB, her suite tx rollback) | %60+                                                          |
| HTTP                                      | Supertest e2e                                             | kritik uçlar + yetki matrisi                                  |
| eşzamanlılık                              | gerçek Postgres, paralel istekler                         | §8'deki her senaryo                                           |
| web                                       | Playwright                                                | "yük yayınla → eşleş → teklif → kabul → teslim → değerlendir" |

## 13. Dağıtım (MVP sonrası notlar)

Tek Docker imajı (api+worker), Next.js ayrı imaj. Yönetilen Postgres (PostGIS destekli) +
Redis. Migration'lar `prisma migrate deploy` ile, release öncesi tek seferlik job.
