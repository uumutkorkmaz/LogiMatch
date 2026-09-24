import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  at,
  createTestApp,
  fleetUnit,
  mutualScenario,
  publishedLoad,
  publishedPosting,
  register,
  resetDb,
  type TestCtx,
  verifiedCompany,
} from './helpers';

/** DOMAIN §8 — gerçek PostgreSQL'e karşı paralel istekler. */
describe('concurrency', () => {
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

  it('#1 two offers on the same truck accepted simultaneously → exactly one wins, the other gets 409', async () => {
    const carrier = await register(ctx, 'CARRIER_USER');
    await verifiedCompany(ctx, carrier, 'CARRIER', 'Kocaeli');
    const unit = await fleetUnit(ctx, carrier);
    const postingId = await publishedPosting(ctx, carrier, unit);

    // İki farklı yük veren, aynı araç için MUTUAL + teklif.
    const offers: { offerId: string; shipper: Awaited<ReturnType<typeof register>> }[] = [];
    for (let i = 0; i < 2; i++) {
      const shipper = await register(ctx, 'SHIPPER_USER');
      await verifiedCompany(ctx, shipper, 'SHIPPER');
      const loadId = await publishedLoad(ctx, shipper);
      await ctx.drain();
      const m = await ctx.db.match.findUniqueOrThrow({
        where: { loadId_truckPostingId: { loadId, truckPostingId: postingId } },
      });
      await api()
        .post(`/api/v1/matches/${m.id}/interest`)
        .set(shipper.auth)
        .send({ interested: true })
        .expect(200);
      await api()
        .post(`/api/v1/matches/${m.id}/interest`)
        .set(carrier.auth)
        .send({ interested: true })
        .expect(200);
      const o = await api()
        .post(`/api/v1/matches/${m.id}/offers`)
        .set(carrier.auth)
        .send({ amount: '27000' })
        .expect(201);
      offers.push({ offerId: o.body.id, shipper });
    }

    const results = await Promise.all(
      offers.map((o) => api().post(`/api/v1/offers/${o.offerId}/accept`).set(o.shipper.auth)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(['POSTING_ALREADY_RESERVED', 'CONCURRENT_UPDATE', 'OFFER_NOT_PENDING']).toContain(
      loser.body.code,
    );
    expect(await ctx.db.shipment.count()).toBe(1);
    expect((await ctx.db.truckPosting.findUniqueOrThrow({ where: { id: postingId } })).status).toBe(
      'RESERVED',
    );
  });

  it('#3 load cancelled while an offer is being accepted → consistent outcome', async () => {
    const s = await mutualScenario(ctx);
    const o = await api()
      .post(`/api/v1/matches/${s.matchId}/offers`)
      .set(s.carrier.auth)
      .send({ amount: '27000' })
      .expect(201);
    const [accept, cancel] = await Promise.all([
      api().post(`/api/v1/offers/${o.body.id}/accept`).set(s.shipper.auth),
      api()
        .post(`/api/v1/loads/${s.loadId}/cancel`)
        .set(s.shipper.auth)
        .send({ reason: 'Plan değişti' }),
    ]);
    const load = await ctx.db.load.findUniqueOrThrow({ where: { id: s.loadId } });
    const shipments = await ctx.db.shipment.count({ where: { loadId: s.loadId } });
    if (accept.status === 201) {
      expect(load.status).toBe('ASSIGNED');
      expect(shipments).toBe(1);
      expect(cancel.status).toBe(409); // atanmış yük sevkiyat üzerinden iptal edilir
    } else {
      expect(accept.status).toBe(409);
      expect(load.status).toBe('CANCELLED');
      expect(shipments).toBe(0);
    }
  });

  it('#2 the same vehicle cannot be assigned to overlapping shipments (EXCLUDE constraint)', async () => {
    const s = await mutualScenario(ctx);
    const o = await api()
      .post(`/api/v1/matches/${s.matchId}/offers`)
      .set(s.carrier.auth)
      .send({ amount: '27000' })
      .expect(201);
    await api().post(`/api/v1/offers/${o.body.id}/accept`).set(s.shipper.auth).expect(201);

    // Araç RESERVED; aynı araçla yeni bir ilan açılabilir (yalnızca ACTIVE tekil)…
    const p2 = await publishedPosting(ctx, s.carrier, s.unit, {
      availableFrom: at(-1),
      availableUntil: at(80),
    });
    const shipper2 = await register(ctx, 'SHIPPER_USER');
    await verifiedCompany(ctx, shipper2, 'SHIPPER');
    const load2 = await publishedLoad(ctx, shipper2); // aynı zaman penceresi
    await ctx.drain();
    const m2 = await ctx.db.match.findUniqueOrThrow({
      where: { loadId_truckPostingId: { loadId: load2, truckPostingId: p2 } },
    });
    await api()
      .post(`/api/v1/matches/${m2.id}/interest`)
      .set(shipper2.auth)
      .send({ interested: true })
      .expect(200);
    await api()
      .post(`/api/v1/matches/${m2.id}/interest`)
      .set(s.carrier.auth)
      .send({ interested: true })
      .expect(200);
    const o2 = await api()
      .post(`/api/v1/matches/${m2.id}/offers`)
      .set(s.carrier.auth)
      .send({ amount: '27000' })
      .expect(201);
    // …ama çakışan ikinci atamayı veritabanı reddeder.
    const res = await api()
      .post(`/api/v1/offers/${o2.body.id}/accept`)
      .set(shipper2.auth)
      .expect(409);
    expect(res.body.code).toBe('ASSIGNMENT_OVERLAP');
    expect(await ctx.db.shipment.count({ where: { vehicleId: s.unit.vehicleId } })).toBe(1);
    // Transaction geri alındı: ikinci yük ve ilan açık kaldı.
    expect((await ctx.db.load.findUniqueOrThrow({ where: { id: load2 } })).status).toBe('OFFERED');
    expect((await ctx.db.truckPosting.findUniqueOrThrow({ where: { id: p2 } })).status).toBe(
      'ACTIVE',
    );
  });

  it('Idempotency-Key: the same request twice creates one resource and replays the response', async () => {
    const shipper = await register(ctx, 'SHIPPER_USER');
    await verifiedCompany(ctx, shipper, 'SHIPPER');
    const body = {
      pickup: { address: 'Tuzla', city: 'İstanbul', windowStart: at(20), windowEnd: at(28) },
      delivery: { address: 'Ostim', city: 'Ankara', windowStart: at(40), windowEnd: at(52) },
      cargoType: 'Koli',
      weightKg: 5000,
      requiredTrailerTypes: ['TENTELI'],
      pricingMode: 'OPEN_TO_OFFER',
    };
    const a = await api()
      .post('/api/v1/loads')
      .set(shipper.auth)
      .set('Idempotency-Key', 'k-1')
      .send(body)
      .expect(201);
    const b = await api()
      .post('/api/v1/loads')
      .set(shipper.auth)
      .set('Idempotency-Key', 'k-1')
      .send(body)
      .expect(201);
    expect(b.headers['idempotent-replayed']).toBe('true');
    expect(b.body.id).toBe(a.body.id);
    expect(await ctx.db.load.count()).toBe(1);
    const c = await api()
      .post('/api/v1/loads')
      .set(shipper.auth)
      .set('Idempotency-Key', 'k-1')
      .send({ ...body, weightKg: 6000 })
      .expect(422);
    expect(c.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('optimistic lock: concurrent edits of the same load → one 409', async () => {
    const shipper = await register(ctx, 'SHIPPER_USER');
    await verifiedCompany(ctx, shipper, 'SHIPPER');
    const created = await api()
      .post('/api/v1/loads')
      .set(shipper.auth)
      .send({
        pickup: { address: 'Tuzla', city: 'İstanbul', windowStart: at(20), windowEnd: at(28) },
        delivery: { address: 'Ostim', city: 'Ankara', windowStart: at(40), windowEnd: at(52) },
        cargoType: 'Koli',
        weightKg: 5000,
        requiredTrailerTypes: ['TENTELI'],
        pricingMode: 'OPEN_TO_OFFER',
      })
      .expect(201);
    const results = await Promise.all(
      [7000, 8000, 9000].map((w) =>
        api().patch(`/api/v1/loads/${created.body.id}`).set(shipper.auth).send({ weightKg: w }),
      ),
    );
    const ok = results.filter((r) => r.status === 200).length;
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    const load = await ctx.db.load.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(load.version).toBe(ok);
  });
});
