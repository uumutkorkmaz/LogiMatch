import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LoadsService } from '../src/listings/loads.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { OffersService } from '../src/deals/offers.service';
import {
  at,
  createTestApp,
  HOUR,
  loadBody,
  fleetUnit,
  mutualScenario,
  publishedLoad,
  publishedPosting,
  register,
  resetDb,
  type TestCtx,
  verifiedCompany,
} from './helpers';

/** Prompt §6 uç durumları — API üzerinden. */
describe('business rules (edge cases)', () => {
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

  const acceptedShipment = async () => {
    const s = await mutualScenario(ctx);
    const o = await api()
      .post(`/api/v1/matches/${s.matchId}/offers`)
      .set(s.carrier.auth)
      .send({ amount: '30000' })
      .expect(201);
    const sh = await api()
      .post(`/api/v1/offers/${o.body.id}/accept`)
      .set(s.shipper.auth)
      .expect(201);
    return { ...s, shipmentId: sh.body.id as string };
  };

  it('#4 offers expire via the delayed job handler (state re-read, idempotent)', async () => {
    const s = await mutualScenario(ctx);
    const o = await api()
      .post(`/api/v1/matches/${s.matchId}/offers`)
      .set(s.carrier.auth)
      .send({ amount: '28000', validUntil: new Date(Date.now() + 1500).toISOString() })
      .expect(201);
    const offers = ctx.app.get(OffersService);
    await offers.expire(o.body.id); // henüz süresi dolmadı → dokunmaz
    expect((await ctx.db.offer.findUniqueOrThrow({ where: { id: o.body.id } })).status).toBe(
      'PENDING',
    );
    await new Promise((r) => setTimeout(r, 1600));
    await offers.expire(o.body.id);
    await offers.expire(o.body.id);
    expect((await ctx.db.offer.findUniqueOrThrow({ where: { id: o.body.id } })).status).toBe(
      'EXPIRED',
    );
    expect((await ctx.db.load.findUniqueOrThrow({ where: { id: s.loadId } })).status).toBe(
      'MATCHING',
    );
    await api().post(`/api/v1/offers/${o.body.id}/accept`).set(s.shipper.auth).expect(409);
  });

  it('#5 expired loads close their matches and pending offers', async () => {
    const s = await mutualScenario(ctx);
    await api()
      .post(`/api/v1/matches/${s.matchId}/offers`)
      .set(s.carrier.auth)
      .send({ amount: '28000' })
      .expect(201);
    await ctx.db.load.update({
      where: { id: s.loadId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await ctx.app.get(LoadsService).expire(s.loadId);
    expect((await ctx.db.load.findUniqueOrThrow({ where: { id: s.loadId } })).status).toBe(
      'EXPIRED',
    );
    expect((await ctx.db.match.findUniqueOrThrow({ where: { id: s.matchId } })).status).toBe(
      'EXPIRED',
    );
    expect(await ctx.db.offer.count({ where: { loadId: s.loadId, status: 'PENDING' } })).toBe(0);
  });

  it('#11 negotiation is capped at 5 rounds', async () => {
    const s = await mutualScenario(ctx);
    let o = await api()
      .post(`/api/v1/matches/${s.matchId}/offers`)
      .set(s.carrier.auth)
      .send({ amount: '35000' })
      .expect(201);
    const sides = [s.shipper, s.carrier, s.shipper, s.carrier];
    for (const [i, side] of sides.entries()) {
      o = await api()
        .post(`/api/v1/offers/${o.body.id}/counter`)
        .set(side.auth)
        .send({ amount: String(30000 + i * 100) })
        .expect(201);
    }
    expect(o.body.round).toBe(5);
    const blocked = await api()
      .post(`/api/v1/offers/${o.body.id}/counter`)
      .set(s.shipper.auth)
      .send({ amount: '29000' })
      .expect(409);
    expect(blocked.body.code).toBe('MAX_ROUNDS');
    await api().post(`/api/v1/offers/${o.body.id}/reject`).set(s.shipper.auth).expect(200);
    const m = await ctx.db.match.findUniqueOrThrow({ where: { id: s.matchId } });
    expect(m.status).toBe('DISMISSED');
    expect(m.dismissReason).toBe('NEGOTIATION_FAILED');
  });

  it('#13 an offer can be withdrawn by its author until accepted', async () => {
    const s = await mutualScenario(ctx);
    const o = await api()
      .post(`/api/v1/matches/${s.matchId}/offers`)
      .set(s.carrier.auth)
      .send({ amount: '28000' })
      .expect(201);
    await api().post(`/api/v1/offers/${o.body.id}/withdraw`).set(s.shipper.auth).expect(403);
    await api().post(`/api/v1/offers/${o.body.id}/withdraw`).set(s.carrier.auth).expect(200);
    const o2 = await api()
      .post(`/api/v1/matches/${s.matchId}/offers`)
      .set(s.carrier.auth)
      .send({ amount: '27500' })
      .expect(201);
    expect(o2.body.round).toBe(2);
    await api().post(`/api/v1/offers/${o2.body.id}/accept`).set(s.shipper.auth).expect(201);
    const res = await api()
      .post(`/api/v1/offers/${o2.body.id}/withdraw`)
      .set(s.carrier.auth)
      .expect(409);
    expect(res.body.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('#14 a BOTH company cannot bid on its own load with its own truck', async () => {
    const both = await register(ctx, 'SHIPPER_USER');
    await verifiedCompany(ctx, both, 'BOTH', 'Kocaeli');
    const unit = await fleetUnit(ctx, both);
    const loadId = await publishedLoad(ctx, both);
    const postingId = await publishedPosting(ctx, both, unit);
    await ctx.drain();
    expect(await ctx.db.match.count({ where: { loadId, truckPostingId: postingId } })).toBe(0);
    const res = await api()
      .post('/api/v1/matches')
      .set(both.auth)
      .send({ loadId, truckPostingId: postingId })
      .expect(422);
    expect(res.body.failures).toContain('SELF_DEALING');
  });

  it('#16 the first 3 listings of a new company go through moderation', async () => {
    const shipper = await register(ctx, 'SHIPPER_USER');
    const companyId = await verifiedCompany(ctx, shipper, 'SHIPPER');
    await ctx.db.company.update({ where: { id: companyId }, data: { listingsReviewedCount: 0 } });
    const loadId = await publishedLoad(ctx, shipper);
    const load = await ctx.db.load.findUniqueOrThrow({ where: { id: loadId } });
    expect(load.moderationStatus).toBe('PENDING_REVIEW');
    // İncelemedeki ilan panoda görünmez.
    const carrier = await register(ctx, 'CARRIER_USER');
    await verifiedCompany(ctx, carrier, 'CARRIER');
    const board = await api().get('/api/v1/loads').set(carrier.auth).expect(200);
    expect(board.body.items.map((l: { id: string }) => l.id)).not.toContain(loadId);
    expect(
      await ctx.db.riskFlag.count({ where: { type: 'LISTING_REVIEW', entityId: loadId } }),
    ).toBe(1);
  });

  it('#8 #10 cancellation fees follow the policy tiers; shipper pays deadhead after departure', async () => {
    const s = await acceptedShipment();
    // Yükleme penceresi ~20 saat sonra → <24 saat kademesi (%25).
    await api()
      .post(`/api/v1/shipments/${s.shipmentId}/events`)
      .set(s.carrier.auth)
      .send({ type: 'DEPARTED_TO_PICKUP' })
      .expect(201);
    const res = await api()
      .post(`/api/v1/shipments/${s.shipmentId}/cancel`)
      .set(s.shipper.auth)
      .send({ reason: 'Müşteri siparişi iptal etti' })
      .expect(200);
    expect(res.body.cancellation.tier).toBe('LT_24H');
    expect(Number(res.body.cancellation.fee)).toBe(7500);
    expect(Number(res.body.cancellation.deadheadCompensation)).toBeGreaterThan(0);
    expect(res.body.cancellation.payer).toBe('SHIPPER');
    const load = await ctx.db.load.findUniqueOrThrow({ where: { id: s.loadId } });
    expect(load.status).toBe('CANCELLED');
    // Araç, müsaitlik sürdüğü için tekrar aktif.
    expect(
      (await ctx.db.truckPosting.findUniqueOrThrow({ where: { id: s.postingId } })).status,
    ).toBe('ACTIVE');
    const settlement = await api()
      .get(`/api/v1/shipments/${s.shipmentId}/settlement`)
      .set(s.carrier.auth)
      .expect(200);
    expect(settlement.body.kind).toBe('CANCELLED');
    expect(settlement.body.cancellation.payer).toBe('SHIPPER');
    const invoices = await ctx.db.invoice.findMany({ where: { shipmentId: s.shipmentId } });
    expect(invoices.map((i) => i.kind).sort()).toEqual(['CANCELLATION_FEE', 'COMMISSION']);
  });

  it('#9 carrier no-show: reported after the window, load reopens, streak of 3 → company under review', async () => {
    const s = await acceptedShipment();
    // Erken bildirim reddedilir.
    const early = await api()
      .post(`/api/v1/shipments/${s.shipmentId}/cancel`)
      .set(s.shipper.auth)
      .send({ reason: 'gelmedi', noShow: true })
      .expect(422);
    expect(early.body.code).toBe('NO_SHOW_TOO_EARLY');
    // Pencereyi geçmişe al.
    await ctx.db.load.update({
      where: { id: s.loadId },
      data: {
        pickupWindowStart: new Date(Date.now() - 10 * HOUR),
        pickupWindowEnd: new Date(Date.now() - 4 * HOUR),
      },
    });
    await ctx.db.companyStats.update({
      where: { companyId: s.carrierCompanyId },
      data: { consecutiveNoShows: 2 },
    });
    const res = await api()
      .post(`/api/v1/shipments/${s.shipmentId}/cancel`)
      .set(s.shipper.auth)
      .send({ reason: 'Araç gelmedi', noShow: true })
      .expect(200);
    expect(res.body.cancelledBy).toBe('CARRIER');
    expect(res.body.noShow).toBe(true);
    const company = await ctx.db.company.findUniqueOrThrow({ where: { id: s.carrierCompanyId } });
    expect(company.status).toBe('UNDER_REVIEW');
    expect(
      await ctx.db.riskFlag.count({
        where: { type: 'NO_SHOW_STREAK', companyId: s.carrierCompanyId },
      }),
    ).toBe(1);
    const stats = await ctx.db.companyStats.findUniqueOrThrow({
      where: { companyId: s.carrierCompanyId },
    });
    expect(stats.noShowCount).toBe(1);
    expect(stats.consecutiveNoShows).toBe(3);
  });

  it('carrier cancellation with an open pickup window reopens the load for matching', async () => {
    const s = await acceptedShipment();
    await api()
      .post(`/api/v1/shipments/${s.shipmentId}/cancel`)
      .set(s.carrier.auth)
      .send({ reason: 'Arıza' })
      .expect(200);
    expect((await ctx.db.load.findUniqueOrThrow({ where: { id: s.loadId } })).status).toBe(
      'PUBLISHED',
    );
    expect(
      (await ctx.db.truckPosting.findUniqueOrThrow({ where: { id: s.postingId } })).status,
    ).toBe('EXPIRED');
    const stats = await ctx.db.companyStats.findUniqueOrThrow({
      where: { companyId: s.carrierCompanyId },
    });
    expect(stats.carrierCancelled).toBe(1);
  });

  it('#20 geocoding failure keeps the load in DRAFT until a map pin is set', async () => {
    const shipper = await register(ctx, 'SHIPPER_USER');
    await verifiedCompany(ctx, shipper, 'SHIPPER');
    const created = await api()
      .post('/api/v1/loads')
      .set(shipper.auth)
      .send(
        loadBody({
          pickup: {
            address: 'Bilinmeyen',
            city: 'Atlantis',
            windowStart: at(20),
            windowEnd: at(28),
          },
        }),
      )
      .expect(201);
    expect(created.body.geocodeStatus).toBe('FAILED');
    const pub = await api()
      .post(`/api/v1/loads/${created.body.id}/publish`)
      .set(shipper.auth)
      .expect(422);
    expect(pub.body.code).toBe('GEOCODE_FAILED');
    const pinned = await api()
      .post(`/api/v1/loads/${created.body.id}/pin`)
      .set(shipper.auth)
      .send({ target: 'pickup', lat: 40.9, lng: 29.2 })
      .expect(200);
    expect(pinned.body.geocodeStatus).toBe('MANUAL_PIN');
    await api().post(`/api/v1/loads/${created.body.id}/publish`).set(shipper.auth).expect(200);
  });

  it('#21 unroutable legs mark ROUTE_NOT_FOUND and the estimate falls back to manual pricing', async () => {
    const user = await register(ctx, 'SHIPPER_USER');
    const res = await api()
      .post('/api/v1/pricing/estimate')
      .set(user.auth)
      .send({
        origin: { lat: 41, lng: 29 },
        destination: { lat: 60, lng: 100 },
        trailerType: 'TENTELI',
        weightKg: 20000,
      })
      .expect(200);
    expect(res.body.routeStatus).toBe('ROUTE_NOT_FOUND');
    expect(res.body.suggestedMin).toBeNull();
  });

  it('#24 #25 international loads: EUR, VAT-exempt, FX locked at acceptance', async () => {
    const shipper = await register(ctx, 'SHIPPER_USER');
    await verifiedCompany(ctx, shipper, 'SHIPPER');
    const carrier = await register(ctx, 'CARRIER_USER');
    await verifiedCompany(ctx, carrier, 'CARRIER', 'İstanbul');
    const unit = await fleetUnit(ctx, carrier);
    await ctx.db.driver.update({
      where: { id: unit.driverId },
      data: { visaCountries: ['SCHENGEN'] },
    });
    const loadId = await publishedLoad(ctx, shipper, {
      delivery: {
        address: 'Depo',
        city: 'Sofya',
        country: 'BG',
        windowStart: at(60),
        windowEnd: at(80),
      },
      transportScope: 'INTERNATIONAL',
      currency: 'EUR',
      budgetMin: '1500',
      budgetMax: '2200',
    });
    const postingId = await publishedPosting(ctx, carrier, unit, {
      origin: { address: 'Hadımköy', city: 'İstanbul', district: 'Hadımköy', lat: 41.1, lng: 28.6 },
      acceptsInternational: true,
      preferredDestinations: [{ country: 'BG' }],
      minPricePerKm: '1.2',
      currency: 'EUR',
    });
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
      .send({ amount: '2000' })
      .expect(201);
    const sh = await api().post(`/api/v1/offers/${o.body.id}/accept`).set(shipper.auth).expect(201);
    expect(sh.body.currency).toBe('EUR');
    expect(Number(sh.body.lockedFxRate)).toBe(45);
    expect(Number(sh.body.vatRate)).toBe(0);
    const st = await api()
      .get(`/api/v1/shipments/${sh.body.id}/settlement`)
      .set(shipper.auth)
      .expect(200);
    expect(st.body.transport.vatAmount).toBe('0.00');
    expect(st.body.transport.withholdingAmount).toBe('0.00');
  });

  it('#18 fleet deletes are soft; assets in active use cannot be deleted', async () => {
    const s = await mutualScenario(ctx);
    const inUse = await api()
      .delete(`/api/v1/vehicles/${s.unit.vehicleId}`)
      .set(s.carrier.auth)
      .expect(409);
    expect(inUse.body.code).toBe('ASSET_IN_USE');
    const extra = await fleetUnit(ctx, s.carrier);
    await api().delete(`/api/v1/vehicles/${extra.vehicleId}`).set(s.carrier.auth).expect(204);
    const list = await api().get('/api/v1/vehicles').set(s.carrier.auth).expect(200);
    expect(list.body.map((v: { id: string }) => v.id)).not.toContain(extra.vehicleId);
    const raw = await ctx.db.vehicle.findFirst({
      where: { id: extra.vehicleId, deletedAt: { not: null } },
    });
    expect(raw?.deletedAt).toBeTruthy();
  });

  it('append-only tables reject updates at the database level', async () => {
    const s = await acceptedShipment();
    const ev = await ctx.db.shipmentEvent.findFirstOrThrow({ where: { shipmentId: s.shipmentId } });
    await expect(
      ctx.db.shipmentEvent.update({ where: { id: ev.id }, data: { note: 'x' } }),
    ).rejects.toThrow(/append-only/);
    await expect(ctx.db.shipment.delete({ where: { id: s.shipmentId } })).rejects.toThrow(
      /append-only/,
    );
  });

  it('#29 notification dedup: the same event within 5 minutes is sent once', async () => {
    const u = await register(ctx, 'SHIPPER_USER');
    const n = ctx.app.get(NotificationsService);
    await n.notifyUsers(null, [u.userId], 'MESSAGE_RECEIVED', {}, { dedupKey: 'x:1' });
    await n.notifyUsers(null, [u.userId], 'MESSAGE_RECEIVED', {}, { dedupKey: 'x:1' });
    await n.notifyUsers(null, [u.userId], 'MESSAGE_RECEIVED', {}, { dedupKey: 'x:2' });
    expect(await ctx.db.notification.count({ where: { userId: u.userId } })).toBe(2);
  });

  it('RBAC: an accountant cannot create listings but can read finance', async () => {
    const s = await acceptedShipment();
    const acc = await register(ctx, 'SHIPPER_USER');
    await ctx.db.companyMember.create({
      data: { userId: acc.userId, companyId: s.shipperCompanyId, companyRole: 'ACCOUNTANT' },
    });
    const denied = await api().post('/api/v1/loads').set(acc.auth).send(loadBody()).expect(403);
    expect(denied.body.code).toBe('COMPANY_PERMISSION_DENIED');
    await api().get(`/api/v1/shipments/${s.shipmentId}/settlement`).set(acc.auth).expect(200);
    // Taraf olmayan biri sevkiyatı göremez.
    const stranger = await register(ctx, 'CARRIER_USER');
    await api().get(`/api/v1/shipments/${s.shipmentId}`).set(stranger.auth).expect(403);
    await api().get('/api/v1/admin/metrics').set(s.shipper.auth).expect(403);
  });

  it('unverified companies cannot publish', async () => {
    const shipper = await register(ctx, 'SHIPPER_USER');
    const companyId = await verifiedCompany(ctx, shipper, 'SHIPPER');
    await ctx.db.company.update({
      where: { id: companyId },
      data: { verificationStatus: 'PENDING' },
    });
    const created = await api()
      .post('/api/v1/loads')
      .set(shipper.auth)
      .send(loadBody())
      .expect(201);
    const res = await api()
      .post(`/api/v1/loads/${created.body.id}/publish`)
      .set(shipper.auth)
      .expect(403);
    expect(res.body.code).toBe('COMPANY_NOT_VERIFIED');
  });
});
