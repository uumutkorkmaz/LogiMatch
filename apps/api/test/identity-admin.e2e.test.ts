import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DocumentsService } from '../src/documents/documents.service';
import {
  adminSession,
  createTestApp,
  fleetUnit,
  register,
  resetDb,
  type TestCtx,
  verifiedCompany,
  vkn,
} from './helpers';

describe('auth, identity, documents and admin', () => {
  let ctx: TestCtx;
  const api = () => request(ctx.http());

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(ctx);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('health and readiness', async () => {
    await api().get('/health').expect(200);
    const ready = await api().get('/ready').set('X-Request-Id', 'req-123').expect(200);
    expect(ready.body.checks).toEqual({ database: 'up', redis: 'up' });
    expect(ready.headers['x-request-id']).toBe('req-123');
  });

  it('register → login → refresh rotation → reuse detection revokes the family', async () => {
    const email = 'rot@test.dev';
    await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Test1234!', fullName: 'Rot Test', role: 'SHIPPER_USER' })
      .expect(201);
    await api()
      .post('/api/v1/auth/register')
      .send({ email, password: 'Test1234!', fullName: 'Dup', role: 'SHIPPER_USER' })
      .expect(409);
    const bad = await api()
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-pass1' })
      .expect(401);
    expect(bad.body.code).toBe('INVALID_CREDENTIALS');
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email, password: 'Test1234!' })
      .expect(200);
    const r1 = login.body.refreshToken;
    const rotated = await api().post('/api/v1/auth/refresh').send({ refreshToken: r1 }).expect(200);
    expect(rotated.body.refreshToken).not.toBe(r1);
    // Eski token tekrar kullanılırsa tüm aile iptal edilir.
    const reuse = await api().post('/api/v1/auth/refresh').send({ refreshToken: r1 }).expect(401);
    expect(reuse.body.code).toBe('REFRESH_TOKEN_REUSED');
    await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
    await api().get('/api/v1/me').expect(401);
    const me = await api()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(email);
    expect(me.body.passwordHash).toBeUndefined();
  });

  it('locks the account after 5 failed logins', async () => {
    await register(ctx, 'CARRIER_USER', 'lock@test.dev');
    for (let i = 0; i < 5; i++)
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'lock@test.dev', password: 'nope-1234' });
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'lock@test.dev', password: 'Test1234!' })
      .expect(403);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('email verification and password reset with OTP codes', async () => {
    const reg = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'otp@test.dev', password: 'Test1234!', fullName: 'Otp', role: 'SHIPPER_USER' })
      .expect(201);
    const auth = { Authorization: `Bearer ${reg.body.tokens.accessToken}` };
    await api().post('/api/v1/auth/verify-email').set(auth).send({ code: '000000' }).expect(422);
    await api()
      .post('/api/v1/auth/verify-email')
      .set(auth)
      .send({ code: reg.body.devCode })
      .expect(204);
    const forgot = await api()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'otp@test.dev' })
      .expect(202);
    await api()
      .post('/api/v1/auth/reset-password')
      .send({ email: 'otp@test.dev', code: forgot.body.devCode, newPassword: 'Yeni12345' })
      .expect(204);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: 'otp@test.dev', password: 'Yeni12345' })
      .expect(200);
  });

  it('problem+json validation errors with field paths', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'x', password: '1', role: 'ADMIN' })
      .expect(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(['email', 'password', 'role']),
    );
  });

  it('#15 duplicate VKN / IBAN creates an admin risk flag but does not block', async () => {
    const a = await register(ctx, 'SHIPPER_USER');
    const b = await register(ctx, 'SHIPPER_USER');
    const taxNumber = vkn();
    const body = {
      legalName: 'Aynı Firma A.Ş.',
      taxOffice: 'Beşiktaş',
      taxNumber,
      address: 'Adres 1',
      city: 'İstanbul',
      type: 'SHIPPER',
      iban: 'TR33 0006 1005 1978 6457 8413 26',
    };
    await api().post('/api/v1/companies').set(a.auth).send(body).expect(201);
    const second = await api().post('/api/v1/companies').set(b.auth).send(body).expect(201);
    const flags = await ctx.db.riskFlag.findMany({ where: { companyId: second.body.id } });
    expect(flags.map((f) => f.type).sort()).toEqual(['DUPLICATE_IBAN', 'DUPLICATE_TAX_NUMBER']);
  });

  it('document upload → admin approval → compliance cache → expiry scan deactivates', async () => {
    const admin = await adminSession(ctx);
    const carrier = await register(ctx, 'CARRIER_USER');
    await verifiedCompany(ctx, carrier, 'CARRIER');
    const unit = await fleetUnit(ctx, carrier);
    await ctx.db.vehicle.update({
      where: { id: unit.vehicleId },
      data: { complianceValidUntil: null },
    });

    const upload = (type: string, expiresAt?: string) =>
      api()
        .post(`/api/v1/vehicles/${unit.vehicleId}/documents`)
        .set(carrier.auth)
        .field('type', type)
        .field('expiresAt', expiresAt ?? '')
        .attach('file', Buffer.from('%PDF-1.4 test'), {
          filename: 'ruhsat.pdf',
          contentType: 'application/pdf',
        });
    const bad = await api()
      .post(`/api/v1/vehicles/${unit.vehicleId}/documents`)
      .set(carrier.auth)
      .field('type', 'INSPECTION')
      .attach('file', Buffer.from('MZ'), {
        filename: 'virus.exe',
        contentType: 'application/x-msdownload',
      })
      .expect(400);
    expect(bad.body.code).toBe('FILE_TYPE_NOT_ALLOWED');

    const lic = await request(ctx.http())
      .post(`/api/v1/vehicles/${unit.vehicleId}/documents`)
      .set(carrier.auth)
      .field('type', 'VEHICLE_LICENSE')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'ruhsat.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const insp = await upload(
      'INSPECTION',
      new Date(Date.now() + 30 * 86_400_000).toISOString(),
    ).expect(201);
    expect(insp.body.status).toBe('PENDING');
    // İmzalı URL ile indirme; imza bozulursa 403.
    const url = new URL(insp.body.url);
    await api().get(`${url.pathname}${url.search}`).expect(200);
    await api()
      .get(
        `${url.pathname}?key=${url.searchParams.get('key')}&exp=${url.searchParams.get('exp')}&sig=bogus`,
      )
      .expect(403);

    const queue = await api()
      .get('/api/v1/admin/verifications/pending')
      .set(admin.auth)
      .expect(200);
    expect(queue.body.documents.map((d: { id: string }) => d.id)).toEqual(
      expect.arrayContaining([lic.body.id, insp.body.id]),
    );
    await api()
      .post(`/api/v1/admin/documents/${lic.body.id}/approve`)
      .set(admin.auth)
      .send({})
      .expect(200);
    expect(
      (await ctx.db.vehicle.findUniqueOrThrow({ where: { id: unit.vehicleId } }))
        .complianceValidUntil,
    ).toBeNull();
    await api()
      .post(`/api/v1/admin/documents/${insp.body.id}/approve`)
      .set(admin.auth)
      .send({})
      .expect(200);
    const v = await ctx.db.vehicle.findUniqueOrThrow({ where: { id: unit.vehicleId } });
    expect(v.complianceValidUntil?.toISOString()).toBe(insp.body.expiresAt);
    await api()
      .post(`/api/v1/admin/documents/${insp.body.id}/approve`)
      .set(admin.auth)
      .send({})
      .expect(409);

    // Süre dolumu taraması (#7): belge EXPIRED, araç INACTIVE.
    await ctx.db.document.update({
      where: { id: insp.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await ctx.app.get(DocumentsService).expiryScan();
    expect(res.expired).toBe(1);
    expect((await ctx.db.vehicle.findUniqueOrThrow({ where: { id: unit.vehicleId } })).status).toBe(
      'INACTIVE',
    );
    const expiring = await api()
      .get('/api/v1/fleet/expiring-documents')
      .set(carrier.auth)
      .expect(200);
    expect(expiring.body.some((d: { id: string }) => d.id === insp.body.id)).toBe(true);
  });

  it('#19 KVKK export and anonymisation keep financial records', async () => {
    const u = await register(ctx, 'SHIPPER_USER');
    const exp = await api().get('/api/v1/me/export').set(u.auth).expect(200);
    expect(exp.body.user.id).toBe(u.userId);
    expect(exp.body.exportedAt).toBeTruthy();
    await api().post('/api/v1/me/anonymize').set(u.auth).expect(204);
    const row = await ctx.db.user.findUniqueOrThrow({ where: { id: u.userId } });
    expect(row.email).toMatch(/^anon-.*@deleted\.invalid$/);
    expect(row.fullName).toBeNull();
    expect(row.anonymizedAt).toBeTruthy();
    await api().get('/api/v1/me').set(u.auth).expect(403);
  });

  it('admin: suspend a company pauses its postings; metrics endpoint works', async () => {
    const admin = await adminSession(ctx);
    const carrier = await register(ctx, 'CARRIER_USER');
    const companyId = await verifiedCompany(ctx, carrier, 'CARRIER');
    await api()
      .post(`/api/v1/admin/companies/${companyId}/suspend`)
      .set(admin.auth)
      .send({ status: 'SUSPENDED', reason: 'Şikayet incelemesi' })
      .expect(200);
    expect((await ctx.db.company.findUniqueOrThrow({ where: { id: companyId } })).status).toBe(
      'SUSPENDED',
    );
    const list = await api().get('/api/v1/admin/companies?q=Firma').set(admin.auth).expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    const metrics = await api().get('/api/v1/admin/metrics').set(admin.auth).expect(200);
    expect(metrics.body).toHaveProperty('gmv');
    expect(metrics.body).toHaveProperty('funnel.published');
    expect(metrics.body.live).toHaveProperty('openLoads');
    const cfg = await api().get('/api/v1/admin/config').set(admin.auth).expect(200);
    expect(cfg.body.pricing.commissionModel).toBe('CARRIER_PAYS');
    const bad = await api()
      .post('/api/v1/admin/config/matching')
      .set(admin.auth)
      .send({ wHistory: 0.5 })
      .expect(409);
    expect(bad.body.code).toBe('WEIGHTS_INVALID');
    await api()
      .post('/api/v1/admin/config/pricing')
      .set(admin.auth)
      .send({ commissionRate: '0.08' })
      .expect(201);
  });

  it('metrics endpoint exposes prometheus text', async () => {
    const res = await api().get('/metrics').expect(200);
    expect(res.text).toContain('logimatch_matching_duration_seconds');
  });
});
