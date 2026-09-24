import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  fleetUnit,
  publishedLoad,
  publishedPosting,
  register,
  resetDb,
  type Session,
  type TestCtx,
  verifiedCompany,
} from './helpers';

/**
 * Tam akış: yük yayınla → eşleş → karşılıklı ilgi → maskeli sohbet → pazarlık → kabul →
 * sevkiyat durumları → POD → onay → fatura taslakları → çift kör değerlendirme.
 */
describe('marketplace end-to-end', () => {
  let ctx: TestCtx;
  let shipper: Session;
  let carrier: Session;
  let shipperCompanyId: string;
  let carrierCompanyId: string;
  let unit: Awaited<ReturnType<typeof fleetUnit>>;
  let loadId: string;
  let postingId: string;
  let matchId: string;
  let shipmentId: string;
  const api = () => request(ctx.http());

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx);
    shipper = await register(ctx, 'SHIPPER_USER');
    carrier = await register(ctx, 'CARRIER_USER');
    shipperCompanyId = await verifiedCompany(ctx, shipper, 'SHIPPER');
    carrierCompanyId = await verifiedCompany(ctx, carrier, 'CARRIER', 'Kocaeli');
    unit = await fleetUnit(ctx, carrier);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('creates a draft load with geocoding, route and price estimate', async () => {
    const res = await api()
      .post('/api/v1/loads')
      .set(shipper.auth)
      .send({
        pickup: {
          address: 'Tersane Cd. 5',
          city: 'İstanbul',
          district: 'Tuzla',
          windowStart: new Date(Date.now() + 20 * 3.6e6).toISOString(),
          windowEnd: new Date(Date.now() + 28 * 3.6e6).toISOString(),
        },
        delivery: {
          address: 'Ostim',
          city: 'Ankara',
          district: 'Ostim',
          windowStart: new Date(Date.now() + 40 * 3.6e6).toISOString(),
          windowEnd: new Date(Date.now() + 52 * 3.6e6).toISOString(),
        },
        cargoType: 'Paletli gıda',
        weightKg: 20000,
        requiredTrailerTypes: ['TENTELI'],
        pricingMode: 'OPEN_TO_OFFER',
      })
      .expect(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.referenceNo).toMatch(/^LD-\d{4}-\d{6}$/);
    expect(res.body.geocodeStatus).toBe('OK');
    expect(res.body.routeStatus).toBe('OK');
    expect(res.body.routeDistanceKm).toBeGreaterThan(350);
    expect(Number(res.body.estimatedPriceMin)).toBeGreaterThan(10000);
    expect(res.body.stops).toHaveLength(2);
  });

  it('publishes and computes matches asynchronously (outbox → job)', async () => {
    loadId = await publishedLoad(ctx, shipper);
    postingId = await publishedPosting(ctx, carrier, unit);
    await ctx.drain();
    const res = await api().get(`/api/v1/loads/${loadId}/matches`).set(shipper.auth).expect(200);
    expect(res.body).toHaveLength(1);
    const m = res.body[0];
    matchId = m.id;
    expect(Number(m.score)).toBeGreaterThanOrEqual(40);
    expect(m.scoreBreakdown.components.proximity.weight).toBe(0.25);
    expect(m.scoreBreakdown.reasons).toContain('NEAR_PICKUP');
    const load = await api().get(`/api/v1/loads/${loadId}`).set(shipper.auth).expect(200);
    expect(load.body.status).toBe('MATCHING');
  });

  it('masks the counterparty before the deal (disintermediation)', async () => {
    const asShipper = await api().get(`/api/v1/matches/${matchId}`).set(shipper.auth).expect(200);
    expect(asShipper.body.status).toBe('VIEWED');
    expect(asShipper.body.contactRevealed).toBe(false);
    expect(asShipper.body.truckPosting.vehicle.plate).toBe('34 *** ***');
    expect(asShipper.body.truckPosting.carrierCompany.masked).toBe(true);
    expect(asShipper.body.truckPosting.carrierCompany.alias).toMatch(/^Taşıyıcı #/);
    expect(asShipper.body.truckPosting.carrierCompany.legalName).toBeUndefined();

    const asCarrier = await api().get(`/api/v1/loads/${loadId}`).set(carrier.auth).expect(200);
    expect(asCarrier.body.viewerSide).toBe('PUBLIC');
    expect(asCarrier.body.pickupAddress).toBe('Tuzla, İstanbul');
    expect(asCarrier.body.shipper.alias).toMatch(/^Yük Veren #/);
    expect(asCarrier.body.createdByUserId).toBeUndefined();
  });

  it('opens negotiation only after mutual interest', async () => {
    await api()
      .post(`/api/v1/matches/${matchId}/offers`)
      .set(carrier.auth)
      .send({ amount: '29000' })
      .expect(409);
    const a = await api()
      .post(`/api/v1/matches/${matchId}/interest`)
      .set(carrier.auth)
      .send({ interested: true })
      .expect(200);
    expect(a.body.status).toBe('INTERESTED_BY_CARRIER');
    const b = await api()
      .post(`/api/v1/matches/${matchId}/interest`)
      .set(shipper.auth)
      .send({ interested: true })
      .expect(200);
    expect(b.body.status).toBe('MUTUAL');
    expect(b.body.conversation.id).toBeTruthy();
  });

  it('masks contact details in pre-deal chat and flags them for admin', async () => {
    const convs = await api().get('/api/v1/conversations').set(carrier.auth).expect(200);
    const conv = convs.body.find((c: { matchId: string }) => c.matchId === matchId);
    const sent = await api()
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .set(carrier.auth)
      .send({ body: `Plakamız ${unit.plate}, beni 0532 111 22 33 den arayın` })
      .expect(201);
    expect(sent.body.warning).toBe('CONTACT_INFO_MASKED');
    expect(sent.body.body).not.toContain('0532');
    expect(sent.body.body).not.toContain(unit.plate);
    const seen = await api()
      .get(`/api/v1/conversations/${conv.id}/messages`)
      .set(shipper.auth)
      .expect(200);
    expect(seen.body.items[0].body).toContain('[gizlendi]');
    expect(seen.body.items[0].bodyOriginal).toBeUndefined();
    const flags = await ctx.db.riskFlag.count({
      where: { type: 'CONTACT_LEAK', companyId: carrierCompanyId },
    });
    expect(flags).toBe(1);
  });

  it('negotiates: offer → counter (round 2) with above-budget warning', async () => {
    const o1 = await api()
      .post(`/api/v1/matches/${matchId}/offers`)
      .set(carrier.auth)
      .send({ amount: '36000', note: 'Yakıt arttı' })
      .expect(201);
    expect(o1.body.round).toBe(1);
    expect(o1.body.warning).toBe('ABOVE_BUDGET');
    // Aynı eşleşmede ikinci bekleyen teklif açılamaz.
    await api()
      .post(`/api/v1/matches/${matchId}/offers`)
      .set(shipper.auth)
      .send({ amount: '25000' })
      .expect(409);
    // Teklif veren kendi teklifini kabul edemez.
    await api().post(`/api/v1/offers/${o1.body.id}/accept`).set(carrier.auth).expect(403);
    const o2 = await api()
      .post(`/api/v1/offers/${o1.body.id}/counter`)
      .set(shipper.auth)
      .send({ amount: '28000' })
      .expect(201);
    expect(o2.body.round).toBe(2);
    expect(o2.body.parentOfferId).toBe(o1.body.id);
    const load = await api().get(`/api/v1/loads/${loadId}`).set(shipper.auth).expect(200);
    expect(load.body.status).toBe('OFFERED');
    const incoming = await api()
      .get('/api/v1/offers?direction=incoming')
      .set(carrier.auth)
      .expect(200);
    expect(incoming.body.items.map((o: { id: string }) => o.id)).toContain(o2.body.id);
  });

  it('accepts: shipment created, commission locked, contacts revealed', async () => {
    const pending = await ctx.db.offer.findFirstOrThrow({ where: { matchId, status: 'PENDING' } });
    const res = await api()
      .post(`/api/v1/offers/${pending.id}/accept`)
      .set(carrier.auth)
      .expect(201);
    shipmentId = res.body.id;
    expect(res.body.referenceNo).toMatch(/^SH-/);
    expect(Number(res.body.agreedAmount)).toBe(28000);
    expect(Number(res.body.commissionAmount)).toBe(2800);
    expect(Number(res.body.carrierPayout)).toBe(25200);
    expect(res.body.commissionModel).toBe('CARRIER_PAYS');

    const [load, posting, match] = await Promise.all([
      ctx.db.load.findUniqueOrThrow({ where: { id: loadId } }),
      ctx.db.truckPosting.findUniqueOrThrow({ where: { id: postingId } }),
      api().get(`/api/v1/matches/${matchId}`).set(shipper.auth).expect(200),
    ]);
    expect(load.status).toBe('ASSIGNED');
    expect(posting.status).toBe('RESERVED');
    expect(match.body.contactRevealed).toBe(true);
    expect(match.body.truckPosting.vehicle.plate).toBe(unit.plate);

    // Sonradan komisyon oranı değişse bile sevkiyat kilitli şartlarla kalır (#26).
    await ctx.db.pricingConfig.create({
      data: {
        effectiveFrom: new Date(),
        commissionModel: 'SHIPPER_PAYS',
        commissionRate: '0.20',
        vatRate: '0.20',
        commissionVatRate: '0.20',
        withholdingRatio: '0.2',
        withholdingThreshold: '12000',
        ratePerKmBands: {},
        multipliers: {
          adr: 1,
          tempControl: 1,
          international: 1,
          minTripTry: 0,
          lightLoadKg: 0,
          lightLoadFactor: 1,
        },
      },
    });
    const settlement = await api()
      .get(`/api/v1/shipments/${shipmentId}/settlement`)
      .set(shipper.auth)
      .expect(200);
    expect(settlement.body.commissionRate).toBe('0.1');
    expect(settlement.body.transport.subtotal).toBe('28000.00');
    expect(settlement.body.transport.vatAmount).toBe('5600.00');
  });

  it('enforces the shipment state machine and requires POD', async () => {
    const step = (status: string, s = carrier) =>
      api().post(`/api/v1/shipments/${shipmentId}/status`).set(s.auth).send({ status });
    await step('IN_TRANSIT').expect(409); // ASSIGNED → IN_TRANSIT atlanamaz
    await step('AT_PICKUP', shipper).expect(409); // shipper yükleme durumunu ilerletemez
    for (const s of ['AT_PICKUP', 'LOADED', 'IN_TRANSIT', 'AT_DELIVERY', 'DELIVERED'])
      await step(s).expect(200);
    expect((await ctx.db.load.findUniqueOrThrow({ where: { id: loadId } })).status).toBe(
      'DELIVERED',
    );
    // İptal artık mümkün değil (LOADED sonrası).
    await api()
      .post(`/api/v1/shipments/${shipmentId}/cancel`)
      .set(shipper.auth)
      .send({ reason: 'vazgeçtik' })
      .expect(409);
    const noPod = await step('POD_SUBMITTED').expect(422);
    expect(noPod.body.code).toBe('POD_REQUIRED');
    expect(noPod.headers['content-type']).toContain('application/problem+json');
    await api()
      .post(`/api/v1/shipments/${shipmentId}/documents`)
      .set(carrier.auth)
      .field('type', 'POD')
      .attach('file', Buffer.from('%PDF-1.4 pod'), {
        filename: 'pod.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    await step('POD_SUBMITTED').expect(200);
    const done = await step('COMPLETED', shipper).expect(200);
    expect(done.body.status).toBe('COMPLETED');
    const events = await api()
      .get(`/api/v1/shipments/${shipmentId}/events`)
      .set(shipper.auth)
      .expect(200);
    expect(events.body.filter((e: { type: string }) => e.type === 'STATUS_CHANGED')).toHaveLength(
      8,
    );
    expect(events.body.some((e: { type: string }) => e.type === 'DOCUMENT_ADDED')).toBe(true);
  });

  it('generates invoice drafts (agent model) and a PDF', async () => {
    const res = await api()
      .get(`/api/v1/shipments/${shipmentId}/invoices`)
      .set(shipper.auth)
      .expect(200);
    const kinds = res.body.map((i: { kind: string }) => i.kind).sort();
    // Shipper yalnızca kendisine kesilen navlun faturasını görür (komisyon faturası taşıyıcıya).
    expect(kinds).toEqual(['TRANSPORT']);
    const transport = res.body[0];
    expect(transport.issuerCompanyId).toBe(carrierCompanyId);
    expect(transport.recipientCompanyId).toBe(shipperCompanyId);
    expect(Number(transport.total)).toBe(33600);
    const carrierView = await api()
      .get(`/api/v1/shipments/${shipmentId}/invoices`)
      .set(carrier.auth)
      .expect(200);
    expect(carrierView.body.map((i: { kind: string }) => i.kind).sort()).toEqual([
      'COMMISSION',
      'TRANSPORT',
    ]);
    const pdf = await api()
      .get(`/api/v1/invoices/${transport.id}/pdf`)
      .set(shipper.auth)
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('double-blind ratings become visible once both sides rate', async () => {
    await api()
      .post(`/api/v1/shipments/${shipmentId}/ratings`)
      .set(carrier.auth)
      .send({ stars: 5, punctuality: 5, cargoCare: 4 })
      .expect(422); // taşıyıcı "yük özeni" puanlayamaz
    await api()
      .post(`/api/v1/shipments/${shipmentId}/ratings`)
      .set(shipper.auth)
      .send({ stars: 5, punctuality: 4, cargoCare: 5, comment: 'Harika' })
      .expect(201);
    const hidden = await api()
      .get(`/api/v1/companies/${carrierCompanyId}/ratings`)
      .set(shipper.auth)
      .expect(200);
    expect(hidden.body.count).toBe(0);
    await api()
      .post(`/api/v1/shipments/${shipmentId}/ratings`)
      .set(carrier.auth)
      .send({ stars: 4, priceHonesty: 5 })
      .expect(201);
    await api()
      .post(`/api/v1/shipments/${shipmentId}/ratings`)
      .set(carrier.auth)
      .send({ stars: 4 })
      .expect(409);
    const visible = await api()
      .get(`/api/v1/companies/${carrierCompanyId}/ratings`)
      .set(shipper.auth)
      .expect(200);
    expect(visible.body.count).toBe(1);
    expect(visible.body.averages.stars).toBe(5);
    const stats = await ctx.db.companyStats.findUniqueOrThrow({
      where: { companyId: carrierCompanyId },
    });
    expect(stats.completedAsCarrier).toBe(1);
    const pair = await ctx.db.companyPairStats.findFirstOrThrow({ where: { carrierCompanyId } });
    expect(pair.goodCount).toBe(1);
  });

  it('writes audit logs and notifications along the way', async () => {
    expect(await ctx.db.auditLog.count({ where: { action: 'Offers.accept' } })).toBe(1);
    const n = await api().get('/api/v1/notifications').set(shipper.auth).expect(200);
    expect(n.body.items.length).toBeGreaterThan(0);
    expect(n.body.items[0].title).toBeTruthy();
  });
});
