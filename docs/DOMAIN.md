# LogiMatch — Domain Modeli ve İş Kuralları

> Durum: **onaylandı (2026-09-24)** · Kod İngilizce, Türkçe iş terimleri enum/alan adlarında korunur.
> Prompt'ta verilen alan listeleri esastır; bu doküman onları **tamamlar** (➕ ile işaretli alanlar
> prompt'a eklenen alanlardır) ve kuralları kesinleştirir.

## 1. Sözlük

| Terim                 | Anlamı                                                                                        | Kodda                                           |
| --------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Yük veren / işveren   | Taşınacak yükü olan firma                                                                     | `Shipper`, `Company.type=SHIPPER`               |
| Taşıyıcı              | Nakliye firması veya öz mal sahibi                                                            | `Carrier`, `Company.type=CARRIER`               |
| Öz mal sahibi         | Tek araçlı, aracın sahibi aynı zamanda şoför                                                  | Carrier + Driver aynı `User`                    |
| Çekici                | Tır'ın motorlu önü                                                                            | `Vehicle.type=TRACTOR`                          |
| Dorse                 | Çekilen yük taşıyıcı römork                                                                   | `Trailer`                                       |
| Kamyon / kırkayak     | Kendinden kasalı araç                                                                         | `Vehicle.type=TRUCK` (+ sanal dorse, bkz. §3.3) |
| Yük ilanı             | Taşınacak iş                                                                                  | `Load`                                          |
| Boş araç ilanı        | Müsaitlik bildirimi                                                                           | `TruckPosting`                                  |
| Boş km (deadhead)     | Aracın yükleme noktasına yüksüz gidişi                                                        | `deadheadKm`                                    |
| Dönüş yükü (backhaul) | Aracı eve/istediği yöne götüren yük                                                           | `routeFitScore` bonusu                          |
| LDM                   | Loading meter — dorse boyunda kaplanan metre                                                  | `loadingMeters`                                 |
| İrsaliye              | Sevk irsaliyesi                                                                               | `DocumentType.IRSALIYE` ➕                      |
| POD                   | Teslim kanıtı (imzalı irsaliye/CMR)                                                           | `DocumentType.POD` ➕                           |
| CMR                   | Uluslararası karayolu taşıma senedi                                                           | `DocumentType.CMR` ➕                           |
| Tevkifat              | KDV'nin bir kısmının alıcı tarafından kesilip vergi dairesine ödenmesi                        | `withholding*`                                  |
| Yetki belgesi         | K1, L1, C2, R1… UAB taşımacılık yetkileri                                                     | `DocumentType`                                  |
| SRC                   | Mesleki yeterlilik belgesi (SRC3 uluslararası eşya, SRC4 yurt içi eşya, SRC5 tehlikeli madde) | `DocumentType`, `Driver.srcTypes`               |
| Take rate             | Platformun GMV'den aldığı pay                                                                 | `PricingConfig.commissionRate`                  |

## 2. Aktörler ve roller

| Platform rolü (`User.role`) | Kim                      | Temel yetenek                                                  |
| --------------------------- | ------------------------ | -------------------------------------------------------------- |
| `SHIPPER_USER`              | Yük veren firma çalışanı | Load CRUD, eşleşme/teklif, sevkiyat onayı, değerlendirme       |
| `CARRIER_USER`              | Taşıyıcı firma çalışanı  | Filo, TruckPosting, eşleşme/teklif, sevkiyat durumu            |
| `DRIVER`                    | Şoför                    | Kendisine atanmış sevkiyatın durumunu ve belgelerini günceller |
| `ADMIN`                     | Platform yöneticisi      | Her şey + config tabloları                                     |
| `OPS`                       | Operasyon                | Doğrulama, uyuşmazlık, manuel müdahale; config değiştiremez    |

`Company.type = BOTH` olan firmanın kullanıcısı iki paneli de görür; platform rolü o zaman
ana kullanım amacını gösterir, **asıl yetki firma üyeliğinden** gelir.

Firma içi rol (`CompanyMember.companyRole`):

| Aksiyon                           | OWNER | MANAGER | DISPATCHER | ACCOUNTANT |
| --------------------------------- | :---: | :-----: | :--------: | :--------: |
| Üye yönetimi, IBAN, firma bilgisi |   ✓   |    –    |     –      |     –      |
| İlan oluştur/yayınla/iptal        |   ✓   |    ✓    |     ✓      |     –      |
| Teklif ver / kabul et             |   ✓   |    ✓    |     ✓      |     –      |
| Sevkiyat iptali                   |   ✓   |    ✓    |     –      |     –      |
| Settlement / fatura taslağı       |   ✓   |    ✓    |     –      |     ✓      |
| Filo ve belge yönetimi            |   ✓   |    ✓    |     ✓      |     –      |

## 3. Varlıklar

Tüm tablolarda: `id` (UUID v7 — zaman sıralı), `createdAt`, `updatedAt`. Silinebilenlerde
`deletedAt`. Kilitlenen varlıklarda `version`.

### 3.1 Kimlik ve organizasyon

**User** — prompt alanları + ➕ `fullName`, ➕ `locale (tr|en)`, ➕ `anonymizedAt`,
➕ `failedLoginCount`, ➕ `lockedUntil`. `email` citext unique, `phone` E.164 unique.

**Company** — prompt alanları + ➕ `status (ACTIVE|UNDER_REVIEW|SUSPENDED)`,
➕ `country` (varsayılan TR), ➕ `phone`, ➕ `email`, ➕ `listingsReviewedCount` (ilk 3 ilan
moderasyonu için), ➕ uyumluluk önbelleği (`complianceValidUntil`, `intlValidUntil`).

