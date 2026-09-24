import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/auth.service';
import { configureApp } from '../src/bootstrap';
import { DEFAULT_RULES } from '../src/documents/compliance';
import { DB, type Db, type Prisma } from '../src/infra/prisma';
import { REDIS } from '../src/infra/redis';
import { DEFAULT_CANCELLATION_TIERS } from '../src/pricing/domain/cancellation';
import { DEFAULT_BANDS } from '../src/pricing/domain/estimate';
import { OutboxDispatcher } from '../src/queue/dispatcher';
import { PlatformConfigService } from '../src/platform/platform-config.service';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const FAR = new Date('2030-01-01T00:00:00Z');

export interface TestCtx {
  app: INestApplication;
  http: () => App;
  db: Db;
  drain: () => Promise<void>;
}

export async function createTestApp(): Promise<TestCtx> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { swagger: false });
  await app.init();
  const db = app.get<Db>(DB);
  const dispatcher = app.get(OutboxDispatcher);
  return { app, http: () => app.getHttpServer() as App, db, drain: () => dispatcher.drainAll() };
}

/** Tüm tabloları boşaltır ve konfigürasyonu yazar. */
export async function resetDb(ctx: TestCtx): Promise<void> {
  const { db } = ctx;
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`;
  await db.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
  );
  const redis = ctx.app.get<Redis>(REDIS);
  const keys = await redis.keys('notif:dedup:*');
  if (keys.length) await redis.del(...keys);
  const from = new Date(Date.now() - 365 * DAY);
  await db.pricingConfig.create({
    data: {
      effectiveFrom: from,
      commissionModel: 'CARRIER_PAYS',
      commissionRate: '0.10',
      minCommission: null,
      vatRate: '0.20',
      commissionVatRate: '0.20',
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
  await db.exchangeRate.createMany({
    data: [
      {
        base: 'EUR',
        quote: 'TRY',
        rate: '45',
        source: 'test',
        effectiveAt: new Date(Date.now() - HOUR),
      },
      {
        base: 'USD',
        quote: 'TRY',
        rate: '41',
        source: 'test',
        effectiveAt: new Date(Date.now() - HOUR),
      },
    ],
  });
  await db.countryRule.createMany({
    data: [
      { countryCode: 'TR', name: 'Türkiye', visaGroup: null },
      { countryCode: 'BG', name: 'Bulgaristan', visaGroup: 'SCHENGEN' },
      { countryCode: 'DE', name: 'Almanya', visaGroup: 'SCHENGEN' },
    ],
  });
  await db.requiredDocumentRule.createMany({ data: DEFAULT_RULES });
  ctx.app.get(PlatformConfigService).invalidate();
}

let seq = 0;
export const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export interface Session {
  token: string;
  userId: string;
  auth: { Authorization: string };
}

export async function register(
  ctx: TestCtx,
  role: 'SHIPPER_USER' | 'CARRIER_USER',
  email = `u${uniq()}@test.dev`,
): Promise<Session> {
  const res = await request(ctx.http())
    .post('/api/v1/auth/register')
    .send({ email, password: 'Test1234!', fullName: 'Test Kullanıcı', role })
    .expect(201);
  const token = res.body.tokens.accessToken as string;
  return { token, userId: res.body.user.id as string, auth: { Authorization: `Bearer ${token}` } };
}

/** Admin kullanıcısı doğrudan DB'ye yazılır, login ile token alınır. */
export async function adminSession(ctx: TestCtx): Promise<Session> {
  const email = `admin${uniq()}@test.dev`;
  const u = await ctx.db.user.create({
    data: {
      email,
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash: await hashPassword('Admin1234!'),
      fullName: 'Admin',
    },
  });
  const res = await request(ctx.http())
    .post('/api/v1/auth/login')
    .send({ email, password: 'Admin1234!' })
    .expect(200);
  return {
    token: res.body.accessToken,
    userId: u.id,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

let vknSeq = 100;
/** Checksum-geçerli benzersiz VKN. */
export function vkn(): string {
  const d = String(100000000 + vknSeq++)
    .slice(-9)
    .split('')
    .map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (d[i]! + 9 - i) % 10;
    let v = (tmp * 2 ** (9 - i)) % 9;
    if (tmp !== 0 && v === 0) v = 9;
    sum += v;
  }
  return d.join('') + String((10 - (sum % 10)) % 10);
}

/** API ile firma oluşturur, sonra doğrulanmış + uyumlu yapar (belge onay akışı ayrı testte). */
export async function verifiedCompany(
  ctx: TestCtx,
  s: Session,
  type: 'SHIPPER' | 'CARRIER' | 'BOTH',
  city = 'İstanbul',
) {
  const res = await request(ctx.http())
    .post('/api/v1/companies')
    .set(s.auth)
    .send({
      legalName: `Firma ${uniq()} A.Ş.`,
      taxOffice: 'Kadıköy',
      taxNumber: vkn(),
      address: 'Test Cd. No:1',
      city,
      type,
    })
    .expect(201);
  await ctx.db.company.update({
    where: { id: res.body.id },
    data: {
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      listingsReviewedCount: 3,
      complianceValidUntil: FAR,
      intlValidUntil: FAR,
    },
  });
  return res.body.id as string;
}

let plateSeq = 100;
export const plate = () => `34 TST ${plateSeq++}`;

/** Çekici + dorse + şoför (uyumlu). */
export async function fleetUnit(
  ctx: TestCtx,
  s: Session,
  trailer: Partial<{
    trailerType: string;
    capacityKg: number;
    features: string[];
    minTempC: number;
    maxTempC: number;
  }> = {},
) {
  const h = request(ctx.http());
  const v = await h
    .post('/api/v1/vehicles')
    .set(s.auth)
    .send({ plate: plate(), type: 'TRACTOR', brand: 'Volvo', model: 'FH', year: 2022 })
    .expect(201);
  const t = await request(ctx.http())
    .post('/api/v1/trailers')
    .set(s.auth)
    .send({
      plate: plate(),
      trailerType: trailer.trailerType ?? 'TENTELI',
      capacityKg: trailer.capacityKg ?? 24000,
      volumeM3: 86,
      lengthCm: 1360,
      widthCm: 248,
      heightCm: 270,
      loadingMeters: 13.6,
      palletCapacity: 33,
      axleCount: 3,
      features: trailer.features ?? ['SIDE_OPENING'],
      ...(trailer.minTempC !== undefined
        ? { minTempC: trailer.minTempC, maxTempC: trailer.maxTempC }
        : {}),
    })
    .expect(201);
  const d = await request(ctx.http())
    .post('/api/v1/drivers')
    .set(s.auth)
    .send({
      fullName: 'Ahmet Şoför',
      phone: '05329998877',
      srcTypes: ['SRC4'],
      hasPsikoteknik: true,
    })
    .expect(201);
  await ctx.db.vehicle.update({ where: { id: v.body.id }, data: { complianceValidUntil: FAR } });
  await ctx.db.trailer.update({
    where: { id: t.body.id },
    data: { complianceValidUntil: FAR, adrValidUntil: FAR },
  });
  await ctx.db.driver.update({
    where: { id: d.body.id },
    data: { complianceValidUntil: FAR, adrValidUntil: FAR, intlValidUntil: FAR },
  });
  return {
    vehicleId: v.body.id as string,
    trailerId: t.body.id as string,
    driverId: d.body.id as string,
    plate: v.body.plate as string,
  };
}

export const at = (hoursFromNow: number) =>
  new Date(Date.now() + hoursFromNow * HOUR).toISOString();

export function loadBody(overrides: Record<string, unknown> = {}) {
  return {
    pickup: {
      address: 'Tersane Cd. 5',
      city: 'İstanbul',
      district: 'Tuzla',
      windowStart: at(20),
      windowEnd: at(28),
    },
    delivery: {
      address: 'Ostim Depo',
      city: 'Ankara',
      district: 'Ostim',
      windowStart: at(40),
      windowEnd: at(52),
    },
    cargoType: 'Paletli gıda',
    weightKg: 20000,
    volumeM3: 70,
    loadingMeters: 13,
    palletCount: 30,
    palletType: 'EUR',
    requiredTrailerTypes: ['TENTELI', 'MEGA'],
    pricingMode: 'OPEN_TO_OFFER',
    budgetMin: '24000',
    budgetMax: '30000',
    ...overrides,
  };
}

export function postingBody(
  unit: { vehicleId: string; trailerId: string; driverId: string },
  overrides: Record<string, unknown> = {},
) {
  return {
    ...unit,
    availableFrom: at(-2),
    availableUntil: at(72),
    origin: { address: 'Park alanı', city: 'Kocaeli', district: 'Gebze', lat: 40.8, lng: 29.43 },
    preferredDestinations: [{ country: 'TR', city: 'Ankara' }],
    maxDeadheadKm: 200,
    minPricePerKm: '50',
    ...overrides,
  };
}

/** Yük oluştur + yayınla. */
export async function publishedLoad(
  ctx: TestCtx,
  s: Session,
  overrides: Record<string, unknown> = {},
) {
  const created = await request(ctx.http())
    .post('/api/v1/loads')
    .set(s.auth)
    .send(loadBody(overrides))
    .expect(201);
  await request(ctx.http())
    .post(`/api/v1/loads/${created.body.id}/publish`)
    .set(s.auth)
    .expect(200);
  return created.body.id as string;
}

export async function publishedPosting(
  ctx: TestCtx,
  s: Session,
  unit: { vehicleId: string; trailerId: string; driverId: string },
  overrides: Record<string, unknown> = {},
) {
  const created = await request(ctx.http())
    .post('/api/v1/truck-postings')
    .set(s.auth)
    .send(postingBody(unit, overrides))
    .expect(201);
  await request(ctx.http())
    .post(`/api/v1/truck-postings/${created.body.id}/publish`)
    .set(s.auth)
    .expect(200);
  return created.body.id as string;
}

/** Shipper + carrier + MUTUAL eşleşme hazır senaryo. */
export async function mutualScenario(ctx: TestCtx) {
  const shipper = await register(ctx, 'SHIPPER_USER');
  const carrier = await register(ctx, 'CARRIER_USER');
  const shipperCompanyId = await verifiedCompany(ctx, shipper, 'SHIPPER');
  const carrierCompanyId = await verifiedCompany(ctx, carrier, 'CARRIER', 'Kocaeli');
  const unit = await fleetUnit(ctx, carrier);
  const loadId = await publishedLoad(ctx, shipper);
  const postingId = await publishedPosting(ctx, carrier, unit);
  await ctx.drain();
  const match = await ctx.db.match.findUniqueOrThrow({
    where: { loadId_truckPostingId: { loadId, truckPostingId: postingId } },
  });
  await request(ctx.http())
    .post(`/api/v1/matches/${match.id}/interest`)
    .set(shipper.auth)
    .send({ interested: true })
    .expect(200);
  await request(ctx.http())
    .post(`/api/v1/matches/${match.id}/interest`)
    .set(carrier.auth)
    .send({ interested: true })
    .expect(200);
  return {
    shipper,
    carrier,
    shipperCompanyId,
    carrierCompanyId,
    unit,
    loadId,
    postingId,
    matchId: match.id,
  };
}
