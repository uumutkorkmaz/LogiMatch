# Varsayımlar

Her satır tek bir varsayım. `✅` = onaylanmış karar, `⚖️` = hukuki/mali teyit gerektiren.

## İş modeli

- ✅ (onaylandı) Prompt'taki varsayılan komisyon ("shipper'ın ödediği tutar üzerinden %10, carrier'a gross − commission") `CARRIER_PAYS` enum değeri olarak modellenir; `SHIPPER_PAYS` = komisyon shipper'a eklenir.
- ✅⚖️ (onaylandı, ileride değişebilir) Fatura modeli **acente**: navlun faturasını carrier doğrudan shipper'a keser, LogiMatch yalnızca komisyon faturası keser; MVP'de para platformdan geçmez.
- ⚖️ LogiMatch'in aracılık faaliyeti için kendisinin yetki belgesi (ör. R2/L sınıfı) alması gerekip gerekmediği hukukçuya teyit ettirilmeli.
- ⚖️ Yetki belgesi sınıflarının kapsamı (K1, L1/L2, C2/C3, R1/R2) ve zorunlu belge seti `RequiredDocumentRule` config'inde; varsayılan tablo DOMAIN §3.1'de, hukuki teyit gerekir.
- K2 (kendi yükü) ve K3 (ev eşyası) yetki belgeleri ticari yük taşımak için yeterli sayılmaz.
- SRC5 belgesi ADR yetkinliği için ADR_CERTIFICATE ile eşdeğer kabul edilir (config'te `anyOf`).

## Vergi ve para

- ⚖️ Nakliye tevkifat oranı 2/10, eşik değeri config (`withholdingThreshold`, varsayılan 12.000 TRY KDV dahil) — güncel tebliğle teyit edilmeli.
- ⚖️ Uluslararası taşımada navlun KDV'si %0 (KDV Kanunu 14. madde istisnası); tevkifat uygulanmaz.
- `withholdingApplies` bilgisini shipper verir (alıcının belirlenmiş alıcı olup olmadığını ancak kendisi bilir).
- Komisyon faturasına KDV %20 uygulanır, tevkifat uygulanmaz.
- Teklif tutarı KDV hariç navlun bedelidir ve Load'un para biriminde verilir; karışık para birimi MVP'de yok.
- Kabul anında 72 saatten eski kur yoksa kabul `503 FX_RATE_UNAVAILABLE` ile reddedilir; MVP'de kurlar seed/admin ile girilir.
- Mali kayıtların saklama süresi 10 yıl (VUK) kabul edildi.

## Eşleştirme

- Eşleştirmede deadhead = düz mesafe × `roadFactor` (1,25); gerçek routing yalnızca yayın/fiyat tahmini/kabulde çağrılır (800 ms hedefi için).
- Ortalama tır hızı 65 km/s, her 4,5 saat sürüşe 45 dk mola; ikisi de config.
- Hard filtre #8'deki "load.status = PUBLISHED" açık durumların tamamı olarak yorumlandı: {PUBLISHED, MATCHING, OFFERED}.
- Load durumları: MATCHING = en az bir açık Match var; OFFERED = en az bir PENDING Offer var.
- Eşleşme üst sınırı (20) hem Load başına hem TruckPosting başına ayrı uygulanır.
- Manuel (pano üzerinden) ilgi ile oluşan Match'e hard filtreler uygulanır, skor eşiği (40) uygulanmaz.
- `maxRouteDeviationKm` yalnızca posting'de tercih edilen destinasyon varsa hard filtre olarak çalışır.
- Tercih edilen destinasyonu olmayan posting'e routeFit = 50 (nötr) verilir.
- Hiç geçmişi olmayan carrier için reliability Bayes önceliği (ortalama 3,5 yıldız, %80 tamamlama) ile hesaplanır.
- `palletCapacity` EUR palet cinsindendir; IND palet kapasitesi = EUR × 0,8.
- Kendinden kasalı kamyon/van, `isIntegratedBody = true` işaretli bir Trailer kaydı olarak modellenir.
- Uluslararası vize kontrolü yalnızca çıkış/varış ülkesine bakar; transit ülkeler v2.
- Bulgaristan, Romanya ve Almanya `SCHENGEN` vize grubunda kabul edilir (`CountryRule` config).

## Akış

- ✅ (onaylandı) Prompt'taki `visibility: PENDING_REVIEW` yerine ayrı `moderationStatus` alanı kullanılır; `visibility` yalnızca PUBLIC/INVITED_ONLY kalır.
- ✅ (onaylandı) "Bir carrier aynı tarih aralığında iki sevkiyata atanamaz" kuralı araç, dorse ve şoför bazında uygulanır; çok araçlı firma paralel sevkiyat yapabilir.
- Sevkiyat atama aralığı = `[planlanan yükleme, planlanan teslim + 12 saat)`.
- TruckPosting'e `DRAFT` durumu eklendi (prompt'taki publish ucu bunu gerektiriyor).
- Match'te teklifi iki taraf da açabilir; FIXED fiyatlı yükte sistem shipper adına sabit fiyat teklifi açar, karşı teklif kapalı.
- Teklif varsayılan geçerliliği 24 saat, en geç pickupWindowStart.
- Bütçe üstü uyarı eşiği budgetMax + %15.
- POD_SUBMITTED sevkiyat 72 saat içinde itiraz edilmezse otomatik COMPLETED olur.
- LOADED sonrası iptal yok; uyuşmazlık akışı kullanılır.
- Carrier iptalinde pickup penceresi hâlâ açıksa Load yeniden PUBLISHED olur ve eşleştirme tekrar çalışır.
- Carrier iptal cezası MVP'de yalnızca kaydedilir ve ceza faturası taslağı üretilir; tahsilat v2.
- No-show sonrası 3 ardışık seri firmayı otomatik `UNDER_REVIEW`'a alır (tam askıya alma ops kararıdır).
- Değerlendirmeler çift kördür: iki taraf da gönderene veya 14 gün dolana kadar gizli.
- Kullanıcı tarih girişleri Europe/Istanbul saatiyle yorumlanır (uluslararası uçlar dahil).

## Teknik

- Next.js BFF deseni: token'lar httpOnly cookie'de, tarayıcı JS'i token görmez.
- `IFileStorage` interface'i entegrasyon listesine eklendi; MVP'de yerel disk + imzalı URL.
- Kimlikler UUID v7 (zaman sıralı).
- Referans numaraları (`LD-2026-000123`) yıl bazlı sayaç tablosu ile tx içinde üretilir, her yıl sıfırlanır.
- Domain event'leri transactional outbox ile kuyruğa aktarılır.
- zod v3 API'si kullanılır (nestjs-zod uyumluluğu için).
- Harita tile'ları OpenFreeMap'ten (API key yok).
- Geliştirme ortamında pnpm, corepack yetkisi olmadığından `npm i -g pnpm@9.15.0` ile kuruldu.
