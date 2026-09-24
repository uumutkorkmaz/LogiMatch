/**
 * Eşleştirme performans ölçümü (ARCHITECTURE §7.4): 10.000 aktif araç ilanında tek yük için
 * ön-eleme + skorlama + yazma süresi. Hedef p95 < 800 ms.
 *
 * Kullanım (TEST veritabanını siler!):
 *   DATABASE_URL=$DATABASE_URL_TEST node dist/seed/bench-matching.js [ilanSayısı]
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from '../app.module';
import { type Db, DB, type Prisma } from '../infra/prisma';
import { MatchingService } from '../matching/matching.service';
import { PlatformConfigService } from '../platform/platform-config.service';
import { DEFAULT_CANCELLATION_TIERS } from '../pricing/domain/cancellation';
import { DEFAULT_BANDS } from '../pricing/domain/estimate';

const N = Number(process.argv[2] ?? 10_000);
const RUNS = 7;

async function main() {
  if (!/test|bench/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Güvenlik: yalnızca adı test/bench içeren veritabanında çalışır');
  }
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error'] });
  const db = app.get<Db>(DB);
  const matching = app.get(MatchingService);

  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations','spatial_ref_sys')`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} CASCADE`);
  const from = new Date(Date.now() - 86_400_000);
  await db.pricingConfig.create({
    data: {
      effectiveFrom: from,
      commissionModel: 'CARRIER_PAYS',
      commissionRate: '0.1',
      vatRate: '0.2',
      commissionVatRate: '0.2',
      withholdingRatio: '0.2',
      withholdingThreshold: '12000',
      ratePerKmBands: DEFAULT_BANDS.perKm as Prisma.InputJsonValue,
      multipliers: DEFAULT_BANDS.multipliers as Prisma.InputJsonValue,
    },
  });
  await db.matchingConfig.create({
    data: {
      effectiveFrom: from,
      wProximity: 0.25,
      wRouteFit: 0.2,
      wPriceFit: 0.15,
      wReliability: 0.15,
      wTimeFit: 0.1,
      wEquipmentFit: 0.08,
      wHistory: 0.07,
      threshold: 40,
      topN: 20,
      roadFactor: 1.25,
      avgTruckSpeedKmh: 65,
      candidateLimit: 500,
    },
  });
  await db.cancellationPolicy.create({
    data: {
      effectiveFrom: from,
      tiers: DEFAULT_CANCELLATION_TIERS as unknown as Prisma.InputJsonValue,
      deadheadRatePerKm: '20',
    },
  });
  await db.exchangeRate.create({
    data: { base: 'EUR', quote: 'TRY', rate: '45', source: 'bench', effectiveAt: new Date() },
  });
  app.get(PlatformConfigService).invalidate();

  console.warn(`[bench] ${N} aktif araç ilanı üretiliyor…`);
  const t0 = Date.now();
  const companies = Math.max(50, Math.round(N / 50));
  const sql = `
    INSERT INTO "Company"(id,"legalName","taxOffice","taxNumber",address,city,type,"verificationStatus","complianceValidUntil","intlValidUntil","updatedAt")
    SELECT md5('c'||g)::uuid, 'Bench Taşıyıcı '||g, 'X', lpad(g::text,10,'0'), 'Adres', 'İstanbul', 'CARRIER', 'VERIFIED',
      now() + interval '2 years', now() + interval '2 years', now()
    FROM generate_series(1, ${companies}) g;
    INSERT INTO "Company"(id,"legalName","taxOffice","taxNumber",address,city,type,"verificationStatus","updatedAt")
    VALUES (md5('shipper')::uuid, 'Bench Yük Veren', 'X', '1234567890', 'Adres', 'İstanbul', 'SHIPPER', 'VERIFIED', now());
    INSERT INTO "User"(id,email,"passwordHash",role,status,"updatedAt") VALUES (md5('u')::uuid,'bench@x.dev','x','SHIPPER_USER','ACTIVE',now());
    INSERT INTO "Vehicle"(id,"carrierCompanyId",plate,"plateNormalized",type,brand,model,year,"complianceValidUntil","updatedAt")
    SELECT md5('v'||g)::uuid, md5('c'||(1 + g % ${companies}))::uuid, 'V'||g, 'V'||g, 'TRACTOR', 'B', 'M', 2022, now() + interval '2 years', now()
    FROM generate_series(1, ${N}) g;
    INSERT INTO "Trailer"(id,"carrierCompanyId",plate,"plateNormalized","trailerType","capacityKg","volumeM3","lengthCm","widthCm","heightCm","loadingMeters","palletCapacity","axleCount",features,"complianceValidUntil","updatedAt")
    SELECT md5('t'||g)::uuid, md5('c'||(1 + g % ${companies}))::uuid, 'T'||g, 'T'||g,
      (ARRAY['TENTELI','MEGA','KAPALI_KASA','FRIGORIFIK','ACIK_PLATFORM'])[1 + g % 5]::"TrailerType",
      24000, 90, 1360, 248, 270, 13.6, 33, 3, ARRAY['SIDE_OPENING']::"TrailerFeature"[], now() + interval '2 years', now()
    FROM generate_series(1, ${N}) g;
    INSERT INTO "Driver"(id,"carrierCompanyId","fullName","complianceValidUntil","updatedAt")
    SELECT md5('d'||g)::uuid, md5('c'||(1 + g % ${companies}))::uuid, 'Şoför '||g, now() + interval '2 years', now()
    FROM generate_series(1, ${N}) g;
    INSERT INTO "TruckPosting"(id,"referenceNo","carrierCompanyId","createdByUserId","vehicleId","trailerId","driverId",
      "availableFrom","availableUntil","originCity","originLat","originLng","maxDeadheadKm","minPricePerKm",status,"updatedAt")
    SELECT md5('p'||g)::uuid, 'TP-B-'||g, md5('c'||(1 + g % ${companies}))::uuid, md5('u')::uuid,
      md5('v'||g)::uuid, md5('t'||g)::uuid, md5('d'||g)::uuid,
      now() - interval '1 day', now() + interval '5 days', 'X',
      36.5 + random() * 5.5, 26.5 + random() * 17, (100 + floor(random() * 400))::int, 45 + floor(random() * 20), 'ACTIVE', now()
    FROM generate_series(1, ${N}) g;
    ANALYZE`;
  // Prisma prepared statement tek komut kabul eder: ifadeler tek tek çalıştırılır.
  for (const stmt of sql
    .split(/;\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean)) {
    await db.$executeRawUnsafe(stmt);
  }
  console.warn(`[bench]   veri hazır (${Date.now() - t0} ms)`);

  // İstanbul Tuzla → Ankara, yoğun bölgede bir yük.
  const load = await db.load
    .create({
      data: {
        referenceNo: 'LD-BENCH-1',
        shipperCompanyId: '00000000-0000-0000-0000-000000000000',
        createdByUserId: '00000000-0000-0000-0000-000000000000',
        pickupAddress: 'a',
        pickupCity: 'İstanbul',
        pickupLat: 40.82,
        pickupLng: 29.3,
        pickupWindowStart: new Date(Date.now() + 20 * 3_600_000),
        pickupWindowEnd: new Date(Date.now() + 30 * 3_600_000),
        deliveryAddress: 'b',
        deliveryCity: 'Ankara',
        deliveryLat: 39.93,
        deliveryLng: 32.86,
        deliveryWindowStart: new Date(Date.now() + 40 * 3_600_000),
        deliveryWindowEnd: new Date(Date.now() + 50 * 3_600_000),
        cargoType: 'x',
        weightKg: 20000,
        volumeM3: 70,
        loadingMeters: 13,
        requiredTrailerTypes: ['TENTELI', 'MEGA', 'KAPALI_KASA'],
        pricingMode: 'OPEN_TO_OFFER',
        budgetMin: '24000',
        budgetMax: '30000',
        routeDistanceKm: 450,
        status: 'PUBLISHED',
      },
    })
    .catch(async () => {
      const s = await db.company.findFirstOrThrow({ where: { type: 'SHIPPER' } });
      const u = await db.user.findFirstOrThrow();
      return db.load.create({
        data: {
          referenceNo: 'LD-BENCH-1',
          shipperCompanyId: s.id,
          createdByUserId: u.id,
          pickupAddress: 'a',
          pickupCity: 'İstanbul',
          pickupLat: 40.82,
          pickupLng: 29.3,
          pickupWindowStart: new Date(Date.now() + 20 * 3_600_000),
          pickupWindowEnd: new Date(Date.now() + 30 * 3_600_000),
          deliveryAddress: 'b',
          deliveryCity: 'Ankara',
          deliveryLat: 39.93,
          deliveryLng: 32.86,
          deliveryWindowStart: new Date(Date.now() + 40 * 3_600_000),
          deliveryWindowEnd: new Date(Date.now() + 50 * 3_600_000),
          cargoType: 'x',
          weightKg: 20000,
          volumeM3: 70,
          loadingMeters: 13,
          requiredTrailerTypes: ['TENTELI', 'MEGA', 'KAPALI_KASA'],
          pricingMode: 'OPEN_TO_OFFER',
          budgetMin: '24000',
          budgetMax: '30000',
          routeDistanceKm: 450,
          status: 'PUBLISHED',
        },
      });
    });

  const times: number[] = [];
  let result = { created: 0, updated: 0, expired: 0 };
  for (let i = 0; i < RUNS; i++) {
    const s = performance.now();
    result = await matching.computeForLoad(load.id);
    times.push(performance.now() - s);
  }
  times.sort((a, b) => a - b);
  const p = (q: number) =>
    times[Math.min(times.length - 1, Math.floor(q * times.length))]!.toFixed(0);
  const n = await db.truckPosting.count({ where: { status: 'ACTIVE' } });
  console.warn(`[bench] aktif ilan=${n}, çalıştırma=${RUNS}, ilk sonuç: ${JSON.stringify(result)}`);
  console.warn(
    `[bench] computeForLoad süreleri (ms): min=${p(0)} p50=${p(0.5)} p95=${p(0.95)} max=${p(1)}  → hedef p95 < 800 ms: ${Number(p(0.95)) < 800 ? 'GEÇTİ' : 'KALDI'}`,
  );
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} CASCADE`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
