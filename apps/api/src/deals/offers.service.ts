import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  type CreateOfferInput,
  Decimal,
  Money,
  OPEN_LOAD_STATUSES,
  offerMachine,
  transition,
} from '@logimatch/shared';
import { type AuthActor, hasCompanyPermission, isMemberOf } from '../common/actor';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { mapPage, paginate } from '../common/pagination';
import { nextReference } from '../common/reference';
import { type Db, InjectDb, Prisma, serializable } from '../infra/prisma';
import { syncOpenLoadStatus } from '../matching/load-status';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformConfigService } from '../platform/platform-config.service';
import { PricingService } from '../pricing/pricing.service';
import { JobRegistry } from '../queue/job-registry';
import { OutboxService } from '../queue/outbox.service';

export const MAX_ROUNDS = 5;
const DEFAULT_VALIDITY_MS = 24 * 3_600_000;
/** Bütçenin bu oranı üstündeki teklif uyarı alır ama engellenmez (#12). */
const ABOVE_BUDGET_TOLERANCE = new Decimal('1.15');
/** Atama aralığı teslim penceresi sonundan sonra bu kadar uzar (araç boşa çıkma payı). */
const ASSIGNMENT_BUFFER_MS = 12 * 3_600_000;

type Side = 'SHIPPER' | 'CARRIER';

const offerInclude = {
  match: { include: { load: true, truckPosting: true } },
} satisfies Prisma.OfferInclude;
type OfferFull = Prisma.OfferGetPayload<{ include: typeof offerInclude }>;