- `taxNumber` **unique değil** — aynı VKN ile ikinci firma engellenmez, `RiskFlag` açılır (#15).
- `verificationStatus`: `UNVERIFIED → PENDING → VERIFIED | REJECTED`.
  Doğrulanmamış firma ilan yayınlayamaz, eşleştirmeye giremez.

**CompanyMember** — (`userId`, `companyId`) unique; `companyRole`; `invitedBy`; `acceptedAt`.

**Document** — prompt alanları; `ownerType` ➕ `TRAILER`, ➕ `SHIPMENT` eklenir.
➕ `ownerId`, ➕ `mimeType`, ➕ `sizeBytes`, ➕ `checksumSha256`, ➕ `reviewedAt`,
➕ `supersedesId` (yenilenen belge eskisini devralır).

`DocumentType` = prompt listesi + ➕ `ATP_CERTIFICATE` (frigo ATP), ➕ `IRSALIYE`, ➕ `POD`,
➕ `CMR`, ➕ `PASSPORT`, ➕ `VISA`, ➕ `OTHER`.

**RequiredDocumentRule** ➕ (config) — hangi sahip tipinin hangi kapsamda hangi belgeleri
taşıması gerektiği. `ownerType`, `scope (DOMESTIC|INTERNATIONAL|ADR|TEMP_CONTROLLED)`,
`anyOf DocumentType[]` (grup içinden en az biri APPROVED ve geçerli). Varsayılan set:

| Sahip           | Kapsam                      | Gerekli (her satır bir `anyOf` grubu)                                                                          |
| --------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Carrier Company | DOMESTIC                    | TAX_CERTIFICATE · SIGNATURE_CIRCULAR · ACTIVITY_CERTIFICATE · {K1, L1, L2, C2, C3, R1, R2} · CARRIER_LIABILITY |
| Carrier Company | INTERNATIONAL               | {C2, C3, L2, R1}                                                                                               |
| Shipper Company | —                           | TAX_CERTIFICATE · SIGNATURE_CIRCULAR                                                                           |
| Vehicle         | DOMESTIC                    | VEHICLE_LICENSE · INSPECTION                                                                                   |
| Vehicle         | INTERNATIONAL               | CMR_INSURANCE                                                                                                  |
| Trailer         | DOMESTIC                    | VEHICLE_LICENSE · INSPECTION                                                                                   |
| Trailer         | TEMP_CONTROLLED (FRIGO_ATP) | ATP_CERTIFICATE                                                                                                |
| Driver          | DOMESTIC                    | DRIVING_LICENSE · PSIKOTEKNIK · {SRC3, SRC4}                                                                   |
| Driver          | INTERNATIONAL               | SRC3 · PASSPORT                                                                                                |
| Driver          | ADR                         | {ADR_CERTIFICATE, SRC5}                                                                                        |

> ⚠️ Yetki belgesi sınıflarının hangi faaliyeti kapsadığı hukuken teyit edilmeli; tablo config
> olduğu için kod değişmeden düzeltilebilir. K2 (kendi yükü) ve K3 (ev eşyası) ticari yük için
> kabul edilmez.

### 3.2 Risk ve moderasyon ➕

**RiskFlag** — `type (DUPLICATE_TAX_NUMBER|DUPLICATE_PHONE|DUPLICATE_IBAN|CONTACT_LEAK|
NO_SHOW_STREAK|LISTING_REVIEW|PRICE_ANOMALY)`, `entityType`, `entityId`, `companyId`,
`details jsonb`, `status (OPEN|RESOLVED|DISMISSED)`, `resolvedBy`, `resolution`.
Admin kuyruğunun tek kaynağı.

**BlockList** — `blockerCompanyId`, `blockedCompanyId`, `reason`; unique çift.
Eşleştirmede **iki yönlü** kontrol edilir.

### 3.3 Filo

**Vehicle** — prompt alanları + ➕ `plateNormalized` (unique, boşluksuz), ➕ `complianceValidUntil`.
**Trailer** — prompt alanları + ➕ `carrierCompanyId`, ➕ `plateNormalized`, ➕ `status`,
➕ `complianceValidUntil`, ➕ `adrValidUntil`.
Kendinden kasalı kamyon/van için kasa bilgisi yine `Trailer` kaydı olarak tutulur
(`isIntegratedBody = true` ➕, aynı plaka). Böylece eşleştirme tek bir "yük taşıyan birim" modeli
görür.

**Driver** — prompt alanları + ➕ `phone`, ➕ `passportNumber` (şifreli), ➕ `complianceValidUntil`,
➕ `adrValidUntil`, ➕ `intlValidUntil`. `visaCountries[]` ISO ülke kodu veya grup kodu
(`SCHENGEN`, `GB` …) içerir.

### 3.4 Load (yük ilanı)

Prompt alanları + şunlar:

| Alan                                                       | Açıklama                                       |
| ---------------------------------------------------------- | ---------------------------------------------- |
| ➕ `shipperCompanyId`, `createdByUserId`                   | sahiplik                                       |
| ➕ `pickupCountry`, `deliveryCountry`                      | ISO-3166 alfa-2                                |
| ➕ `maxPieceLengthCm/WidthCm/HeightCm`                     | en büyük parçanın boyutu (boyut filtresi için) |
| ➕ `routeDistanceKm`, `routeDurationMin`, `routeStatus (OK | ROUTE_NOT_FOUND                                | PENDING)`    | yayında IRoutingProvider ile hesaplanır |
| ➕ `estimatedPriceMin/Max`                                 | bütçe yoksa priceFit için referans             |
| ➕ `geocodeStatus (OK                                      | FAILED                                         | MANUAL_PIN)` | #20                                     |
| ➕ `moderationStatus (NOT_REQUIRED                         | PENDING_REVIEW                                 | APPROVED     | REJECTED)`                              | #16 (bkz. ASSUMPTIONS) |
| ➕ `invitedCarrierCompanyIds[]`                            | `visibility=INVITED_ONLY` için                 |
| ➕ `cancelledAt`, `cancellationReason`                     |                                                |
| ➕ `version`                                               | optimistic lock                                |

**LoadStop** — `loadId`, `sequence`, `type (PICKUP|DELIVERY)`, adres + `location`, pencere,
➕ `weightKg`, `volumeM3`, `loadingMeters`, `palletCount` (o durakta alınan/bırakılan miktar).
Ana pickup/delivery alanları ilk PICKUP ve son DELIVERY durağının kopyasıdır (sorgu kolaylığı);
tek duraklı yükte `stops[]` bu iki kayıttan oluşur. Durak miktarlarının toplamı Load toplamına eşit
olmalı (validasyon).

`referenceNo`: `LD-{YYYY}-{6 hane}`, `ReferenceCounter(prefix, year)` satırı üzerinden tx içinde
üretilir. Aynı desen: `TP-` (posting), `SH-` (shipment), `INV-` (fatura).

### 3.5 TruckPosting

Prompt alanları + ➕ `carrierCompanyId`, ➕ `referenceNo`, ➕ `originCity/Country`,
➕ `version`, ➕ `publishedAt`. `preferredDestinations[]` = `{countryCode, cityCode?}` jsonb dizisi

- arama için türetilmiş `preferredCityCodes text[]` (GIN).
  Aynı araç için aynı anda en fazla bir `ACTIVE` posting (partial unique index).

### 3.6 Eşleştirme ve anlaşma

**Match** — prompt alanları + ➕ `deadheadKm`, ➕ `shipperInterestAt`, ➕ `carrierInterestAt`,
➕ `dismissedBy`, `dismissReason`, ➕ `matchingConfigVersion`, ➕ `version`.
Unique (`loadId`, `truckPostingId`).

**Offer** — prompt alanları + ➕ `offeredByCompanyId`, `offeredByUserId`, ➕ `respondedAt`,
➕ `aboveBudgetWarning` (bool, #12), ➕ `version`. `amount` = KDV hariç navlun bedeli, Load
para biriminde. Bir Match'te aynı anda en fazla **bir** `PENDING` offer (partial unique index).

**Shipment** — prompt alanları + ➕ `matchId`, `acceptedOfferId`, ➕ `shipperCompanyId`,
➕ `referenceNo`, ➕ `currency`, ➕ `commissionModel`, `commissionPayer`, ➕ `pricingConfigId`,
➕ `lockedFxRate` + `lockedFxRateAt` (#24), ➕ `vatRate`, `withholdingApplies`, `withholdingRatio`
(kabul anında kilitlenir), ➕ `assignmentPeriod tstzrange`, ➕ `plannedPickupAt`,
`plannedDeliveryAt`, ➕ `deadheadKm`, ➕ `cancellationFeePayer`, ➕ `version`.

**ShipmentEvent** — `shipmentId`, `type` (durum geçişleri + `DEPARTED_TO_PICKUP`, `NOTE`,
`DOCUMENT_ADDED`, `DELAY_REPORTED`), `fromStatus`, `toStatus`, `actorUserId`, `actorRole`,
`occurredAt`, `location geography`, `payload jsonb`. Append-only.

**Rating** — prompt alanları; boyutlar 1-5, nullable (carrier → shipper değerlendirmesinde
`cargoCare` yoktur). Unique (`shipmentId`, `raterCompanyId`). Çift kör: her iki taraf gönderene
veya 14 gün dolana kadar karşı taraf göremez.

**Conversation** — `contextType (MATCH|SHIPMENT)`, `contextId`, katılımcı firmalar.
**Message** — `conversationId`, `senderUserId`, `body` (maskelenmiş, gösterilen),
`bodyOriginal` (yalnızca admin), `contactMasked`, `flagged`, `readAt`.

**Invoice** — `shipmentId`, ➕ `kind (TRANSPORT|COMMISSION|CANCELLATION_FEE)`,
➕ `issuerCompanyId`/`issuerIsPlatform`, ➕ `recipientCompanyId`, `subtotal`, `vatRate`,
`vatAmount`, `withholdingRatio`, `withholdingAmount`, `total`, `payableAmount`, `currency`,
`status`, ➕ `number`, ➕ `lines jsonb`.

**Notification** — prompt alanları + ➕ `dedupKey`, ➕ `status (QUEUED|SENT|FAILED|DEAD)`,
➕ `attempts`, ➕ `lastError`.

**AuditLog**, **BlockList** — prompt'taki gibi.

### 3.7 Konfigürasyon tabloları (hepsi versiyonlu, satırlar değişmez)

Her config tablosu `effectiveFrom` ile sürümlenir; yeni değer = yeni satır. Kilitlenen kayıtlar
(Shipment) kullandıkları satırın id'sini tutar.

| Tablo                  | İçerik                                                                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PricingConfig`        | `commissionModel`, `commissionRate` (0.10), `splitShipperShare` (0.5), `vatRate` (0.20), `withholdingRatio` (0.2 = 2/10), `withholdingThreshold` + para birimi, `minCommission`, `commissionOnCancellationFee` (bool) |
| `MatchingConfig`       | 7 ağırlık, `threshold` (40), `topN` (20), `roadFactor` (1.25), `avgTruckSpeedKmh` (65), `candidateLimit` (500), alt-skor parametreleri                                                                                |
| `CancellationPolicy`   | kademeler: `minHoursBeforePickup`, `maxHoursBeforePickup`, `feeRatio`, `appliesAtStatus`, `deadheadCompensation` (bool), `deadheadRatePerKm`                                                                          |
| `ExchangeRate`         | `base`, `quote`, `rate Decimal(18,8)`, `source`, `effectiveAt`                                                                                                                                                        |
| `RequiredDocumentRule` | §3.1                                                                                                                                                                                                                  |
| `CountryRule` ➕       | `countryCode`, `visaGroup` (ör. DE/BG/RO → `SCHENGEN`), `vatExemptInternational`                                                                                                                                      |

### 3.8 Altyapı tabloları ➕

`RefreshToken`, `IdempotencyRecord`, `OutboxEvent`, `ReferenceCounter`, `CompanyStats`
(tamamlanan/iptal/no-show sayıları, rating ortalamaları, `consecutiveNoShows`),
`CompanyPairStats` (iki firma arasındaki geçmiş), `OtpChallenge` (telefon/e-posta doğrulama).

## 4. Durum makineleri

Tümü `packages/shared/src/state-machines/*.ts` içinde **veri olarak** tanımlanır:
`{ from, to, event, allowedActors[], guard? }`. Servisler `transition(machine, current, event, ctx)`
çağırır; tanımda olmayan geçiş → `409 INVALID_STATE_TRANSITION`. Web aynı tanımdan buton
görünürlüğünü hesaplar.

### 4.1 Load

```
DRAFT ──publish──► PUBLISHED ──first match──► MATCHING ──first offer──► OFFERED
                      ▲  ▲                        │  ▲                      │
                      │  └──── all matches gone ──┘  └── all offers closed ─┘
                      │                                                     │ offer accepted
   carrier cancel     │                                                     ▼
   (pencere açıksa) ──┴────────────────────────────────────────────────── ASSIGNED
                                                                            │ shipment LOADED
                                                                            ▼
                                            IN_TRANSIT ──shipment DELIVERED──► DELIVERED
                                                                            │ shipment COMPLETED
                                                                            ▼
                                                                         COMPLETED
Açık durumlar {PUBLISHED, MATCHING, OFFERED} → CANCELLED (shipper) | EXPIRED (expiresAt)
ASSIGNED → CANCELLED (shipper iptali, ceza politikası çalışır)
```

- "Açık" durumlar = eşleştirmeye ve teklife açık. Hard filtre #8 bu kümeyi kullanır.
- `ASSIGNED` sonrası Load durumu Shipment'tan türetilir; doğrudan değiştirilemez.
- Yayınlama ön koşulları: firma VERIFIED + ACTIVE, `geocodeStatus ∈ {OK, MANUAL_PIN}`,
  pencereler geçerli (`start < end`, pickup geçmişte değil), moderasyon gerekiyorsa
  `PENDING_REVIEW` (eşleştirme onaya kadar çalışmaz).
- Yayındaki Load güncellenirse: kritik alan (rota, pencere, kapasite, dorse, ADR, sıcaklık)
  değişikliğinde `PENDING` teklifler `WITHDRAWN` (sebep: `LOAD_CHANGED`) ve `recompute`.

### 4.2 TruckPosting

```
DRAFT ──publish──► ACTIVE ──offer accepted──► RESERVED ──shipment COMPLETED/CANCELLED──► (bitti)
                     │                           │
                     │                           └─ shipment carrier-dışı iptal + availableUntil > now → ACTIVE
                     ├── availableUntil geçti ──► EXPIRED
                     └── carrier cancel ────────► CANCELLED
```

➕ `DRAFT` durumu eklendi (prompt'taki `POST /truck-postings/:id/publish` ucu bunu gerektiriyor).

### 4.3 Match

```
SUGGESTED ──ilk görüntülenme──► VIEWED
SUGGESTED|VIEWED ──shipper interest──► INTERESTED_BY_SHIPPER ──carrier interest──► MUTUAL
SUGGESTED|VIEWED ──carrier interest──► INTERESTED_BY_CARRIER ──shipper interest──► MUTUAL
herhangi açık durum ──interest=false / dismiss──► DISMISSED
herhangi açık durum ──ilan kapandı / başka match sevkiyata dönüştü / recompute'ta aday değil──► EXPIRED
```

- `MUTUAL` → Conversation açılır (iletişim **maskeli**), teklif akışı açılır.
- Recompute, `SUGGESTED`/`VIEWED` dışındaki eşleşmelere dokunmaz (kullanıcı ilgisi korunur),
  yalnızca hard filtreyi artık geçemiyorlarsa `EXPIRED` yapar.
- `direction`: sistem bulduysa `SYSTEM`; shipper yük panosundan bir posting'e / carrier yük
  panosundan bir Load'a ilgi gösterirse o anda Match oluşturulur (`LOAD_INITIATED` /
  `TRUCK_INITIATED`). Manuel eşleşmede hard filtreler **yine uygulanır**, eşik uygulanmaz.

### 4.4 Offer

```
PENDING ──alıcı kabul──► ACCEPTED   (→ Shipment)
PENDING ──alıcı ret────► REJECTED
PENDING ──alıcı karşı teklif──► COUNTERED (+ yeni PENDING offer, round+1, parentOfferId)
PENDING ──veren geri çeker──► WITHDRAWN
PENDING ──validUntil (delayed job)──► EXPIRED
```

- Yalnızca `MUTUAL` Match'te teklif verilebilir. İlk teklifi iki taraf da verebilir.
- `round` 1'den başlar; `round = 5` teklif karşı teklif alamaz, yalnızca kabul/ret (#11).
  Ret sonrası Match `DISMISSED` (`reason = NEGOTIATION_FAILED`).
- `pricingMode = FIXED` ise: MUTUAL olunca sistem shipper adına `amount = budgetMax` teklifi açar;
  karşı teklif kapalı, carrier yalnızca kabul/ret eder.
- `amount > budgetMax × (1 + 0.15)` → teklif oluşturulur, `aboveBudgetWarning = true`, UI uyarır (#12).
- `validUntil`: varsayılan 24 saat, en fazla pickupWindowStart'a kadar.

### 4.5 Shipment

```
ASSIGNED ─► AT_PICKUP ─► LOADED ─► IN_TRANSIT ─► AT_DELIVERY ─► DELIVERED ─► POD_SUBMITTED ─► COMPLETED
    │           │                                                   │              │
    └─► CANCELLED ◄┘                                                 └──► DISPUTED ◄┘
                                                               DISPUTED ──ops resolve──► COMPLETED | CANCELLED
```

| Geçiş                                                                | Kim                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| ASSIGNED → AT_PICKUP → LOADED → IN_TRANSIT → AT_DELIVERY → DELIVERED | carrier kullanıcısı veya atanmış şoför                 |
| DELIVERED → POD_SUBMITTED                                            | carrier/şoför (POD belgesi zorunlu)                    |
| POD_SUBMITTED → COMPLETED                                            | shipper onayı **veya** 72 saat itirazsız (delayed job) |
| → CANCELLED (ASSIGNED, AT_PICKUP)                                    | shipper veya carrier (OWNER/MANAGER), ops              |
| DELIVERED/POD_SUBMITTED → DISPUTED                                   | shipper veya carrier                                   |
| DISPUTED → COMPLETED/CANCELLED                                       | yalnızca ops/admin                                     |

LOADED sonrası iptal yok; sorun uyuşmazlık akışıyla çözülür. Her geçiş bir `ShipmentEvent` yazar.

### 4.6 Document

`PENDING → APPROVED | REJECTED`; `APPROVED → EXPIRED` (tarama job'ı). Yenilenen belge yeni
kayıt olarak `PENDING` başlar, onaylanınca eskisini `supersedesId` ile devralır.

### 4.7 Company

`verificationStatus`: `UNVERIFIED → PENDING → VERIFIED | REJECTED`.
`status`: `ACTIVE ⇄ UNDER_REVIEW`, `ACTIVE|UNDER_REVIEW → SUSPENDED`, `SUSPENDED → ACTIVE` (admin).
`UNDER_REVIEW`/`SUSPENDED` firmanın ACTIVE ilanları durdurulur (Load'lar eşleştirmeden düşer,
TruckPosting'ler `CANCELLED` değil askıda — `pausedAt` ➕).

## 5. Ana akış (uçtan uca)

1. Shipper Load'u DRAFT oluşturur → geocode + routing → `pricing/estimate` önizlemesi.
2. Publish → (moderasyon gerekmiyorsa) `PUBLISHED`, outbox → `match.compute`.
3. Worker ilk 20 uygun TruckPosting'i `Match(SUGGESTED)` olarak yazar, Load → `MATCHING`,
   her iki tarafa bildirim.
4. Taraflar ilgi bildirir → `MUTUAL` → maskeli sohbet + teklif.
5. Pazarlık (≤5 tur). Kabul tx'i (§8):
   Offer `ACCEPTED`, Shipment oluşur (komisyon, KDV, tevkifat oranı, kur **kilitlenir**),
   Load `ASSIGNED`, TruckPosting `RESERVED`, diğer açık Match/Offer'lar `EXPIRED`/`WITHDRAWN`,
   iletişim açılır, shipment conversation açılır.
6. Carrier durumları ilerletir, POD yükler → shipper onaylar → `COMPLETED`.
7. Settlement + fatura taslakları hesaplanır; iki taraf 14 gün içinde değerlendirir;
   `CompanyStats`/`CompanyPairStats` güncellenir.

## 6. Eşleştirme motoru

Kod: `apps/api/src/matching/domain/` — saf fonksiyonlar:
`evaluateHardFilters(load, candidate, ctx) → {pass, failures[]}` ve
`scoreMatch(load, candidate, ctx, config) → {score, breakdown}`.
`candidate` = posting + vehicle + trailer + driver + company + önceden hesaplanmış istatistikler.

### 6.1 Türetilen değerler

- `deadheadKm = haversine(posting.origin, load.pickup) × roadFactor`
- `etaToPickup = availableFromEff + deadheadKm / avgTruckSpeedKmh + mola`
  (`availableFromEff = max(posting.availableFrom, now)`; mola: her 4,5 saat sürüşe 45 dk)
- `earliestArrival = max(etaToPickup, load.pickupWindowStart)`
- `peakCargo` = çok duraklıda durak sırasına göre araçtaki kümülatif maksimum (ağırlık, hacim, LDM, palet)

### 6.2 Hard filtreler (hepsi geçmeli; başarısız olan `failures[]`'a kodla yazılır)

| #     | Kod               | Kural                                                                                                                                                                                                                                                                         |
| ----- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `TRAILER_TYPE`    | `trailer.trailerType ∈ load.requiredTrailerTypes`; `load.requiredFeatures ⊆ trailer.features`                                                                                                                                                                                 |
| 2     | `CAPACITY`        | `peakCargo.weightKg ≤ capacityKg`, `volumeM3 ≤ volumeM3`, `loadingMeters ≤ loadingMeters`, `palletCount ≤ palletCapacity` (IND palet ≈ EUR × 0,8); en büyük parça: `height ≤ heightCm` ve (L,W) (L,W) veya (W,L) olarak sığar. Yük tarafında null olan boyut kontrol edilmez. |
| 3     | `TIME_WINDOW`     | `[availableFrom, availableUntil) ∩ [pickupStart, pickupEnd) ≠ ∅` **ve** `earliestArrival < pickupEnd` **ve** `earliestArrival < availableUntil`                                                                                                                               |
| 4     | `ADR`             | `load.isAdr` ⇒ `posting.acceptsAdr` ∧ `ADR ∈ trailer.features` ∧ `load.adrClass ∈ driver.adrClasses` ∧ `driver.adrValidUntil > deliveryWindowEnd` ∧ `trailer.adrValidUntil > deliveryWindowEnd`                                                                               |
| 5     | `TEMPERATURE`     | `load.requiresTempControl` ⇒ `TEMP_CONTROLLED ∈ features` ∧ `trailer.minTempC ≤ load.minTempC` ∧ `trailer.maxTempC ≥ load.maxTempC`                                                                                                                                           |
| 6     | `DOCUMENTS`       | company, vehicle, trailer, driver `complianceValidUntil > load.deliveryWindowEnd`                                                                                                                                                                                             |
| 7     | `INTERNATIONAL`   | `scope = INTERNATIONAL` ⇒ `posting.acceptsInternational` ∧ `company.intlValidUntil`, `driver.intlValidUntil` (pasaport + SRC3) `> deliveryWindowEnd` ∧ yurt dışı uçtaki ülkenin `visaGroup`'u `driver.visaCountries` içinde                                                   |
| 8     | `STATUS`          | Load açık durumda ve moderasyonu tamam; posting `ACTIVE` ve `pausedAt = null`; iki firma `ACTIVE` + `VERIFIED`; vehicle/trailer `ACTIVE`, driver aktif                                                                                                                        |
| 9     | `BLOCKED`         | iki yönde BlockList kaydı yok; `visibility = INVITED_ONLY` ise carrier davetli                                                                                                                                                                                                |
| 10    | `DEADHEAD`        | `deadheadKm ≤ posting.maxDeadheadKm`                                                                                                                                                                                                                                          |
| 11 ➕ | `SELF_DEALING`    | `load.shipperCompanyId ≠ posting.carrierCompanyId` (#14)                                                                                                                                                                                                                      |
| 12 ➕ | `ROUTE_DEVIATION` | Yalnızca `maxRouteDeviationKm` ve `preferredDestinations` doluysa: koridor = posting origin → teslim noktasına en yakın tercih edilen destinasyon doğru parçası; teslim noktasının bu parçaya dik uzaklığı `× roadFactor ≤ maxRouteDeviationKm`                               |

Filtre 1, 2 (basit kısmı), 3 (basit kısmı), 8, 9, 10 (yaklaşık), 11 SQL ön-elemede de uygulanır;
JS katmanı hepsini **tekrar** ve kesin olarak uygular (tek doğruluk kaynağı JS).

### 6.3 Skorlama (0–100)

`score = Σ wᵢ · sᵢ`, ağırlıklar `MatchingConfig`'ten (toplamı 1,00 olmalı — config validasyonu).
Tüm alt skorlar `[0, 100]`'e kırpılır, `score` 2 ondalığa yuvarlanır.

| Alt skor       | w    | Formül                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proximity`    | 0,25 | `100 · (1 − deadheadKm / maxDeadheadKm)`; `maxDeadheadKm = 0` ise 100                                                                                                                                                                                                                                                                                             |
| `routeFit`     | 0,20 | Tercih yoksa **50**. Teslim ili tercih listesinde → 100; yalnızca ülke tercihi ve ülke eşleşiyor → 100; değilse en yakın tercih edilen merkeze uzaklık `d`: `80 · max(0, 1 − d / 300)`. **Backhaul bonusu**: teslim noktası sürücünün `homeBaseLocation`'ına (yoksa firma iline) ≤ 100 km → +20                                                                   |
| `priceFit`     | 0,15 | `floor = minPricePerKm · routeDistanceKm` (Load para birimine çevrilmiş). Aralık `[lo, hi]` = FIXED ise `[budgetMax, budgetMax]`, değilse `[budgetMin, budgetMax]`, bütçe yoksa `[estimatedPriceMin, estimatedPriceMax]`. `floor ≤ lo` → 100; `lo < floor ≤ hi` → 100 → 50 lineer; `hi < floor ≤ 1,15·hi` → 50 → 0 lineer; üstü → 0. `minPricePerKm` yoksa **75** |
| `reliability`  | 0,15 | Bayes puan `R = (n·avg + m·C)/(n + m)`, `m = 5`, `C = 3,5`; `ratingPart = (R − 1)/4 · 100`. Tamamlama `p = (completed + 2·0,8)/(completed + carrierCancelled + noShow + 2)`. `s = 0,6·ratingPart + 0,4·100·p − 10·noShow₉₀ − 5·carrierCancel₉₀`                                                                                                                   |
| `timeFit`      | 0,10 | `overlap =                                                                                                                                                                                                                                                                                                                                                        | [earliestArrival, min(availableUntil, pickupEnd)) | /   | [pickupStart, pickupEnd) | `→`100 · overlap` |
| `equipmentFit` | 0,08 | `util = max(weight/cap, volume/vol, ldm/ldm)` (null olanlar hariç). `util ≥ 0,7` → 100; değilse `100 · util / 0,7`, taban 10; `acceptsPartialLoad` ise taban 50                                                                                                                                                                                                   |
| `history`      | 0,07 | İki firma arası sorunsuz tamamlanmış sevkiyat (shipper puanı ≥ 4, uyuşmazlık yok) `n`: 0 → 0, 1 → 60, 2 → 80, ≥3 → 100. Son 12 ayda aralarında carrier aleyhine sonuçlanan uyuşmazlık → 0                                                                                                                                                                         |

- `score < threshold (40)` → saklanmaz. Load başına ilk `topN (20)`; eşitlikte `deadheadKm` küçük olan önde.
- `scoreBreakdown` jsonb: her alt skorun ham girdileri, değeri, ağırlığı, katkısı ve
  kullanıcıya gösterilecek açıklama anahtarları:
  ```json
  { "version": 3, "total": 78.4,
    "components": { "proximity": { "value": 88.0, "weight": 0.25, "contribution": 22.0,
                                   "inputs": { "deadheadKm": 36, "maxDeadheadKm": 300 } }, ... },
    "reasons": ["NEAR_PICKUP", "BACKHAUL_HOME", "PRICE_WITHIN_BUDGET"] }
  ```
  `reasons` i18n anahtarlarıdır ("Yükleme noktasına 36 km", "Aracı eve döndürüyor").

### 6.4 Tetikleyiciler

| Olay                                       | İş                                           |
| ------------------------------------------ | -------------------------------------------- |
| Load publish / moderasyon onayı            | `match.compute(load)`                        |
| TruckPosting publish                       | `match.compute(posting)`                     |
| Load/Posting kritik alan güncellemesi      | `match.recompute(entity)` (debounce 30 sn)   |
| Belge onayı/süre dolumu, firma askıya alma | etkilenen aktif posting'ler için `recompute` |
| Admin `POST /admin/matches/recompute`      | seçili veya tüm açık ilanlar                 |

## 7. Fiyat, komisyon ve vergi

### 7.1 Value object'ler

- `Money { amount: Decimal, currency: TRY|EUR|USD }` — farklı para birimleriyle işlem hata fırlatır;
  her ara sonuç `ROUND_HALF_UP` ile 2 haneye yuvarlanır; toplamlar **yuvarlanmış kalemlerin toplamıdır**.
- `TimeWindow { start, end }` — yarı açık `[start, end)`; `overlaps`, `intersection`, `contains`.
- `Distance { meters }` — km/metre dönüşümü, `× roadFactor`.

### 7.2 Komisyon modelleri (`agreedAmount = G`, oran `r`, `C = round(G · r)`)

| Model          | Shipper öder (KDV hariç) | Carrier'a kalan (`carrierPayout`) | Komisyon faturası kime |
| -------------- | ------------------------ | --------------------------------- | ---------------------- |
| `CARRIER_PAYS` | G                        | G − C                             | carrier                |
| `SHIPPER_PAYS` | G + C                    | G                                 | shipper                |
| `SPLIT (s)`    | G + round(C·s)           | G − (C − round(C·s))              | ikisine ayrı ayrı      |

Prompt'taki varsayılan ("shipper'ın ödediği tutar üzerinden %10, carrier'a gross − commission")
bu tabloda **`CARRIER_PAYS`** satırına denk geliyor → **onay sorusu 1**.
`minCommission` varsa `C = max(C, minCommission)`.

### 7.3 KDV ve tevkifat (navlun faturası: carrier → shipper)

```
subtotal        = G
vatAmount       = round(G · vatRate)                          vatRate = 0,20 (yurt içi)
withholding     = withholdingApplies ∧ (subtotal + vat) ≥ threshold
                    ? round(vatAmount · withholdingRatio)     withholdingRatio = 0,2 (2/10)
                    : 0
total           = subtotal + vatAmount
payableToCarrier = total − withholding   (tevkifat tutarını shipper vergi dairesine öder)
```

- `withholdingApplies` Load'da shipper tarafından işaretlenir (alıcının tevkifat yükümlüsü olup
  olmadığını ancak alıcı bilir); kabul anında Shipment'a kilitlenir.
- `transportScope = INTERNATIONAL` → navlun faturasında KDV %0 (uluslararası taşıma istisnası),
  tevkifat 0 — `CountryRule.vatExemptInternational` ile config.
- Komisyon faturası (platform → ödeyen): KDV %20, tevkifat yok.

**Örnek** (yurt içi, G = 50.000,00 TRY, CARRIER_PAYS %10, tevkifat var):

| Kalem                                   |                              Tutar |
| --------------------------------------- | ---------------------------------: |
| Navlun (subtotal)                       |                          50.000,00 |
| KDV %20                                 |                          10.000,00 |
| Tevkifat 2/10                           |                           2.000,00 |
| Shipper → carrier ödemesi               |                          58.000,00 |
| Shipper → vergi dairesi                 |                           2.000,00 |
| Komisyon (carrier'a fatura)             | 5.000,00 + KDV 1.000,00 = 6.000,00 |
| `carrierPayout` (KDV hariç net hakediş) |                          45.000,00 |

### 7.4 Kilitleme (#26) ve kur (#24)

Kabul anında Shipment'a kopyalanır: `commissionModel`, `commissionRate`, `commissionAmount`,
`carrierPayout`, `vatRate`, `withholdingRatio`, `pricingConfigId`, `lockedFxRate` (Shipment para
birimi → TRY, `ExchangeRate`'teki en güncel ≤ 72 saatlik kayıt; yoksa kabul `503 FX_RATE_UNAVAILABLE`).
Settlement ve faturalar **yalnızca** kilitli alanlardan hesaplanır. TRY için kur = 1.

### 7.5 `POST /pricing/estimate`

`distanceKm/durationMin` IRoutingProvider'dan; `suggestedMin/Max = distanceKm × trailerType bazlı
TL/km bandı (config) × ağırlık/ADR/frigo/uluslararası çarpanları`. Rota bulunamazsa
`ROUTE_NOT_FOUND` ve öneri alanları `null` (manuel fiyat, #21).

## 8. Değişmezler ve kısıtlar

| Değişmez                                                            | Uygulandığı yer                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| (loadId, truckPostingId) tekil                                      | unique index                                                                                                                                |
| Match başına tek PENDING offer                                      | partial unique index                                                                                                                        |
| Bir TruckPosting tek Shipment'a gidebilir                           | kabul tx'i: optimistic lock + `RESERVED`                                                                                                    |
| Araç / dorse / şoför çakışan iki aktif sevkiyata atanamaz (#2)      | `EXCLUDE USING gist (vehicle_id WITH =, assignment_period WITH &&) WHERE (status <> 'CANCELLED')` — aynısı `trailer_id` ve `driver_id` için |
| `assignmentPeriod = [plannedPickupAt, plannedDeliveryAt + 12 saat)` | kabul tx'i                                                                                                                                  |
| Firma kendi yüküne kendi aracıyla teklif veremez                    | hard filtre 11 + teklif use-case'inde tekrar kontrol                                                                                        |
| Kabul edilmiş offer geri çekilemez (#13)                            | state machine                                                                                                                               |
| Mali kayıt silinmez                                                 | soft delete yok; append-only trigger                                                                                                        |
| Para asla float değil                                               | `Decimal(14,2)` + `Money`                                                                                                                   |
| `total = Σ kalemler`                                                | `Money` toplama kuralı + property-based test                                                                                                |

> "Bir carrier aynı tarih aralığında iki sevkiyata atanamaz" kuralı **araç, dorse ve şoför
> bazında** yorumlandı; çok araçlı firma aynı anda birden fazla sevkiyat yapabilmeli. Öz mal
> sahibinde tek araç olduğu için sonuç aynı. → ASSUMPTIONS.

## 9. İletişim maskeleme ve `contact_leak_detector` (#17)

Saf fonksiyon: `detectContactLeaks(text) → { findings: {type, span}[], masked: string }`.

1. **Normalizasyon** (yalnızca tespit için, çıktıya yansımaz): küçük harf, Türkçe sayı kelimeleri →
   rakam (`sıfır beş yüz otuz iki` → `0532`), `o/O` rakam bağlamında → `0`, rakam arası
   boşluk/nokta/tire/parantez silme, `@` varyantları (`[at]`, `(et)`, `at`).
2. **Desenler**:
   - TR cep: `(\+?90|0)?5\d{9}`; sabit hat: `(\+?90|0)?[2-4]\d{9}`; yabancı: `\+\d{10,14}`
   - e-posta (normalize edilmiş), IBAN `TR\d{24}`, URL/alan adı, `wa.me`, `t.me`
   - anahtar kelimeler: whatsapp, wp, telegram, "numaram", "beni ara", "dışarıdan", "komisyonsuz"
   - karşı tarafın maskeli **plakası / firma unvanı** geçerse
3. **Aksiyon** (iletişim henüz açık değilse, yani Shipment yoksa): eşleşen span `[gizlendi]` ile
   maskelenir, `contactMasked = true`, `flagged = true`, `RiskFlag(CONTACT_LEAK)` açılır, gönderene
   uyarı döner. Aynı firmada 30 günde 3 flag → firma `UNDER_REVIEW` önerisi (otomatik değil, ops).
4. Shipment sonrası tespit yapılmaz (iletişim zaten açık).

## 10. İptal, no-show ve tazminat

`CancellationPolicy` varsayılan kademeleri (taban = `agreedAmount`, zaman = `pickupWindowStart`'a kalan):

| Durum                        |             Ceza oranı |
| ---------------------------- | ---------------------: |
| ≥ 48 saat                    |                     %0 |
| 24–48 saat                   |                    %10 |
| < 24 saat (AT_PICKUP öncesi) |                    %25 |
| Shipment `AT_PICKUP`         | %50 + boş km tazminatı |

- **Shipper iptali** (#10): ceza carrier'a ödenir. Boş km tazminatı = `deadheadKm × deadheadRatePerKm`;
  `AT_PICKUP`'ta veya `< 24 saat` + `DEPARTED_TO_PICKUP` olayı varsa uygulanır.
  `commissionOnCancellationFee` açıksa platform kilitli oranla pay alır. Load → `CANCELLED`.
- **Carrier iptali**: ceza carrier'dan alınır (MVP'de yalnızca kayıt + ceza faturası taslağı),
  `CompanyStats.carrierCancelled++`. Pickup penceresi hâlâ açıksa Load → `PUBLISHED` ve recompute.
- **No-show** (#9): `pickupWindowEnd + 2 saat`te Shipment hâlâ `ASSIGNED` ise ops + shipper
  bildirimi; shipper "gelmedi" işaretler → `CANCELLED (cancelledBy=CARRIER, reason=NO_SHOW)`,
  ceza kademesi %25, `noShow++`, `consecutiveNoShows++`. `consecutiveNoShows = 3` →
  Company `UNDER_REVIEW` + `RiskFlag(NO_SHOW_STREAK)` + aktif posting'ler duraklatılır.
  Tamamlanan her sevkiyat `consecutiveNoShows`'u sıfırlar.
- Ops, mücbir sebepte cezayı sıfırlayabilir (`FORCE_MAJEURE`, AuditLog'lu).

## 11. Zaman kuralları (#4–#7)

- Saklama UTC `timestamptz`; API ISO-8601 `Z`'li döner; UI `Europe/Istanbul`'da gösterir.
  Kullanıcı girişi İstanbul saatiyle alınıp UTC'ye çevrilir (uluslararası uçlarda da; ASSUMPTIONS).
- Tüm pencereler `[start, end)`.
- Offer, Load, TruckPosting süre dolumları **delayed job**; job durumu yeniden okuyup yalnızca hâlâ
  açıksa kapatır (idempotent).
- Belge taraması günlük: `expiresAt - now ∈ {15, 7, 1} gün` → bildirim (dedupKey =
  `doc-expiry:{docId}:{gün}`); dolan belge `EXPIRED`, sahibi araç/dorse/şoför `INACTIVE`,
  uyumluluk önbelleği güncellenir. Aktif sevkiyat sırasında dolacak belgeler eşleştirmeye zaten
  giremez (filtre 6), ama sevkiyat sonrası yüklenen kısa süreli belge için de ops uyarılır.

## 12. KVKK (#19)

- `GET /me/export`: kullanıcının kişisel verileri (profil, üyelikler, mesajları, bildirimleri,
  audit kayıtları) JSON olarak.
- Anonimleştirme talebi: `User` alanları anonimleşir (`email = anon-{id}@deleted.invalid`,
  `phone/fullName = null`, `anonymizedAt`), oturumlar iptal. Mali kayıtlar (Shipment, Invoice,
  Offer, Rating) **silinmez**; kullanıcıya referansları kalır ama kişisel alanlar boştur. Firma
  kayıtları yasal saklama süresi (VUK, 10 yıl — ASSUMPTIONS) boyunca tutulur.

## 13. Uç durum → mekanizma haritası

| #   | Uç durum                           | Mekanizma                                                | Test                    |
| --- | ---------------------------------- | -------------------------------------------------------- | ----------------------- |
| 1   | Aynı posting'e eşzamanlı iki kabul | SERIALIZABLE + `version` → 409                           | yarış testi (gerçek DB) |
| 2   | Çakışan atama                      | `EXCLUDE USING gist` ×3                                  | DB kısıt testi          |
| 3   | Kabul sırasında yük iptali         | `FOR UPDATE` + tx içinde yeniden okuma                   | yarış testi             |
| 4   | Offer süresi                       | delayed job + uzlaştırma taraması                        | unit + entegrasyon      |
| 5   | İlan süresi                        | delayed job, eşleşmeler EXPIRED                          | entegrasyon             |
| 6   | UTC / `[start,end)`                | `TimeWindow`                                             | unit (sınır değerleri)  |
| 7   | Belge süresi                       | filtre 6 + günlük tarama                                 | unit + job testi        |
| 8   | Kademeli iptal                     | `CancellationPolicy` + saf hesap                         | tablo testi             |
| 9   | No-show serisi                     | `consecutiveNoShows`                                     | unit                    |
| 10  | Shipper iptali boş km              | §10                                                      | unit                    |
| 11  | 5 tur sınırı                       | state machine guard                                      | unit                    |
| 12  | Bütçe üstü teklif                  | `aboveBudgetWarning`                                     | unit                    |
| 13  | Kabul edilmişi geri çekme          | state machine                                            | unit                    |
| 14  | Kendi yüküne teklif                | filtre 11 + use-case                                     | unit + e2e              |
| 15  | Çoklu hesap                        | kayıt/güncellemede VKN/telefon/IBAN taraması → RiskFlag  | entegrasyon             |
| 16  | Sahte ilan                         | ilk 3 ilan `PENDING_REVIEW`                              | entegrasyon             |
| 17  | İletişim sızdırma                  | §9                                                       | tablo testi (50+ örnek) |
| 18  | Soft delete                        | Prisma extension + trigger                               | entegrasyon             |
| 19  | KVKK                               | §12                                                      | e2e                     |
| 20  | Geocoding hatası                   | `geocodeStatus=FAILED`, DRAFT'ta kalır, pin ister        | unit                    |
| 21  | Rota yok                           | `ROUTE_NOT_FOUND` → manuel fiyat                         | unit                    |
| 22  | Çok duraklı                        | durak bazlı mesafe + `peakCargo`                         | unit                    |
| 23  | Kısmi yük                          | `acceptsPartialLoad` → equipmentFit tabanı; tek yük/araç | unit                    |
| 24  | Kur kilidi                         | `lockedFxRate`                                           | unit                    |
| 25  | KDV/tevkifat                       | §7.3                                                     | tablo testi             |
| 26  | Komisyon kilidi                    | Shipment'a kopya                                         | entegrasyon             |
| 27  | Yuvarlama                          | `Money` HALF_UP, kalem toplamı                           | property-based test     |
| 28  | Bildirim retry                     | BullMQ 3 deneme + DLQ                                    | entegrasyon             |
| 29  | Bildirim dedup                     | Redis `SET NX EX 300`                                    | unit                    |
