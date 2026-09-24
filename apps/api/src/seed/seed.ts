/**
 * Demo verisi (prompt §8). Kullanım: `pnpm --filter @logimatch/api seed` (önce build).
 *
 * - Konfigürasyon tabloları, kullanıcılar, firmalar, filo ve belgeler doğrudan yazılır.
 * - Açık pazar (yük ve araç ilanları, eşleşmeler, pazarlıklar, aktif sevkiyatlar) GERÇEK
 *   servisler üzerinden kurulur; skorlar eşleştirme motorundan gelir.
 * - Geçmiş (tamamlanmış) sevkiyatlar ve değerlendirmeler doğrudan yazılır (geçmiş tarihli
 *   yayın/kabul akışı iş kurallarına takılacağı için).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { hash } from '@node-rs/argon2';
import { findCity, findDistrict, Money, normalizePlate, type TrailerType } from '@logimatch/shared';
import { WorkerModule } from '../app.module';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthActor } from '../common/actor';
import { nextReference } from '../common/reference';
import { OffersService } from '../deals/offers.service';
import { ShipmentsService } from '../deals/shipments.service';
import { computeCompliance, DEFAULT_RULES } from '../documents/compliance';
import { type Db, DB, type Prisma } from '../infra/prisma';
import { FILE_STORAGE, type IFileStorage } from '../integrations/ports';
import { LoadsService } from '../listings/loads.service';
import { TruckPostingsService } from '../listings/truck-postings.service';
import { MatchingService } from '../matching/matching.service';
import { DEFAULT_CANCELLATION_TIERS } from '../pricing/domain/cancellation';
import { DEFAULT_BANDS } from '../pricing/domain/estimate';
import { PricingService } from '../pricing/pricing.service';
import {
  ADR_CARGO,
  CARGO,
  CARRIER_NAMES,
  COLD_CARGO,
  CORRIDOR,
  FIRST_NAMES,
  INTL_ROUTES,
  LAST_NAMES,
  makeIban,
  makePlate,
  makeVkn,
  OWNER_OPERATORS,
  RATING_COMMENTS,
  rng,
  ROUTES,
  SHIPPER_NAMES,
  TRAILER_MIX,
  TRAILER_SPECS,
} from './data';

const PASSWORD = 'Demo1234!';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const r = rng(20260924);
const log = (...a: unknown[]) => console.warn('[seed]', ...a);

type DocType = Prisma.DocumentCreateManyInput['type'];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW !== 'true') {
    throw new Error('Production ortamında seed için SEED_ALLOW=true gerekli');
  }
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn'],
  });
  const db = app.get<Db>(DB);
  const storage = app.get<IFileStorage>(FILE_STORAGE);
  const guard = app.get(AuthGuard);
  const loadsSvc = app.get(LoadsService);
  const postingsSvc = app.get(TruckPostingsService);
  const matching = app.get(MatchingService);
  const offers = app.get(OffersService);
  const shipments = app.get(ShipmentsService);
  const pricing = app.get(PricingService);
  const actorOf = (userId: string): Promise<AuthActor> => guard.loadActor(userId);
  const now = Date.now();

  // ── 0. Temizlik ──────────────────────────────────────────────────────
  log('veritabanı temizleniyor…');
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`;
  await db.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  const redis = (await import('ioredis')).Redis;
  const rc = new redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const keys = await rc.keys('notif:dedup:*');
  if (keys.length) await rc.del(...keys);
  await rc.quit();

  // ── 1. Konfigürasyon ─────────────────────────────────────────────────
  const effectiveFrom = new Date(now - 365 * DAY);
  await db.pricingConfig.create({
    data: {
      effectiveFrom,
      commissionModel: 'CARRIER_PAYS',
      commissionRate: '0.10',
      splitShipperShare: '0.5',
      minCommission: '250',
      vatRate: '0.20',
      commissionVatRate: '0.20',
      withholdingRatio: '0.2',
      withholdingThreshold: '12000',
      commissionOnCancellationFee: true,
      ratePerKmBands: DEFAULT_BANDS.perKm as Prisma.InputJsonValue,
      multipliers: DEFAULT_BANDS.multipliers as Prisma.InputJsonValue,
    },
  });
  await db.matchingConfig.create({
    data: {
      effectiveFrom,
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
      effectiveFrom,
      tiers: DEFAULT_CANCELLATION_TIERS as unknown as Prisma.InputJsonValue,
      deadheadRatePerKm: '20',
      noShowGraceMinutes: 120,
      noShowSuspendStreak: 3,
    },
  });
  await db.exchangeRate.createMany({
    data: [
      {
        base: 'EUR',
        quote: 'TRY',
        rate: '44.85000000',
        source: 'seed',
        effectiveAt: new Date(now - HOUR),
      },
      {
        base: 'USD',
        quote: 'TRY',
        rate: '41.30000000',
        source: 'seed',
        effectiveAt: new Date(now - HOUR),
      },
      {
        base: 'EUR',
        quote: 'USD',
        rate: '1.08600000',
        source: 'seed',
        effectiveAt: new Date(now - HOUR),
      },
    ],
  });
  await db.countryRule.createMany({
    data: [
      { countryCode: 'TR', name: 'Türkiye', visaGroup: null },
      ...['BG', 'RO', 'DE', 'AT', 'HU', 'GR', 'IT', 'PL', 'NL', 'FR'].map((c) => ({
        countryCode: c,
        name: c,
        visaGroup: 'SCHENGEN',
      })),
      { countryCode: 'RS', name: 'Sırbistan', visaGroup: null },
      { countryCode: 'GE', name: 'Gürcistan', visaGroup: null },
    ],
  });
  await db.requiredDocumentRule.createMany({ data: DEFAULT_RULES });
  const placeholder = await storage.put(
    'seed/ornek-belge.pdf',
    Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
    ),
    'application/pdf',
  );

  // ── 2. Kullanıcılar ve firmalar ──────────────────────────────────────
  log('kullanıcılar ve firmalar…');
  const pw = await hash(PASSWORD, { memoryCost: 19456, timeCost: 2 });
  const mkUser = (
    email: string,
    role: Prisma.UserCreateInput['role'],
    fullName: string,
    phone?: string,
  ) =>
    db.user.create({
      data: {
        email,
        role,
        fullName,
        phone: phone ?? null,
        passwordHash: pw,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: phone ? new Date() : null,
      },
    });
  const admin = await mkUser('admin@logimatch.test', 'ADMIN', 'Platform Yöneticisi');
  await mkUser('ops@logimatch.test', 'OPS', 'Operasyon Uzmanı');

  const docRows: Prisma.DocumentCreateManyInput[] = [];
  const addDoc = (
    ownerType: Prisma.DocumentCreateManyInput['ownerType'],
    ownerId: string,
    companyId: string,
    type: DocType,
    expiresInDays: number | null,
    status: 'APPROVED' | 'PENDING' = 'APPROVED',
  ) =>
    docRows.push({
      ownerType,
      ownerId,
      companyId,
      type,
      fileKey: placeholder.key,
      fileName: `${type.toLowerCase()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: placeholder.sizeBytes,
      checksumSha256: placeholder.checksumSha256,
      number: `${type}-${r.int(100000, 999999)}`,
      issuedAt: new Date(now - r.int(100, 900) * DAY),
      expiresAt: expiresInDays == null ? null : new Date(now + expiresInDays * DAY),
      status,
      uploadedById: admin.id,
      reviewedById: status === 'APPROVED' ? admin.id : null,
      reviewedAt: status === 'APPROVED' ? new Date() : null,
    });

  const cityInfo = (name: string) => findCity(name)!;
  let phoneSeq = 5320000000;
  const nextPhone = () => `+90${++phoneSeq}`;

  interface Co {
    id: string;
    ownerId: string;
    city: string;
    intl: boolean;
    adr: boolean;
  }
  const mkCompany = async (
    legalName: string,
    type: 'SHIPPER' | 'CARRIER' | 'BOTH',
    ownerEmail: string,
    ownerName: string,
    city: string,
    opts: { verified?: boolean; reviewed?: number; intl?: boolean; adr?: boolean } = {},
  ): Promise<Co> => {
    const user = await mkUser(
      ownerEmail,
      type === 'SHIPPER' ? 'SHIPPER_USER' : 'CARRIER_USER',
      ownerName,
      nextPhone(),
    );
    const c = cityInfo(city);
    const company = await db.company.create({
      data: {
        legalName,
        tradeName: legalName.split(' ').slice(0, 2).join(' '),
        taxOffice: `${city} Vergi Dairesi`,
        taxNumber: makeVkn(r),
        mersisNo: String(r.int(1e15, 9e15)),
        address: `${r.pick(['Organize Sanayi Bölgesi', 'Sanayi Sitesi', 'Lojistik Merkezi', 'Atatürk Bulvarı'])} No:${r.int(1, 200)}`,
        city,
        district: CORRIDOR.find((x) => x.city === city)?.districts[0] ?? null,
        phone: nextPhone(),
        email: `info@${legalName
          .toLowerCase()
          .replace(/[^a-z]/g, '')
          .slice(0, 14)}.com.tr`,
        iban: makeIban(r),
        type,
        verificationStatus: opts.verified === false ? 'PENDING' : 'VERIFIED',
        verifiedAt: opts.verified === false ? null : new Date(now - r.int(30, 400) * DAY),
        listingsReviewedCount: opts.reviewed ?? 3,
        homeLat: c.lat,
        homeLng: c.lng,
        createdAt: new Date(now - r.int(60, 900) * DAY),
        members: { create: { userId: user.id, companyRole: 'OWNER', acceptedAt: new Date() } },
        stats: { create: {} },
      },
    });
    const verified = opts.verified !== false;
    addDoc(
      'COMPANY',
      company.id,
      company.id,
      'TAX_CERTIFICATE',
      null,
      verified ? 'APPROVED' : 'PENDING',
    );
    addDoc(
      'COMPANY',
      company.id,
      company.id,
      'SIGNATURE_CIRCULAR',
      null,
      verified ? 'APPROVED' : 'PENDING',
    );
    if (type !== 'SHIPPER') {
      addDoc(
        'COMPANY',
        company.id,
        company.id,
        'ACTIVITY_CERTIFICATE',
        r.int(200, 700),
        verified ? 'APPROVED' : 'PENDING',
      );
      addDoc(
        'COMPANY',
        company.id,
        company.id,
        opts.intl ? 'C2' : r.pick(['K1', 'L1', 'R2'] as const),
        r.int(300, 1500),
        verified ? 'APPROVED' : 'PENDING',
      );
      addDoc(
        'COMPANY',
        company.id,
        company.id,
        'CARRIER_LIABILITY',
        r.int(60, 360),
        verified ? 'APPROVED' : 'PENDING',
      );
    }
    return { id: company.id, ownerId: user.id, city, intl: !!opts.intl, adr: !!opts.adr };
  };

  // Yük verenler (20): ilki demo hesabı; son ikisi yeni (ilk ilanları moderasyona düşer).
  const shippers: Co[] = [];
  for (let i = 0; i < 20; i++) {
    const city = r.pick(CORRIDOR).city;
    shippers.push(
      await mkCompany(
        i === 0 ? 'Demo Gıda Sanayi ve Ticaret A.Ş.' : `${SHIPPER_NAMES[i]} San. ve Tic. A.Ş.`,
        i === 5 ? 'BOTH' : 'SHIPPER',
        i === 0 ? 'shipper@logimatch.test' : `yukveren${i}@logimatch.test`,
        i === 0 ? 'Demo Yük Veren' : `${r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`,
        i === 0 ? 'İstanbul' : city,
        { reviewed: i >= 18 ? 0 : 3, verified: i === 19 ? false : true },
      ),
    );
  }
  // Demo yük verene bir muhasebeci üye.
  const accountant = await mkUser('muhasebe@logimatch.test', 'SHIPPER_USER', 'Demo Muhasebeci');
  await db.companyMember.create({
    data: {
      userId: accountant.id,
      companyId: shippers[0]!.id,
      companyRole: 'ACCOUNTANT',
      acceptedAt: new Date(),
    },
  });

  // Taşıyıcılar (35): 30 filo + 5 öz mal sahibi. İlki demo hesabı.
  const carriers: (Co & { single: boolean })[] = [];
  for (let i = 0; i < 35; i++) {
    const single = i >= 30;
    const city = i === 0 ? 'İstanbul' : r.pick(CORRIDOR).city;
    const name =
      i === 0
        ? 'Demo Lojistik ve Taşımacılık Ltd. Şti.'
        : single
          ? `${OWNER_OPERATORS[i - 30]} Nakliyat`
          : `${CARRIER_NAMES[i - 1]} Ltd. Şti.`;
    const intl = i === 0 || i % 4 === 1;
    const adr = i === 0 || i % 5 === 2;
    const co = await mkCompany(
      name,
      'CARRIER',
      i === 0 ? 'carrier@logimatch.test' : `tasiyici${i}@logimatch.test`,
      single
        ? OWNER_OPERATORS[i - 30]!
        : i === 0
          ? 'Demo Taşıyıcı'
          : `${r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`,
      city,
      {
        intl,
        adr,
        verified: i === 34 ? false : true,
      },
    );
    carriers.push({ ...co, single });
  }
  // BOTH tipli yük veren (shippers[5]) aynı zamanda taşıyıcı olarak da kullanılabilir (#14 testi için).

  // ── 3. Filo ──────────────────────────────────────────────────────────
  log('filo…');
  const trailerTypes = r.shuffle(TRAILER_MIX);
  interface Unit {
    carrier: (typeof carriers)[number];
    vehicleId: string;
    trailerId: string;
    driverId: string;
    trailerType: TrailerType;
    city: string;
  }
  const units: Unit[] = [];
  // Araç dağılımı: demo taşıyıcı 5, öz mal sahipleri 1'er, kalan filolar 1-3.
  const vehicleCounts: number[] = carriers.map((c, i) => (i === 0 ? 5 : c.single ? 1 : 0));
  let remaining = 60 - vehicleCounts.reduce((a, b) => a + b, 0);
  for (let i = 1; remaining > 0; i = (i % 29) + 1) {
    vehicleCounts[i]!++;
    remaining--;
  }
  // Demo taşıyıcıya çeşitli dorseler.
  const demoTypes: TrailerType[] = ['TENTELI', 'MEGA', 'FRIGORIFIK', 'TENTELI', 'TANKER'];
  let tIdx = 0;
  let driverCount = 0;
  const fullName = () => `${r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`;

  for (const [ci, carrier] of carriers.entries()) {
    for (let k = 0; k < vehicleCounts[ci]!; k++) {
      let trailerType =
        ci === 0 ? demoTypes[k]! : (trailerTypes[tIdx++ % trailerTypes.length] as TrailerType);
      if (ci === 0 && k === 4) trailerType = 'TANKER';
      const spec = TRAILER_SPECS[trailerType]!;
      const plateCode = CORRIDOR.find((x) => x.city === carrier.city)?.plate ?? '34';
      const vehicle = await db.vehicle.create({
        data: {
          carrierCompanyId: carrier.id,
          plate: makePlate(r, plateCode),
          plateNormalized: '',
          type: ['DAMPERLI', 'KIRKAYAK'].includes(trailerType) ? 'TRUCK' : 'TRACTOR',
          brand: r.pick([
            'Mercedes-Benz',
            'Ford Trucks',
            'Scania',
            'Volvo',
            'MAN',
            'DAF',
            'Renault',
          ]),
          model: r.pick([
            'Actros 1845',
            'F-MAX',
            'R450',
            'FH 500',
            'TGX 18.470',
            'XF 480',
            'T 480',
          ]),
          year: r.int(2016, 2025),
          euroNorm: 'Euro 6',
        },
      });
      await db.vehicle.update({
        where: { id: vehicle.id },
        data: { plateNormalized: normalizePlate(vehicle.plate) },
      });
      const isAdrTrailer = trailerType === 'TANKER' || (carrier.adr && k === 0);
      const trailer = await db.trailer.create({
        data: {
          carrierCompanyId: carrier.id,
          plate: makePlate(r, plateCode),
          plateNormalized: `T${vehicle.id}`,
          trailerType,
          isIntegratedBody: ['DAMPERLI', 'KIRKAYAK'].includes(trailerType),
          capacityKg: spec.capacityKg,
          volumeM3: spec.volumeM3,
          lengthCm: spec.lengthCm,
          widthCm: spec.widthCm,
          heightCm: spec.heightCm,
          loadingMeters: spec.ldm,
          palletCapacity: spec.pallets,
          axleCount: spec.axles,
          features: [
            ...new Set([
              ...spec.features,
              ...(isAdrTrailer ? ['ADR'] : []),
              ...(r.chance(0.15) ? ['TAIL_LIFT'] : []),
            ]),
          ] as Prisma.TrailerCreateInput['features'],
          minTempC: spec.features.includes('TEMP_CONTROLLED') ? -25 : null,
          maxTempC: spec.features.includes('TEMP_CONTROLLED') ? 12 : null,
        },
      });
      await db.trailer.update({
        where: { id: trailer.id },
        data: { plateNormalized: normalizePlate(trailer.plate) },
      });
      const drivers = ci !== 0 && !carrier.single && k === 0 && r.chance(0.3) ? 2 : 1; // bazı araçlara yedek şoför
      let firstDriverId = '';
      for (let dn = 0; dn < drivers; dn++) {
        driverCount++;
        const intlDriver = carrier.intl && (k === 0 || r.chance(0.5));
        const adrDriver = isAdrTrailer || (carrier.adr && dn === 0);
        const home = cityInfo(carrier.city);
        let driverUserId: string | null = null;
        if (ci === 0 && k === 0 && dn === 0)
          driverUserId = (
            await mkUser('driver@logimatch.test', 'DRIVER', 'Demo Şoför', nextPhone())
          ).id;
        if (carrier.single) driverUserId = carrier.ownerId;
        const driver = await db.driver.create({
          data: {
            carrierCompanyId: carrier.id,
            userId: driverUserId,
            fullName: carrier.single
              ? OWNER_OPERATORS[ci - 30]!
              : ci === 0 && k === 0 && dn === 0
                ? 'Demo Şoför'
                : fullName(),
            phone: nextPhone(),
            licenseClasses: ['CE'],
            srcTypes: intlDriver
              ? ['SRC3', 'SRC4', ...(adrDriver ? ['SRC5'] : [])]
              : ['SRC4', ...(adrDriver ? ['SRC5'] : [])],
            adrClasses: adrDriver ? ['2', '3', '8'] : [],
            hasPsikoteknik: true,
            passportNumber: intlDriver ? `U${r.int(10000000, 99999999)}` : null,
            passportValidUntil: intlDriver ? new Date(now + r.int(300, 2000) * DAY) : null,
            visaCountries: intlDriver ? ['SCHENGEN'] : [],
            homeBaseLat: home.lat,
            homeBaseLng: home.lng,
          },
        });
        if (dn === 0) firstDriverId = driver.id;
        // Şoför belgeleri: birkaçı yakında dolacak (uyarı şeridi demosu).
        const soon =
          ci === 0 && k === 1 && dn === 0 ? 6 : r.chance(0.04) ? r.int(2, 14) : r.int(120, 900);
        addDoc('DRIVER', driver.id, carrier.id, 'DRIVING_LICENSE', r.int(700, 3000));
        addDoc('DRIVER', driver.id, carrier.id, 'PSIKOTEKNIK', soon);
        addDoc('DRIVER', driver.id, carrier.id, 'SRC4', null);
        if (intlDriver) {
          addDoc('DRIVER', driver.id, carrier.id, 'SRC3', null);
          addDoc('DRIVER', driver.id, carrier.id, 'PASSPORT', r.int(300, 2000));
        }
        if (adrDriver) addDoc('DRIVER', driver.id, carrier.id, 'ADR_CERTIFICATE', r.int(200, 1500));
      }
      addDoc('VEHICLE', vehicle.id, carrier.id, 'VEHICLE_LICENSE', null);
      addDoc(
        'VEHICLE',
        vehicle.id,
        carrier.id,
        'INSPECTION',
        ci === 0 && k === 2 ? 12 : r.int(60, 700),
      );
      if (carrier.intl) addDoc('VEHICLE', vehicle.id, carrier.id, 'CMR_INSURANCE', r.int(100, 365));
      addDoc('TRAILER', trailer.id, carrier.id, 'VEHICLE_LICENSE', null);
      addDoc('TRAILER', trailer.id, carrier.id, 'INSPECTION', r.int(60, 700));
      if (trailerType === 'FRIGO_ATP')
        addDoc('TRAILER', trailer.id, carrier.id, 'ATP_CERTIFICATE', r.int(100, 700));
      if (isAdrTrailer)
        addDoc('TRAILER', trailer.id, carrier.id, 'ADR_CERTIFICATE', r.int(100, 700));
      units.push({
        carrier,
        vehicleId: vehicle.id,
        trailerId: trailer.id,
        driverId: firstDriverId,
        trailerType,
        city: carrier.city,
      });
    }
  }
  // Demo taşıyıcıya yedek şoför(ler): toplam 70.
  while (driverCount < 70) {
    driverCount++;
    const d = await db.driver.create({
      data: {
        carrierCompanyId: carriers[0]!.id,
        fullName: fullName(),
        phone: nextPhone(),
        licenseClasses: ['CE'],
        srcTypes: ['SRC3', 'SRC4'],
        adrClasses: [],
        hasPsikoteknik: true,
        visaCountries: ['SCHENGEN'],
        homeBaseLat: 41.01,
        homeBaseLng: 28.98,
      },
    });
    for (const t of ['DRIVING_LICENSE', 'PSIKOTEKNIK', 'SRC4', 'SRC3'] as const)
      addDoc('DRIVER', d.id, carriers[0]!.id, t, 500);
    addDoc('DRIVER', d.id, carriers[0]!.id, 'PASSPORT', 900);
  }
  // Doğrulama kuyruğu için bekleyen birkaç belge.
  addDoc('VEHICLE', units[7]!.vehicleId, units[7]!.carrier.id, 'INSPECTION', 365, 'PENDING');
  addDoc('DRIVER', units[9]!.driverId, units[9]!.carrier.id, 'PSIKOTEKNIK', 700, 'PENDING');
  await db.document.createMany({ data: docRows });

  // Uyumluluk önbelleği: saf fonksiyonla hesaplanır (servisle aynı kural).
  log('uyumluluk önbelleği…');
  const rules = DEFAULT_RULES;
  const allDocs = await db.document.findMany({
    select: { ownerType: true, ownerId: true, type: true, status: true, expiresAt: true },
  });
  const docsOf = (t: string, id: string) =>
    allDocs.filter((d) => d.ownerType === t && d.ownerId === id);
  const nowD = new Date();
  for (const c of [...shippers, ...carriers]) {
    await db.company.update({
      where: { id: c.id },
      data: computeCompliance('COMPANY', rules, docsOf('COMPANY', c.id), nowD),
    });
  }
  for (const u of units) {
    await db.vehicle.update({
      where: { id: u.vehicleId },
      data: computeCompliance('VEHICLE', rules, docsOf('VEHICLE', u.vehicleId), nowD),
    });
    await db.trailer.update({
      where: { id: u.trailerId },
      data: computeCompliance('TRAILER', rules, docsOf('TRAILER', u.trailerId), nowD, {
        trailerType: u.trailerType,
      }),
    });
  }
  for (const d of await db.driver.findMany({ select: { id: true } })) {
    await db.driver.update({
      where: { id: d.id },
      data: computeCompliance('DRIVER', rules, docsOf('DRIVER', d.id), nowD),
    });
  }
  log(`  ${units.length} araç + dorse, ${driverCount} şoför, ${docRows.length} belge`);

  // ── 4. Geçmiş: 25 tamamlanmış sevkiyat + değerlendirmeler ────────────
  log('geçmiş sevkiyatlar…');
  const historyUnits = r
    .shuffle(
      units.filter((u) =>
        ['TENTELI', 'MEGA', 'KAPALI_KASA', 'FRIGORIFIK', 'JUMBO'].includes(u.trailerType),
      ),
    )
    .slice(0, 25);
  for (const [i, u] of historyUnits.entries()) {
    const shipper = i < 6 ? shippers[0]! : r.pick(shippers.slice(1, 18));
    const [from, to] = r.pick(ROUTES);
    const pc = cityInfo(from);
    const dc = cityInfo(to);
    const pickupStart = new Date(now - r.int(8, 80) * DAY);
    pickupStart.setUTCHours(6, 0, 0, 0);
    const km = Math.round(Math.hypot((pc.lat - dc.lat) * 111, (pc.lng - dc.lng) * 85) * 1.25);
    const amount = Money.of(Math.round((km * r.int(55, 70)) / 100) * 100, 'TRY');
    const terms = await pricing.lockTerms(db, amount, false, r.chance(0.5));
    await db.$transaction(async (tx) => {
      const load = await tx.load.create({
        data: {
          referenceNo: await nextReference(tx, 'LD', pickupStart),
          shipperCompanyId: shipper.id,
          createdByUserId: shipper.ownerId,
          pickupAddress: 'OSB Depo',
          pickupCity: from,
          pickupDistrict: CORRIDOR.find((x) => x.city === from)?.districts[0],
          pickupLat: pc.lat,
          pickupLng: pc.lng,
          pickupWindowStart: pickupStart,
          pickupWindowEnd: new Date(pickupStart.getTime() + 6 * HOUR),
          deliveryAddress: 'Merkez Depo',
          deliveryCity: to,
          deliveryDistrict: CORRIDOR.find((x) => x.city === to)?.districts[0],
          deliveryLat: dc.lat,
          deliveryLng: dc.lng,
          deliveryWindowStart: new Date(pickupStart.getTime() + 20 * HOUR),
          deliveryWindowEnd: new Date(pickupStart.getTime() + 36 * HOUR),
          cargoType: r.pick(CARGO.slice(0, 7)).type,
          weightKg: r.int(12, 22) * 1000,
          requiredTrailerTypes: [u.trailerType],
          pricingMode: 'OPEN_TO_OFFER',
          budgetMin: amount.multiply('0.9').toString(),
          budgetMax: amount.multiply('1.1').toString(),
          routeDistanceKm: km,
          routeStatus: 'OK',
          status: 'COMPLETED',
          publishedAt: new Date(pickupStart.getTime() - 3 * DAY),
          createdAt: new Date(pickupStart.getTime() - 3 * DAY),
          withholdingApplies: terms.withholdingApplies,
        },
      });
      const posting = await tx.truckPosting.create({
        data: {
          referenceNo: await nextReference(tx, 'TP', pickupStart),
          carrierCompanyId: u.carrier.id,
          createdByUserId: u.carrier.ownerId,
          vehicleId: u.vehicleId,
          trailerId: u.trailerId,
          driverId: u.driverId,
          availableFrom: new Date(pickupStart.getTime() - DAY),
          availableUntil: new Date(pickupStart.getTime() + DAY),
          originCity: from,
          originLat: pc.lat + 0.05,
          originLng: pc.lng + 0.05,
          maxDeadheadKm: 200,
          status: 'EXPIRED',
          publishedAt: new Date(pickupStart.getTime() - 2 * DAY),
        },
      });
      const match = await tx.match.create({
        data: {
          loadId: load.id,
          truckPostingId: posting.id,
          score: r.int(62, 94),
          scoreBreakdown: { version: 1, total: 0, components: {}, reasons: ['NEAR_PICKUP'] },
          deadheadKm: r.int(5, 60),
          status: 'MUTUAL',
          shipperInterestAt: new Date(pickupStart.getTime() - 2 * DAY),
          carrierInterestAt: new Date(pickupStart.getTime() - 2 * DAY),
        },
      });
      const rounds = r.int(1, 3);
      let parentId: string | null = null;
      let offerId = '';
      for (let k = 1; k <= rounds; k++) {
        const last = k === rounds;
        const offerSide = k % 2 === 1 ? 'CARRIER' : 'SHIPPER';
        const o: { id: string } = await tx.offer.create({
          data: {
            matchId: match.id,
            loadId: load.id,
            truckPostingId: posting.id,
            offeredBy: offerSide,
            offeredByCompanyId: offerSide === 'CARRIER' ? u.carrier.id : shipper.id,
            offeredByUserId: offerSide === 'CARRIER' ? u.carrier.ownerId : shipper.ownerId,
            amount: last
              ? amount.toString()
              : amount.multiply(k === 1 ? '1.12' : '0.95').toString(),
            currency: 'TRY',
            validUntil: new Date(pickupStart.getTime() - DAY),
            status: last ? 'ACCEPTED' : 'COUNTERED',
            round: k,
            parentOfferId: parentId,
            respondedAt: new Date(pickupStart.getTime() - 2 * DAY + k * HOUR),
            createdAt: new Date(pickupStart.getTime() - 2 * DAY + (k - 1) * HOUR),
          },
        });
        parentId = o.id;
        offerId = o.id;
      }
      const completedAt = new Date(pickupStart.getTime() + 60 * HOUR);
      const s = await tx.shipment.create({
        data: {
          referenceNo: await nextReference(tx, 'SH', pickupStart),
          loadId: load.id,
          matchId: match.id,
          acceptedOfferId: offerId,
          truckPostingId: posting.id,
          shipperCompanyId: shipper.id,
          carrierCompanyId: u.carrier.id,
          vehicleId: u.vehicleId,
          trailerId: u.trailerId,
          driverId: u.driverId,
          currency: 'TRY',
          agreedAmount: amount.toString(),
          commissionModel: terms.commissionModel,
          commissionRate: terms.commissionRate.toString(),
          commissionAmount: terms.shipperCommission.add(terms.carrierCommission).toString(),
          shipperCommissionAmount: terms.shipperCommission.toString(),
          carrierCommissionAmount: terms.carrierCommission.toString(),
          carrierPayout: amount.subtract(terms.carrierCommission).toString(),
          shipperTotal: amount.add(terms.shipperCommission).toString(),
          vatRate: terms.vatRate.toString(),
          commissionVatRate: terms.commissionVatRate.toString(),
          withholdingApplies: terms.withholdingApplies,
          withholdingRatio: terms.withholdingRatio.toString(),
          withholdingThreshold: terms.withholdingThreshold.toString(),
          pricingConfigId: terms.pricingConfigId,
          lockedFxRate: '1',
          lockedFxRateAt: new Date(pickupStart.getTime() - 2 * DAY),
          plannedPickupAt: pickupStart,
          plannedDeliveryAt: new Date(pickupStart.getTime() + 36 * HOUR),
          assignmentEndAt: new Date(pickupStart.getTime() + 48 * HOUR),
          deadheadKm: match.deadheadKm,
          status: 'COMPLETED',
          deliveredAt: new Date(pickupStart.getTime() + 26 * HOUR),
          podSubmittedAt: new Date(pickupStart.getTime() + 27 * HOUR),
          completedAt,
          createdAt: new Date(pickupStart.getTime() - 2 * DAY),
        },
      });
      const statuses = [
        'ASSIGNED',
        'AT_PICKUP',
        'LOADED',
        'IN_TRANSIT',
        'AT_DELIVERY',
        'DELIVERED',
        'POD_SUBMITTED',
        'COMPLETED',
      ] as const;
      await tx.shipmentEvent.createMany({
        data: statuses.map((st, k) => ({
          shipmentId: s.id,
          type: 'STATUS_CHANGED' as const,
          fromStatus: k === 0 ? null : statuses[k - 1],
          toStatus: st,
          actorRole: st === 'COMPLETED' ? 'SHIPPER' : 'CARRIER',
          occurredAt: new Date(pickupStart.getTime() + (k - 1) * 4 * HOUR),
        })),
      });
      await pricing.createInvoiceDrafts(tx, s);
      // Değerlendirmeler (çoğu iki taraflı → görünür).
      const shipperStars = r.pick([5, 5, 5, 4, 4, 4, 3]);
      await tx.rating.create({
        data: {
          shipmentId: s.id,
          raterCompanyId: shipper.id,
          ratedCompanyId: u.carrier.id,
          raterSide: 'SHIPPER',
          raterUserId: shipper.ownerId,
          stars: shipperStars,
          punctuality: Math.max(1, shipperStars - r.int(0, 1)),
          communication: shipperStars,
          cargoCare: shipperStars,
          documentation: Math.max(1, shipperStars - r.int(0, 1)),
          priceHonesty: shipperStars,
          comment: r.pick(RATING_COMMENTS),
          visibleAt: completedAt,
          createdAt: completedAt,
        },
      });
      const carrierStars = r.pick([5, 5, 4, 4, 3]);
      await tx.rating.create({
        data: {
          shipmentId: s.id,
          raterCompanyId: u.carrier.id,
          ratedCompanyId: shipper.id,
          raterSide: 'CARRIER',
          raterUserId: u.carrier.ownerId,
          stars: carrierStars,
          punctuality: carrierStars,
          communication: carrierStars,
          documentation: carrierStars,
          priceHonesty: carrierStars,
          visibleAt: completedAt,
          createdAt: completedAt,
        },
      });
      const up = (id: string, patch: Prisma.CompanyStatsUpdateInput) =>
        tx.companyStats.update({ where: { companyId: id }, data: patch });
      await up(u.carrier.id, {
        completedAsCarrier: { increment: 1 },
        ratingCount: { increment: 1 },
        ratingSum: { increment: shipperStars },
      });
      await up(shipper.id, {
        completedAsShipper: { increment: 1 },
        ratingCount: { increment: 1 },
        ratingSum: { increment: carrierStars },
      });
      await tx.companyPairStats.upsert({
        where: {
          shipperCompanyId_carrierCompanyId: {
            shipperCompanyId: shipper.id,
            carrierCompanyId: u.carrier.id,
          },
        },
        create: {
          shipperCompanyId: shipper.id,
          carrierCompanyId: u.carrier.id,
          completedCount: 1,
          goodCount: shipperStars >= 4 ? 1 : 0,
        },
        update: {
          completedCount: { increment: 1 },
          goodCount: { increment: shipperStars >= 4 ? 1 : 0 },
        },
      });
    });
  }
  // Bir taşıyıcıda geçmiş iptal/no-show (reliability farkı görünsün).
  await db.companyStats.update({
    where: { companyId: carriers[3]!.id },
    data: { carrierCancelled: 2, noShowCount: 1 },
  });

  // ── 5. Açık pazar: 120 yük ilanı (gerçek servislerle) ────────────────
  log('yük ilanları…');
  const loadIds: string[] = [];
  const dayStart = (d: number) => {
    const t = new Date(now + d * DAY);
    t.setUTCHours(5, 0, 0, 0);
    return t;
  };
  const districtOf = (city: string) => {
    const c = CORRIDOR.find((x) => x.city === city);
    return c ? r.pick(c.districts) : undefined;
  };
  for (let i = 0; i < 120; i++) {
    const shipper = i < 14 ? shippers[0]! : shippers[1 + (i % 19)]!;
    const actor = await actorOf(shipper.ownerId);
    const intl = i >= 105;
    const kind = intl ? 'INTL' : i % 10 === 3 ? 'COLD' : i % 15 === 7 ? 'ADR' : 'GENERAL';
    let from: [string, string];
    let to: [string, string];
    if (intl) {
      const rt = INTL_ROUTES[i % INTL_ROUTES.length]!;
      from = rt.from;
      to = rt.to;
    } else {
      const rt = ROUTES[i % ROUTES.length]!;
      from = ['TR', rt[0]];
      to = ['TR', rt[1]];
    }
    const pd = i < 14 ? r.int(1, 4) : r.int(1, 9);
    const pickupStart = new Date(dayStart(pd).getTime() + r.int(0, 3) * HOUR);
    const pickupEnd = new Date(pickupStart.getTime() + r.pick([4, 6, 8, 10]) * HOUR);
    const transitDays = intl ? r.int(3, 5) : 1;
    const deliveryStart = new Date(pickupStart.getTime() + transitDays * DAY);
    const deliveryEnd = new Date(deliveryStart.getTime() + r.pick([8, 10, 12]) * HOUR);

    const cargo =
      kind === 'COLD'
        ? { type: r.pick(COLD_CARGO), trailers: ['FRIGORIFIK', 'FRIGO_ATP'] as const }
        : kind === 'ADR'
          ? null
          : r.pick(CARGO);
    const adr = kind === 'ADR' ? r.pick(ADR_CARGO) : null;
    const trailerTypes = (adr ? ['TANKER', 'TENTELI'] : [...cargo!.trailers]) as TrailerType[];
    const heavy = trailerTypes.includes('LOWBED') || trailerTypes.includes('KIRKAYAK');
    const bulk = trailerTypes.includes('SILOBAS') || trailerTypes.includes('DAMPERLI');
    const weightKg = heavy ? r.int(18, 38) * 1000 : r.int(i % 9 === 0 ? 3 : 10, 22) * 1000;
    const currency = intl ? 'EUR' : 'TRY';
    const estimate = intl ? r.int(2200, 4200) : null;
    const pricingMode = i % 6 === 0 ? 'FIXED' : 'OPEN_TO_OFFER';
    try {
      const load = await loadsSvc.create(actor, {
        pickup: {
          address: `${r.pick(['1. Cadde', 'Sanayi Cd.', 'Liman Yolu', 'Depo Sk.'])} No:${r.int(1, 90)}`,
          city: from[1],
          district: from[0] === 'TR' ? districtOf(from[1]) : undefined,
          country: from[0],
          windowStart: pickupStart,
          windowEnd: pickupEnd,
        },
        delivery: {
          address: `${r.pick(['Lojistik Merkezi', 'Fabrika', 'Antrepo', 'Dağıtım Deposu'])}`,
          city: to[1],
          district: to[0] === 'TR' ? districtOf(to[1]) : undefined,
          country: to[0],
          windowStart: deliveryStart,
          windowEnd: deliveryEnd,
        },
        stops: [],
        cargoType: adr ? adr.type : cargo!.type,
        weightKg,
        volumeM3: bulk || heavy ? undefined : Math.round(weightKg / 280),
        loadingMeters:
          bulk || heavy ? undefined : Math.min(13.6, Math.round((weightKg / 1800) * 10) / 10),
        palletCount: bulk || heavy || adr ? undefined : Math.min(33, Math.round(weightKg / 700)),
        palletType: bulk || heavy || adr ? undefined : 'EUR',
        isStackable: r.chance(0.3),
        isFragile: r.chance(0.15),
        requiredTrailerTypes: trailerTypes,
        requiredFeatures: [],
        isAdr: !!adr,
        adrClass: adr?.adrClass as '3' | undefined,
        unNumber: adr?.un,
        packingGroup: adr?.pg as 'II' | undefined,
        requiresTempControl: kind === 'COLD',
        minTempC: kind === 'COLD' ? r.pick([-20, 0, 2]) : undefined,
        maxTempC: kind === 'COLD' ? r.pick([-15, 4, 8]) : undefined,
        loadingMethod: r.pick(['RAMPA', 'FORKLIFT', 'VINC', 'ELLE'] as const),
        unloadingMethod: r.pick(['RAMPA', 'FORKLIFT'] as const),
        transportScope: intl ? 'INTERNATIONAL' : 'DOMESTIC',
        customsRequired: intl,
        incoterm: intl ? r.pick(['DAP', 'FCA', 'EXW'] as const) : undefined,
        pricingMode,
        budgetMin: pricingMode === 'FIXED' ? undefined : intl ? String(estimate! - 300) : undefined,
        budgetMax: intl ? String(estimate) : undefined,
        currency,
        paymentTerm: r.pick(['PESIN', 'VADELI_30', 'VADELI_60'] as const),
        withholdingApplies: !intl && r.chance(0.4),
        visibility: 'PUBLIC',
        invitedCarrierCompanyIds: [],
      });
      // Yurt içi bütçe: servis tahmini etrafında (±%10) → pazarlık gerçekçi olsun.
      if (!intl && load.estimatedPriceMin && load.estimatedPriceMax) {
        const mid = Money.of(load.estimatedPriceMin.plus(load.estimatedPriceMax).div(2), 'TRY');
        const factor = 0.9 + r.next() * 0.2;
        await db.load.update({
          where: { id: load.id },
          data:
            pricingMode === 'FIXED'
              ? {
                  budgetMin: mid.multiply(factor).toString(),
                  budgetMax: mid.multiply(factor).toString(),
                }
              : {
                  budgetMin: mid.multiply(factor * 0.9).toString(),
                  budgetMax: mid.multiply(factor * 1.08).toString(),
                },
        });
      }
      // Birkaçı taslak kalsın; doğrulanmamış firma yayınlayamaz (taslakta kalır).
      if (i % 40 === 39 || shipper === shippers[19]) {
        loadIds.push(load.id);
        continue;
      }
      await loadsSvc.publish(actor, load.id);
      loadIds.push(load.id);
    } catch (err) {
      log(`  yük ${i} atlandı:`, (err as Error).message);
    }
  }

  // ── 6. Araç ilanları (90 toplam: 25 geçmiş + aktif + taslak) ─────────
  log('araç ilanları…');
  const postingIds: string[] = [];
  const activeUnits = units.filter((u) => !historyUnits.slice(0, 5).includes(u));
  for (const [i, u] of activeUnits.entries()) {
    if (postingIds.length >= 65) break;
    const actor = await actorOf(u.carrier.ownerId);
    // Aracın konumu: çoğunlukla yük koridorlarının başlangıç şehirleri.
    const originCity = i % 3 === 0 ? u.city : r.pick(ROUTES)[0];
    const districts = CORRIDOR.find((x) => x.city === originCity)?.districts ?? [];
    const district = districts.length ? r.pick(districts) : undefined;
    const d = district ? findDistrict(originCity, district) : undefined;
    const home = cityInfo(originCity);
    const from = new Date(now + r.int(-12, 36) * HOUR);
    const prefs = r
      .shuffle(ROUTES.map((x) => x[1]).filter((c) => c !== originCity))
      .slice(0, r.int(0, 3));
    try {
      const p = await postingsSvc.create(actor, {
        vehicleId: u.vehicleId,
        trailerId: u.trailerId,
        driverId: u.driverId,
        availableFrom: from,
        availableUntil: new Date(from.getTime() + r.int(3, 9) * DAY),
        origin: {
          address: `${district ?? 'Merkez'} park alanı`,
          city: originCity,
          district,
          country: 'TR',
          lat: (d ?? home).lat + (r.next() - 0.5) * 0.04,
          lng: (d ?? home).lng + (r.next() - 0.5) * 0.04,
        },
        preferredDestinations: [
          ...prefs.map((c) => ({ country: 'TR', city: c })),
          ...(u.carrier.intl && r.chance(0.6) ? [{ country: r.pick(['BG', 'RO', 'DE']) }] : []),
        ],
        maxDeadheadKm: r.pick([150, 200, 250, 300, 400]),
        minPricePerKm: u.carrier.intl && r.chance(0.3) ? undefined : String(r.int(44, 62)),
        currency: 'TRY',
        acceptsAdr: u.trailerType === 'TANKER' || (u.carrier.adr && r.chance(0.7)),
        acceptsPartialLoad: r.chance(0.35),
        acceptsInternational: u.carrier.intl,
        notes: r.chance(0.3) ? 'Dönüş yükü arıyorum.' : undefined,
      });
      if (i % 11 === 10) {
        postingIds.push(p.id); // taslak
        continue;
      }
      await postingsSvc.publish(actor, p.id);
      postingIds.push(p.id);
    } catch (err) {
      log(`  ilan ${i} atlandı:`, (err as Error).message);
    }
  }

  // Ek taslak ilanlar (aynı araç için ileri tarihli; yalnızca ACTIVE ilan tekil olmalı).
  for (const u of activeUnits.slice(0, 90 - 25 - postingIds.length)) {
    const actor = await actorOf(u.carrier.ownerId);
    const from = new Date(now + r.int(10, 20) * DAY);
    const p = await postingsSvc.create(actor, {
      vehicleId: u.vehicleId,
      trailerId: u.trailerId,
      driverId: u.driverId,
      availableFrom: from,
      availableUntil: new Date(from.getTime() + 5 * DAY),
      origin: { address: 'Merkez', city: u.city, country: 'TR' },
      preferredDestinations: [],
      maxDeadheadKm: 250,
      currency: 'TRY',
      acceptsAdr: false,
      acceptsPartialLoad: false,
      acceptsInternational: false,
      notes: 'İleri tarihli planlama (taslak)',
    });
    postingIds.push(p.id);
  }

  // ── 7. Eşleştirme (gerçek motor) ─────────────────────────────────────
  log('eşleştirme motoru çalışıyor…');
  const t0 = Date.now();
  for (const id of loadIds) await matching.computeForLoad(id);
  for (const id of postingIds) await matching.computeForPosting(id);
  log(`  ${loadIds.length} yük + ${postingIds.length} ilan için ${Date.now() - t0} ms`);

  // ── 8. Eşleşme durumları, pazarlıklar, aktif sevkiyatlar ─────────────
  log('eşleşme durumları ve pazarlıklar…');
  const open = await db.match.findMany({
    where: { status: 'SUGGESTED', load: { pricingMode: 'OPEN_TO_OFFER' } },
    include: { load: true, truckPosting: true },
    orderBy: [{ score: 'desc' }],
  });
  // Demo hesaplarının eşleşmeleri öne alınır.
  const demoFirst = [
    ...open.filter(
      (m) =>
        m.load.shipperCompanyId === shippers[0]!.id ||
        m.truckPosting.carrierCompanyId === carriers[0]!.id,
    ),
    ...open.filter(
      (m) =>
        m.load.shipperCompanyId !== shippers[0]!.id &&
        m.truckPosting.carrierCompanyId !== carriers[0]!.id,
    ),
  ];
  // Plan: önce 7 kabul (yük/araç benzersiz), sonra 15 pazarlık, sonra MUTUAL, ilgi ve görüntüleme.
  const usedLoads = new Set<string>();
  const usedPostings = new Set<string>();
  const unique = demoFirst.filter((m) => {
    if (usedLoads.has(m.loadId) || usedPostings.has(m.truckPostingId)) return false;
    usedLoads.add(m.loadId);
    usedPostings.add(m.truckPostingId);
    return true;
  });
  const toAccept = unique.slice(0, 7);
  const blockedLoads = new Set(toAccept.map((m) => m.loadId));
  const blockedPostings = new Set(toAccept.map((m) => m.truckPostingId));
  const rest = demoFirst.filter(
    (m) => !blockedLoads.has(m.loadId) && !blockedPostings.has(m.truckPostingId),
  );
  const toNegotiate = rest.slice(0, 15);
  const toMutual = rest.slice(15, 18);
  const toShipperInterest = rest.slice(18, 23);
  const toCarrierInterest = rest.slice(23, 28);
  const toView = rest.slice(28, 36);
  let negotiations = 0;
  let accepted = 0;
  const actorsFor = async (m: (typeof open)[number]) => ({
    shipperActor: await actorOf(shippers.find((s) => s.id === m.load.shipperCompanyId)!.ownerId),
    carrierActor: await actorOf(
      carriers.find((c) => c.id === m.truckPosting.carrierCompanyId)!.ownerId,
    ),
  });
  const mutual = async (m: (typeof open)[number]) => {
    const a = await actorsFor(m);
    await matching.interest(a.carrierActor, m.id, true);
    await matching.interest(a.shipperActor, m.id, true);
    return a;
  };
  const attempt = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      log(`  ${label} atlandı:`, (err as Error).message);
    }
  };
  for (const m of toAccept) {
    await attempt('kabul', async () => {
      const { shipperActor, carrierActor } = await mutual(m);
      const base = m.load.budgetMax ? Number(m.load.budgetMax) : 20000;
      const o = await offers.create(carrierActor, m.id, {
        amount: String(Math.round(base * 1.04)),
      });
      const c = await offers.counter(shipperActor, o.id, {
        amount: String(Math.round(base * 0.98)),
      });
      const s = await offers.accept(carrierActor, c.id);
      accepted++;
      // Bir kısmını ilerlet (takip ekranı demosu).
      if (accepted % 2 === 0) {
        await shipments.updateStatus(carrierActor, s.id, { status: 'AT_PICKUP' });
        await shipments.updateStatus(carrierActor, s.id, { status: 'LOADED' });
        await shipments.updateStatus(carrierActor, s.id, {
          status: 'IN_TRANSIT',
          note: 'Yola çıkıldı',
        });
      }
    });
  }
  for (const [i, m] of toNegotiate.entries()) {
    await attempt('pazarlık', async () => {
      const { shipperActor, carrierActor } = await mutual(m);
      const base = m.load.budgetMax ? Number(m.load.budgetMax) : 20000;
      const o1 = await offers.create(carrierActor, m.id, {
        amount: String(Math.round(base * 1.08)),
      });
      if (i % 3 === 0) {
        const o2 = await offers.counter(shipperActor, o1.id, {
          amount: String(Math.round(base * 0.95)),
        });
        if (i % 2 === 0)
          await offers.counter(carrierActor, o2.id, {
            amount: String(Math.round(base * 1.02)),
            note: 'Son fiyatımız',
          });
      }
      negotiations++;
    });
  }
  for (const m of toMutual) await attempt('mutual', () => mutual(m));
  for (const m of toShipperInterest)
    await attempt('ilgi', async () =>
      matching.interest((await actorsFor(m)).shipperActor, m.id, true),
    );
  for (const m of toCarrierInterest)
    await attempt('ilgi', async () =>
      matching.interest((await actorsFor(m)).carrierActor, m.id, true),
    );
  for (const m of toView)
    await attempt('görüntüleme', async () => matching.get((await actorsFor(m)).shipperActor, m.id));

  // ── Özet ─────────────────────────────────────────────────────────────
  const counts = {
    companies: await db.company.count(),
    users: await db.user.count(),
    vehicles: await db.vehicle.count(),
    trailers: await db.trailer.count(),
    drivers: await db.driver.count(),
    loads: await db.load.count(),
    truckPostings: await db.truckPosting.count(),
    matches: await db.match.count(),
    pendingOffers: await db.offer.count({ where: { status: 'PENDING' } }),
    shipments: await db.shipment.count(),
    completedShipments: await db.shipment.count({ where: { status: 'COMPLETED' } }),
    ratings: await db.rating.count(),
    moderationQueue: await db.load.count({ where: { moderationStatus: 'PENDING_REVIEW' } }),
  };
  log(
    'tamam:',
    JSON.stringify(counts),
    `aktif pazarlık=${negotiations}, yeni sevkiyat=${accepted}`,
  );
  log(
    `demo hesapları (şifre ${PASSWORD}): shipper@ carrier@ admin@ ops@ driver@ muhasebe@ logimatch.test`,
  );
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