@Injectable()
export class OffersService implements OnModuleInit {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationsService,
    private readonly pricing: PricingService,
    private readonly config: PlatformConfigService,
    private readonly matching: MatchingService,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register('offer.expire', (p) => this.expire(p.offerId));
  }

  private sideIn(
    actor: AuthActor,
    m: { load: { shipperCompanyId: string }; truckPosting: { carrierCompanyId: string } },
  ): Side {
    const side = isMemberOf(actor, m.load.shipperCompanyId)
      ? 'SHIPPER'
      : isMemberOf(actor, m.truckPosting.carrierCompanyId)
        ? 'CARRIER'
        : null;
    if (!side) throw forbidden('NOT_A_PARTY', 'Bu eşleşmenin tarafı değilsiniz');
    const companyId =
      side === 'SHIPPER' ? m.load.shipperCompanyId : m.truckPosting.carrierCompanyId;
    if (!hasCompanyPermission(actor, companyId, 'offer:write')) {
      throw forbidden('COMPANY_PERMISSION_DENIED', 'Teklif yetkiniz yok');
    }
    return side;
  }

  private route(o: { match: { load: { pickupCity: string; deliveryCity: string } } }) {
    return `${o.match.load.pickupCity} → ${o.match.load.deliveryCity}`;
  }

  // ── Teklif ver ───────────────────────────────────────────────────────
  async create(actor: AuthActor, matchId: string, input: CreateOfferInput) {
    const m = await this.db.match.findUnique({
      where: { id: matchId },
      include: { load: true, truckPosting: true },
    });
    if (!m) throw notFound('Match', matchId);
    const side = this.sideIn(actor, m);
    if (m.status !== 'MUTUAL')
      throw conflict('MATCH_NOT_MUTUAL', 'Teklif için iki tarafın da ilgisi gerekli');
    if (m.load.pricingMode === 'FIXED') {
      throw conflict(
        'FIXED_PRICE',
        'Sabit fiyatlı ilanda pazarlık yok; sistem teklifini kabul veya reddedin',
      );
    }
    return this.placeOffer(actor, m, side, input, null);
  }

  /** Karşı teklif: alıcı taraf mevcut PENDING teklifi COUNTERED yapar, yeni tur açılır (#11). */
  async counter(actor: AuthActor, offerId: string, input: CreateOfferInput) {
    const o = await this.getFull(offerId);
    const side = this.sideIn(actor, o.match);
    if (o.offeredBy === side)
      throw forbidden('OWN_OFFER', 'Kendi teklifinize karşı teklif veremezsiniz');
    if (o.match.load.pricingMode === 'FIXED')
      throw conflict('FIXED_PRICE', 'Sabit fiyatlı ilanda karşı teklif verilemez');
    if (o.round >= MAX_ROUNDS) {
      throw conflict('MAX_ROUNDS', `En fazla ${MAX_ROUNDS} tur; yalnızca kabul veya ret mümkün`);
    }
    transition(offerMachine, o.status, 'COUNTER', side);
    return this.placeOffer(actor, o.match, side, input, o);
  }

  private async placeOffer(
    actor: AuthActor,
    m: Prisma.MatchGetPayload<{ include: { load: true; truckPosting: true } }>,
    side: Side,
    input: CreateOfferInput,
    parent: OfferFull | null,
  ) {
    if (!OPEN_LOAD_STATUSES.includes(m.load.status))
      throw conflict('LOAD_NOT_OPEN', 'İlan teklife kapalı');
    if (m.truckPosting.status !== 'ACTIVE')
      throw conflict('POSTING_NOT_ACTIVE', 'Araç ilanı aktif değil');

    const maxValid = m.load.pickupWindowStart.getTime();
    const validUntil =
      input.validUntil ?? new Date(Math.min(Date.now() + DEFAULT_VALIDITY_MS, maxValid));
    if (validUntil.getTime() <= Date.now())
      throw unprocessable('OFFER_VALIDITY_INVALID', 'Geçerlilik süresi geçmiş');
    if (validUntil.getTime() > maxValid) {
      throw unprocessable(
        'OFFER_VALIDITY_INVALID',
        'Teklif en geç yükleme penceresi başlangıcına kadar geçerli olabilir',
      );
    }
    const amount = new Decimal(input.amount);
    const aboveBudgetWarning =
      !!m.load.budgetMax &&
      amount.gt(new Decimal(m.load.budgetMax.toString()).times(ABOVE_BUDGET_TOLERANCE));

    const offer = await this.db.$transaction(async (tx) => {
      const last = await tx.offer.findFirst({
        where: { matchId: m.id },
        orderBy: { round: 'desc' },
      });
      const round = (last?.round ?? 0) + 1;
      if (round > MAX_ROUNDS)
        throw conflict('MAX_ROUNDS', `Bu eşleşmede ${MAX_ROUNDS} tur tamamlandı`);
      if (parent) {
        const res = await tx.offer.updateMany({
          where: { id: parent.id, status: 'PENDING', version: parent.version },
          data: {
            status: 'COUNTERED',
            respondedAt: new Date(),
            respondedByUserId: actor.userId,
            version: { increment: 1 },
          },
        });
        if (res.count === 0) throw conflict('OFFER_CHANGED', 'Teklif bu arada güncellendi');
      }
      const created = await tx.offer
        .create({
          data: {
            matchId: m.id,
            loadId: m.loadId,
            truckPostingId: m.truckPostingId,
            offeredBy: side,
            offeredByCompanyId:
              side === 'SHIPPER' ? m.load.shipperCompanyId : m.truckPosting.carrierCompanyId,
            offeredByUserId: actor.userId,
            amount: amount.toFixed(2),
            currency: m.load.currency,
            validUntil,
            note: input.note ?? null,
            round,
            parentOfferId: parent?.id ?? null,
            aboveBudgetWarning,
          },
        })
        .catch((err: unknown) => {
          if ((err as { code?: string }).code === 'P2002') {
            throw conflict(
              'OFFER_PENDING',
              'Bu eşleşmede bekleyen bir teklif var; karşı teklif verin veya yanıtlayın',
            );
          }
          throw err;
        });
      await this.outbox.emit(tx, 'offer.expire', { offerId: created.id }, { runAt: validUntil });
      await syncOpenLoadStatus(tx, m.loadId);
      return created;
    });

    const other = side === 'SHIPPER' ? m.truckPosting.carrierCompanyId : m.load.shipperCompanyId;
    await this.notifications.notifyCompany(null, other, 'OFFER_RECEIVED', {
      offerId: offer.id,
      matchId: m.id,
      amount: offer.amount.toString(),
      currency: offer.currency,
      round: offer.round,
      route: `${m.load.pickupCity} → ${m.load.deliveryCity}`,
    });
    return { ...offer, warning: aboveBudgetWarning ? 'ABOVE_BUDGET' : null };
  }

  // ── Kabul ────────────────────────────────────────────────────────────
  /**
   * DOMAIN §5 adım 5 — tek SERIALIZABLE transaction:
   *  - teklif hâlâ PENDING ve süresi dolmamış (#4),
   *  - yük hâlâ açık (FOR UPDATE ile yeniden okunur, #3),
   *  - araç ilanı optimistic lock ile RESERVED (#1: ikinci kabul 409),
   *  - Shipment oluşur, komisyon/KDV/tevkifat/kur kilitlenir (#24, #26),
   *  - araç/dorse/şoför çakışması EXCLUDE kısıtıyla reddedilir (#2),
   *  - diğer açık teklifler geri çekilir, eşleşmeler kapanır, iletişim açılır.
   */
  async accept(actor: AuthActor, offerId: string) {
    const pre = await this.getFull(offerId);
    const side = this.sideIn(actor, pre.match);
    if (pre.offeredBy === side) throw forbidden('OWN_OFFER', 'Kendi teklifinizi kabul edemezsiniz');
    transition(offerMachine, pre.status, 'ACCEPT', side);

    const check = await this.matching.revalidate(pre.loadId, pre.truckPostingId);
    if (!check.pass && !(check.failures.length === 1 && check.failures[0] === 'STATUS')) {
      throw conflict('MATCH_NO_LONGER_VALID', 'Eşleşme artık zorunlu kriterleri karşılamıyor', {
        failures: check.failures,
      });
    }

    const shipment = await serializable(this.db, async (tx) => {
      // Kilit sırası sabit: önce araç ilanı (paylaşılan kaynak), sonra teklif, sonra yük.
      // Aksi halde aynı araca iki eşzamanlı kabul birbirini bekleyip deadlock'a düşer.
      await tx.$queryRaw`SELECT id FROM "TruckPosting" WHERE id = ${pre.truckPostingId}::uuid FOR UPDATE`;
      const [offer] = await tx.$queryRaw<
        { id: string; status: string; validUntil: Date; version: number }[]
      >`
        SELECT id, status, "validUntil", version FROM "Offer" WHERE id = ${offerId}::uuid FOR UPDATE`;
      if (!offer || offer.status !== 'PENDING')
        throw conflict('OFFER_NOT_PENDING', 'Teklif artık geçerli değil');
      if (offer.validUntil.getTime() <= Date.now())
        throw conflict('OFFER_EXPIRED', 'Teklifin süresi dolmuş');

      const [load] = await tx.$queryRaw<{ id: string; status: string; version: number }[]>`
        SELECT id, status, version FROM "Load" WHERE id = ${pre.loadId}::uuid FOR UPDATE`;
      if (!load || !(OPEN_LOAD_STATUSES as readonly string[]).includes(load.status)) {
        throw conflict('LOAD_NOT_OPEN', 'İlan iptal edilmiş veya başka araca atanmış');
      }

      const posting = await tx.truckPosting.findUniqueOrThrow({
        where: { id: pre.truckPostingId },
      });
      const reserved = await tx.truckPosting.updateMany({
        where: { id: posting.id, version: posting.version, status: 'ACTIVE' },
        data: { status: 'RESERVED', version: { increment: 1 } },
      });
      if (reserved.count === 0)
        throw conflict('POSTING_ALREADY_RESERVED', 'Araç başka bir sevkiyata ayrıldı');

      const assigned = await tx.load.updateMany({
        where: { id: load.id, version: load.version, status: { in: [...OPEN_LOAD_STATUSES] } },
        data: { status: 'ASSIGNED', version: { increment: 1 } },
      });
      if (assigned.count === 0) throw conflict('LOAD_NOT_OPEN', 'İlan bu arada değişti');

      await tx.offer.update({
        where: { id: offerId },
        data: {
          status: 'ACCEPTED',
          respondedAt: new Date(),
          respondedByUserId: actor.userId,
          version: { increment: 1 },
        },
      });

      const l = await tx.load.findUniqueOrThrow({ where: { id: load.id } });
      const cur = l.currency;
      const agreed = Money.of(pre.amount, cur);
      const international = l.transportScope === 'INTERNATIONAL';
      const terms = await this.pricing.lockTerms(tx, agreed, international, l.withholdingApplies);
      const fx = await this.config.fxRate(cur, 'TRY', tx);
      const commissionTotal = terms.shipperCommission.add(terms.carrierCommission);

      const created = await tx.shipment.create({
        data: {
          referenceNo: await nextReference(tx, 'SH'),
          loadId: l.id,
          matchId: pre.matchId,
          acceptedOfferId: offerId,
          truckPostingId: posting.id,
          shipperCompanyId: l.shipperCompanyId,
          carrierCompanyId: posting.carrierCompanyId,
          vehicleId: posting.vehicleId,
          trailerId: posting.trailerId,
          driverId: posting.driverId,
          currency: cur,
          agreedAmount: agreed.toString(),
          commissionModel: terms.commissionModel,
          commissionRate: terms.commissionRate.toString(),
          commissionAmount: commissionTotal.toString(),
          shipperCommissionAmount: terms.shipperCommission.toString(),
          carrierCommissionAmount: terms.carrierCommission.toString(),
          carrierPayout: agreed.subtract(terms.carrierCommission).toString(),
          shipperTotal: agreed.add(terms.shipperCommission).toString(),
          vatRate: international ? '0' : terms.vatRate.toString(),
          commissionVatRate: terms.commissionVatRate.toString(),
          withholdingApplies: l.withholdingApplies,
          withholdingRatio: terms.withholdingRatio.toString(),
          withholdingThreshold: terms.withholdingThreshold.toString(),
          pricingConfigId: terms.pricingConfigId,
          lockedFxRate: fx.toFixed(8),
          lockedFxRateAt: new Date(),
          plannedPickupAt: l.pickupWindowStart,
          plannedDeliveryAt: l.deliveryWindowEnd,
          assignmentEndAt: new Date(l.deliveryWindowEnd.getTime() + ASSIGNMENT_BUFFER_MS),
          deadheadKm: pre.match.deadheadKm,
          events: {
            create: {
              type: 'STATUS_CHANGED',
              toStatus: 'ASSIGNED',
              actorUserId: actor.userId,
              actorRole: side,
              note: `Teklif kabul edildi (${agreed.toString()} ${cur})`,
            },
          },
        },
      });

      // Diğer açık teklifler ve eşleşmeler (aynı yük veya aynı araç) kapanır.
      await tx.offer.updateMany({
        where: {
          id: { not: offerId },
          status: 'PENDING',
          OR: [{ loadId: l.id }, { truckPostingId: posting.id }],
        },
        data: { status: 'WITHDRAWN', note: 'SUPERSEDED', respondedAt: new Date() },
      });
      await tx.match.updateMany({
        where: {
          id: { not: pre.matchId },
          status: {
            in: ['SUGGESTED', 'VIEWED', 'INTERESTED_BY_SHIPPER', 'INTERESTED_BY_CARRIER', 'MUTUAL'],
          },
          OR: [{ loadId: l.id }, { truckPostingId: posting.id }],
        },
        data: { status: 'EXPIRED', dismissReason: 'ASSIGNED_ELSEWHERE' },
      });

      // Sevkiyat sohbeti: iletişim artık açık.
      await tx.conversation.create({
        data: {
          contextType: 'SHIPMENT',
          shipmentId: created.id,
          shipperCompanyId: l.shipperCompanyId,
          carrierCompanyId: posting.carrierCompanyId,
        },
      });

      const policy = await this.config.cancellation();
      await this.outbox.emit(
        tx,
        'shipment.no-show-check',
        { shipmentId: created.id },
        {
          runAt: new Date(l.pickupWindowEnd.getTime() + policy.noShowGraceMinutes * 60_000),
        },
      );
      return created;
    });

    for (const companyId of [shipment.shipperCompanyId, shipment.carrierCompanyId]) {
      await this.notifications.notifyCompany(null, companyId, 'OFFER_ACCEPTED', {
        shipmentId: shipment.id,
        referenceNo: shipment.referenceNo,
      });
    }
    return shipment;
  }

  async reject(actor: AuthActor, offerId: string) {
    const o = await this.getFull(offerId);
    const side = this.sideIn(actor, o.match);
    if (o.offeredBy === side)
      throw forbidden('OWN_OFFER', 'Kendi teklifinizi reddedemezsiniz; geri çekin');
    transition(offerMachine, o.status, 'REJECT', side);
    await this.db.$transaction(async (tx) => {
      const res = await tx.offer.updateMany({
        where: { id: offerId, status: 'PENDING', version: o.version },
        data: {
          status: 'REJECTED',
          respondedAt: new Date(),
          respondedByUserId: actor.userId,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw conflict('OFFER_CHANGED', 'Teklif bu arada güncellendi');
      // Son tur reddedildiyse pazarlık biter (#11).
      if (o.round >= MAX_ROUNDS || o.match.load.pricingMode === 'FIXED') {
        await tx.match.update({
          where: { id: o.matchId },
          data: {
            status: 'DISMISSED',
            dismissReason: 'NEGOTIATION_FAILED',
            version: { increment: 1 },
          },
        });
      }
      await syncOpenLoadStatus(tx, o.loadId);
    });
    await this.notifications.notifyCompany(null, o.offeredByCompanyId, 'OFFER_REJECTED', {
      offerId,
      route: this.route(o),
    });
    return this.db.offer.findUniqueOrThrow({ where: { id: offerId } });
  }

  /** Teklif veren geri çekebilir; kabul edilmişse çekemez (#13). */
  async withdraw(actor: AuthActor, offerId: string) {
    const o = await this.getFull(offerId);
    const side = this.sideIn(actor, o.match);
    if (o.offeredBy !== side)
      throw forbidden('NOT_OFFERER', 'Yalnızca teklifi veren taraf geri çekebilir');
    transition(offerMachine, o.status, 'WITHDRAW', side);
    await this.db.$transaction(async (tx) => {
      const res = await tx.offer.updateMany({
        where: { id: offerId, status: 'PENDING', version: o.version },
        data: { status: 'WITHDRAWN', respondedAt: new Date(), version: { increment: 1 } },
      });
      if (res.count === 0)
        throw conflict('OFFER_CHANGED', 'Teklif bu arada güncellendi (kabul edilmiş olabilir)');
      await syncOpenLoadStatus(tx, o.loadId);
    });
    const other =
      side === 'SHIPPER' ? o.match.truckPosting.carrierCompanyId : o.match.load.shipperCompanyId;
    await this.notifications.notifyCompany(null, other, 'OFFER_WITHDRAWN', {
      offerId,
      route: this.route(o),
    });
    return this.db.offer.findUniqueOrThrow({ where: { id: offerId } });
  }

  /** offer.expire gecikmeli işi (#4): durum yeniden okunur, idempotent. */
  async expire(offerId: string): Promise<void> {
    const o = await this.db.offer.findUnique({ where: { id: offerId }, include: offerInclude });
    if (!o || o.status !== 'PENDING' || o.validUntil.getTime() > Date.now()) return;
    const done = await this.db.$transaction(async (tx) => {
      const res = await tx.offer.updateMany({
        where: { id: offerId, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      if (res.count && o.round >= MAX_ROUNDS) {
        await tx.match.updateMany({
          where: { id: o.matchId, status: 'MUTUAL' },
          data: { status: 'DISMISSED', dismissReason: 'NEGOTIATION_FAILED' },
        });
      }
      await syncOpenLoadStatus(tx, o.loadId);
      return res.count > 0;
    });
    if (done) {
      for (const cid of [o.match.load.shipperCompanyId, o.match.truckPosting.carrierCompanyId]) {
        await this.notifications.notifyCompany(
          null,
          cid,
          'OFFER_EXPIRED',
          { offerId, route: this.route(o) },
          { dedupKey: `offer-exp:${offerId}` },
        );
      }
    }
  }

  /** Güvenlik ağı: gecikmeli iş kaybolursa (Redis flush) süresi geçmiş teklifleri kapatır. */
  async reconcileExpired(): Promise<number> {
    const stale = await this.db.offer.findMany({
      where: { status: 'PENDING', validUntil: { lte: new Date() } },
      select: { id: true },
    });
    for (const s of stale) await this.expire(s.id);
    return stale.length;
  }

  private async getFull(id: string): Promise<OfferFull> {
    const o = await this.db.offer.findUnique({ where: { id }, include: offerInclude });
    if (!o) throw notFound('Offer', id);
    return o;
  }

  async get(actor: AuthActor, id: string) {
    const o = await this.getFull(id);
    if (!actor.isStaff) this.sideIn(actor, o.match);
    return o;
  }

  /** Gelen/giden teklifler (aktif firma). */
  async list(
    actor: AuthActor,
    q: {
      direction: 'incoming' | 'outgoing' | 'all';
      status?: string;
      matchId?: string;
      cursor?: string;
      limit: number;
    },
  ) {
    const cid = actor.activeCompanyId;
    if (!cid) return { items: [], nextCursor: null };
    const party: Prisma.OfferWhereInput = {
      OR: [{ load: { shipperCompanyId: cid } }, { truckPosting: { carrierCompanyId: cid } }],
    };
    const where: Prisma.OfferWhereInput = {
      ...party,
      ...(q.direction === 'outgoing' ? { offeredByCompanyId: cid } : {}),
      ...(q.direction === 'incoming' ? { offeredByCompanyId: { not: cid } } : {}),
      ...(q.status ? { status: q.status as Prisma.EnumOfferStatusFilter['equals'] } : {}),
      ...(q.matchId ? { matchId: q.matchId } : {}),
    };
    const page = await paginate(q, (args) =>
      this.db.offer.findMany({
        where,
        orderBy: { id: 'desc' },
        include: {
          load: {
            select: {
              id: true,
              referenceNo: true,
              pickupCity: true,
              deliveryCity: true,
              budgetMin: true,
              budgetMax: true,
              currency: true,
              pricingMode: true,
            },
          },
        },
        ...args,
      }),
    );
    return mapPage(page, (o) => ({
      ...o,
      direction: o.offeredByCompanyId === cid ? 'outgoing' : 'incoming',
    }));
  }
}
