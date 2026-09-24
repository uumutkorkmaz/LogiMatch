import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  type Actor,
  ACTIVE_SHIPMENT_STATUSES,
  availableEvents,
  eventForTarget,
  loadMachine,
  Money,
  type ShipmentStatus,
  shipmentMachine,
  transition,
  toDecimal,
} from '@logimatch/shared';
import type { z } from 'zod';
import type {
  cancelShipmentSchema,
  resolveDisputeSchema,
  shipmentEventSchema,
  shipmentStatusUpdateSchema,
} from '@logimatch/shared';
import { type AuthActor, hasCompanyPermission, isMemberOf } from '../common/actor';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { audit } from '../common/interceptors';
import { mapPage, paginate } from '../common/pagination';
import { type DocumentMetaInput } from '@logimatch/shared';
import { DocumentsService, type UploadedFile } from '../documents/documents.service';
import { type Db, type DbOrTx, InjectDb, Prisma } from '../infra/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformConfigService } from '../platform/platform-config.service';
import { computeCancellation } from '../pricing/domain/cancellation';
import { PricingService } from '../pricing/pricing.service';
import { JobRegistry } from '../queue/job-registry';
import { OutboxService } from '../queue/outbox.service';

const AUTO_COMPLETE_MS = 72 * 3_600_000;

const include = {
  load: { include: { stops: { orderBy: { sequence: 'asc' } } } },
  shipperCompany: true,
  carrierCompany: true,
  vehicle: true,
  trailer: true,
  driver: true,
  disputes: { orderBy: { createdAt: 'desc' } },
  conversation: { select: { id: true } },
} satisfies Prisma.ShipmentInclude;
type ShipmentFull = Prisma.ShipmentGetPayload<{ include: typeof include }>;

type ShipmentRow = Prisma.ShipmentGetPayload<object>;

@Injectable()
export class ShipmentsService implements OnModuleInit {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationsService,
    private readonly pricing: PricingService,
    private readonly config: PlatformConfigService,
    private readonly documents: DocumentsService,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register('shipment.no-show-check', (p) => this.noShowCheck(p.shipmentId));
    this.registry.register('shipment.auto-complete', (p) => this.autoComplete(p.shipmentId));
  }

  /** İsteği yapanın bu sevkiyattaki rolü (durum makinesi aktörü). */
  actorOf(actor: AuthActor, s: ShipmentRow & { driver?: { userId: string | null } }): Actor {
    if (isMemberOf(actor, s.shipperCompanyId)) return 'SHIPPER';
    if (isMemberOf(actor, s.carrierCompanyId)) return 'CARRIER';
    if (actor.role === 'DRIVER' && s.driver?.userId === actor.userId) return 'DRIVER';
    if (actor.isStaff) return 'OPS';
    throw forbidden('NOT_A_PARTY', 'Bu sevkiyatın tarafı değilsiniz');
  }

  private async full(id: string): Promise<ShipmentFull> {
    const s = await this.db.shipment.findUnique({ where: { id }, include });
    if (!s) throw notFound('Shipment', id);
    return s;
  }

  async get(actor: AuthActor, id: string) {
    const s = await this.full(id);
    const who = this.actorOf(actor, s);
    return {
      ...s,
      viewerRole: who,
      availableEvents: availableEvents(shipmentMachine, s.status, who),
    };
  }

  async list(
    actor: AuthActor,
    q: { status?: ShipmentStatus; active?: boolean; cursor?: string; limit: number },
  ) {
    const mine = actor.memberships.map((m) => m.companyId);
    const where: Prisma.ShipmentWhereInput =
      actor.isStaff && mine.length === 0
        ? {}
        : actor.role === 'DRIVER'
          ? { driver: { userId: actor.userId } }
          : { OR: [{ shipperCompanyId: { in: mine } }, { carrierCompanyId: { in: mine } }] };
    if (q.status) where.status = q.status;
    if (q.active)
      where.status = {
        in: [...ACTIVE_SHIPMENT_STATUSES, 'DELIVERED', 'POD_SUBMITTED', 'DISPUTED'],
      };
    const page = await paginate(q, (args) =>
      this.db.shipment.findMany({
        where,
        orderBy: { id: 'desc' },
        include: {
          load: {
            select: {
              referenceNo: true,
              pickupCity: true,
              deliveryCity: true,
              cargoType: true,
              weightKg: true,
            },
          },
          shipperCompany: { select: { id: true, legalName: true } },
          carrierCompany: { select: { id: true, legalName: true } },
          vehicle: { select: { plate: true } },
        },
        ...args,
      }),
    );
    return mapPage(page, (s) => s);
  }

  /** Taşıyıcı kazanç özeti (aktif firma): brüt, komisyon, net — para birimi bazında. */
  async summary(actor: AuthActor) {
    const cid = actor.activeCompanyId;
    if (!cid) return { byCurrency: [], completed: 0, active: 0 };
    const [byCurrency, completed, active] = await Promise.all([
      this.db.shipment.groupBy({
        by: ['currency'],
        where: { carrierCompanyId: cid, status: 'COMPLETED' },
        _sum: { agreedAmount: true, carrierCommissionAmount: true, carrierPayout: true },
      }),
      this.db.shipment.count({ where: { carrierCompanyId: cid, status: 'COMPLETED' } }),
      this.db.shipment.count({
        where: { OR: [{ carrierCompanyId: cid }, { shipperCompanyId: cid }], status: { in: [...ACTIVE_SHIPMENT_STATUSES] } },
      }),
    ]);
    return {
      byCurrency: byCurrency.map((r) => ({
        currency: r.currency,
        gross: r._sum.agreedAmount ?? 0,
        commission: r._sum.carrierCommissionAmount ?? 0,
        net: r._sum.carrierPayout ?? 0,
      })),
      completed,
      active,
    };
  }

  async events(actor: AuthActor, id: string) {
    const s = await this.full(id);
    this.actorOf(actor, s);
    return this.db.shipmentEvent.findMany({
      where: { shipmentId: id },
      orderBy: { occurredAt: 'asc' },
    });
  }

  // ── Durum ────────────────────────────────────────────────────────────
  async updateStatus(
    actor: AuthActor,
    id: string,
    input: z.infer<typeof shipmentStatusUpdateSchema>,
  ) {
    const s = await this.full(id);
    const who = this.actorOf(actor, s);
    if (who === 'CARRIER' && !hasCompanyPermission(actor, s.carrierCompanyId, 'shipment:operate')) {
      throw forbidden('COMPANY_PERMISSION_DENIED', 'Sevkiyat yönetme yetkiniz yok');
    }
    if (input.status === 'CANCELLED' || input.status === 'DISPUTED') {
      throw unprocessable(
        'USE_DEDICATED_ENDPOINT',
        'İptal ve uyuşmazlık için ilgili uçları kullanın',
      );
    }
    const event = eventForTarget(shipmentMachine, s.status, input.status, who);
    if (!event) {
      throw conflict(
        'INVALID_STATE_TRANSITION',
        `${s.status} → ${input.status} geçişine izin yok`,
        {
          from: s.status,
          allowed: availableEvents(shipmentMachine, s.status, who),
        },
      );
    }
    if (event === 'SUBMIT_POD') {
      const pod = await this.db.document.count({
        where: { ownerType: 'SHIPMENT', ownerId: id, type: { in: ['POD', 'CMR', 'IRSALIYE'] } },
      });
      if (pod === 0)
        throw unprocessable(
          'POD_REQUIRED',
          'Önce teslim belgesini (POD / imzalı irsaliye / CMR) yükleyin',
        );
    }
    await this.applyTransition(
      this.db,
      s,
      input.status,
      actor.userId,
      who,
      input.note,
      input.location,
    );
    return this.get(actor, id);
  }

  /** Geçişi uygular + yan etkiler (yük durumu, tamamlanma muhasebesi, zamanlayıcılar). */
  private async applyTransition(
    db: Db,
    s: ShipmentRow,
    to: ShipmentStatus,
    userId: string | null,
    who: Actor,
    note?: string,
    location?: { lat: number; lng: number },
  ) {
    const now = new Date();
    await db.$transaction(async (tx) => {
      const res = await tx.shipment.updateMany({
        where: { id: s.id, status: s.status, version: s.version },
        data: {
          status: to,
          statusChangedAt: now,
          version: { increment: 1 },
          ...(to === 'DELIVERED' ? { deliveredAt: now } : {}),
          ...(to === 'POD_SUBMITTED' ? { podSubmittedAt: now } : {}),
          ...(to === 'COMPLETED' ? { completedAt: now } : {}),
        },
      });
      if (res.count === 0) throw conflict('CONCURRENT_UPDATE', 'Sevkiyat bu arada güncellendi');
      await tx.shipmentEvent.create({
        data: {
          shipmentId: s.id,
          type: 'STATUS_CHANGED',
          fromStatus: s.status,
          toStatus: to,
          actorUserId: userId,
          actorRole: who,
          note: note ?? null,
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
        },
      });
      await this.syncLoad(tx, s.loadId, to);
      if (to === 'POD_SUBMITTED') {
        await this.outbox.emit(
          tx,
          'shipment.auto-complete',
          { shipmentId: s.id },
          { runAt: new Date(now.getTime() + AUTO_COMPLETE_MS) },
        );
      }
      if (to === 'COMPLETED') await this.onCompleted(tx, { ...s, status: to });
    });
    const ref = (await db.shipment.findUniqueOrThrow({ where: { id: s.id } })).referenceNo;
    for (const cid of [s.shipperCompanyId, s.carrierCompanyId]) {
      await this.notifications.notifyCompany(
        null,
        cid,
        to === 'COMPLETED' ? 'RATING_REQUEST' : 'SHIPMENT_STATUS',
        { shipmentId: s.id, referenceNo: ref, status: to },
        {
          dedupKey: `ship:${s.id}:${to}`,
        },
      );
    }
  }

  /** Yükün durumu sevkiyattan türetilir (DOMAIN §4.1). */
  private async syncLoad(tx: DbOrTx, loadId: string, shipmentStatus: ShipmentStatus) {
    const load = await tx.load.findUniqueOrThrow({ where: { id: loadId } });
    const event =
      shipmentStatus === 'LOADED' || shipmentStatus === 'IN_TRANSIT'
        ? 'START_TRANSIT'
        : shipmentStatus === 'DELIVERED'
          ? 'DELIVER'
          : shipmentStatus === 'COMPLETED'
            ? 'COMPLETE'
            : null;
    if (!event) return;
    // LOADED ve IN_TRANSIT ikisi de START_TRANSIT; ikincisi no-op.
    if (event === 'START_TRANSIT' && load.status === 'IN_TRANSIT') return;
    const steps: ('START_TRANSIT' | 'DELIVER' | 'COMPLETE')[] =
      event === 'COMPLETE'
        ? ['START_TRANSIT', 'DELIVER', 'COMPLETE']
        : event === 'DELIVER'
          ? ['START_TRANSIT', 'DELIVER']
          : ['START_TRANSIT'];
    let status = load.status;
    for (const e of steps) {
      try {
        status = transition(loadMachine, status, e, 'SYSTEM');
      } catch {
        /* zaten o adımdan geçmiş */
      }
    }
    if (status !== load.status) await tx.load.update({ where: { id: loadId }, data: { status } });
  }

  /** Tamamlanma: istatistikler, ilişki geçmişi, fatura taslakları, araç ilanı kapanışı. */
  private async onCompleted(tx: DbOrTx, s: ShipmentRow) {
    await tx.truckPosting.updateMany({
      where: { id: s.truckPostingId, status: 'RESERVED' },
      data: { status: 'EXPIRED' },
    });
    await tx.companyStats.upsert({
      where: { companyId: s.carrierCompanyId },
      create: { companyId: s.carrierCompanyId, completedAsCarrier: 1 },
      update: { completedAsCarrier: { increment: 1 }, consecutiveNoShows: 0 },
    });
    await tx.companyStats.upsert({
      where: { companyId: s.shipperCompanyId },
      create: { companyId: s.shipperCompanyId, completedAsShipper: 1 },
      update: { completedAsShipper: { increment: 1 } },
    });
    await tx.companyPairStats.upsert({
      where: {
        shipperCompanyId_carrierCompanyId: {
          shipperCompanyId: s.shipperCompanyId,
          carrierCompanyId: s.carrierCompanyId,
        },
      },
      create: {
        shipperCompanyId: s.shipperCompanyId,
        carrierCompanyId: s.carrierCompanyId,
        completedCount: 1,
      },
      update: { completedCount: { increment: 1 } },
    });
    const fresh = await tx.shipment.findUniqueOrThrow({ where: { id: s.id } });
    await this.pricing.createInvoiceDrafts(tx, fresh);
  }

  // ── Olay ve belge ────────────────────────────────────────────────────
  async addEvent(actor: AuthActor, id: string, input: z.infer<typeof shipmentEventSchema>) {
    const s = await this.full(id);
    const who = this.actorOf(actor, s);
    if (input.type === 'DEPARTED_TO_PICKUP' && (who === 'SHIPPER' || s.status !== 'ASSIGNED')) {
      throw unprocessable(
        'INVALID_EVENT',
        'Yola çıkış yalnızca taşıyıcı tarafından, atanmış sevkiyatta bildirilir',
      );
    }
    return this.db.shipmentEvent.create({
      data: {
        shipmentId: id,
        type: input.type,
        actorUserId: actor.userId,
        actorRole: who,
        note: input.note ?? null,
        lat: input.location?.lat ?? null,
        lng: input.location?.lng ?? null,
      },
    });
  }

  /** İrsaliye / POD / CMR — sevkiyat belgeleri admin onayı gerektirmez. */
  async uploadDocument(
    actor: AuthActor,
    id: string,
    meta: DocumentMetaInput,
    file: UploadedFile | undefined,
  ) {
    const s = await this.full(id);
    const who = this.actorOf(actor, s);
    if (!['IRSALIYE', 'POD', 'CMR', 'OTHER'].includes(meta.type)) {
      throw unprocessable(
        'INVALID_DOCUMENT_TYPE',
        'Sevkiyat belgesi IRSALIYE, POD, CMR veya OTHER olmalı',
      );
    }
    const doc = await this.documents.upload(actor, 'SHIPMENT', id, meta, file, {
      autoApprove: true,
      companyId: who === 'SHIPPER' ? s.shipperCompanyId : s.carrierCompanyId,
    });
    await this.db.shipmentEvent.create({
      data: {
        shipmentId: id,
        type: 'DOCUMENT_ADDED',
        actorUserId: actor.userId,
        actorRole: who,
        payload: { documentId: doc.id, type: meta.type },
      },
    });
    return doc;
  }

  async listDocuments(actor: AuthActor, id: string) {
    const s = await this.full(id);
    this.actorOf(actor, s);
    const docs = await this.db.document.findMany({
      where: { ownerType: 'SHIPMENT', ownerId: id },
      orderBy: { createdAt: 'asc' },
    });
    return docs.map((d) => this.documents.withUrl(d));
  }

  // ── İptal (#8, #9, #10) ───────────────────────────────────────────────
  async cancel(actor: AuthActor, id: string, input: z.infer<typeof cancelShipmentSchema>) {
    const s = await this.full(id);
    const who = this.actorOf(actor, s);
    if (who === 'DRIVER') throw forbidden('DRIVER_CANNOT_CANCEL', 'Şoför sevkiyatı iptal edemez');
    const companyId =
      who === 'SHIPPER' ? s.shipperCompanyId : who === 'CARRIER' ? s.carrierCompanyId : null;
    if (companyId && !hasCompanyPermission(actor, companyId, 'shipment:cancel')) {
      throw forbidden('COMPANY_PERMISSION_DENIED', 'İptal yetkiniz yok (sahip veya yönetici)');
    }
    if (input.forceMajeure && who !== 'OPS')
      throw forbidden('OPS_ONLY', 'Mücbir sebep yalnızca operasyon tarafından işaretlenir');
    transition(shipmentMachine, s.status, 'CANCEL', who);

    let cancelledBy: 'SHIPPER' | 'CARRIER' | 'PLATFORM' =
      who === 'SHIPPER' ? 'SHIPPER' : who === 'CARRIER' ? 'CARRIER' : 'PLATFORM';
    if (input.noShow) {
      if (who !== 'SHIPPER' && who !== 'OPS')
        throw forbidden('NO_SHOW_BY_SHIPPER', 'Gelmedi bildirimi yük veren tarafından yapılır');
      if (s.status !== 'ASSIGNED')
        throw unprocessable('NO_SHOW_INVALID', 'Araç yükleme noktasına ulaşmış görünüyor');
      if (s.load.pickupWindowEnd.getTime() > Date.now()) {
        throw unprocessable(
          'NO_SHOW_TOO_EARLY',
          'Yükleme penceresi kapanmadan gelmedi bildirilemez',
        );
      }
      cancelledBy = 'CARRIER';
    }

    const policy = await this.config.cancellation();
    const departed = await this.db.shipmentEvent.count({
      where: { shipmentId: id, type: 'DEPARTED_TO_PICKUP' },
    });
    const cur = s.currency;
    const r = computeCancellation({
      policy: { tiers: policy.tiers, deadheadRatePerKm: policy.deadheadRatePerKm },
      agreed: Money.of(s.agreedAmount, cur),
      pickupStart: s.load.pickupWindowStart,
      at: new Date(),
      status: s.status,
      cancelledBy,
      departedToPickup: departed > 0,
      deadheadKm: s.deadheadKm,
      forceMajeure: input.forceMajeure,
      commissionRate: toDecimal(s.commissionRate),
      commissionOnFee: (await this.config.pricing()).commissionOnCancellationFee,
    });

    const reopen = cancelledBy !== 'SHIPPER' && s.load.pickupWindowEnd.getTime() > Date.now();
    await this.db.$transaction(async (tx) => {
      const res = await tx.shipment.updateMany({
        where: { id, status: s.status, version: s.version },
        data: {
          status: 'CANCELLED',
          statusChangedAt: new Date(),
          cancelledAt: new Date(),
          cancelledBy,
          cancellationReason: input.forceMajeure ? `FORCE_MAJEURE: ${input.reason}` : input.reason,
          cancellationFee: r.fee.toString(),
          deadheadCompensation: r.deadheadCompensation.toString(),
          cancellationFeePayer: r.payer,
          noShow: input.noShow,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw conflict('CONCURRENT_UPDATE', 'Sevkiyat bu arada güncellendi');
      await tx.shipmentEvent.create({
        data: {
          shipmentId: id,
          type: 'CANCELLED',
          fromStatus: s.status,
          toStatus: 'CANCELLED',
          actorUserId: actor.userId,
          actorRole: who,
          note: input.reason,
          payload: {
            tier: r.tier,
            hoursBeforePickup: Math.round(r.hoursBeforePickup * 10) / 10,
            fee: r.fee.toString(),
            deadheadCompensation: r.deadheadCompensation.toString(),
            payer: r.payer,
            noShow: input.noShow,
          },
        },
      });

      // Yük: taşıyıcı kaynaklı iptalde pencere açıksa yeniden yayına (#9), aksi halde iptal.
      if (reopen) {
        await tx.load.update({
          where: { id: s.loadId },
          data: {
            status: transition(loadMachine, 'ASSIGNED', 'REOPEN', 'SYSTEM'),
            version: { increment: 1 },
          },
        });
        await tx.match.update({
          where: { id: s.matchId },
          data: { status: 'DISMISSED', dismissReason: 'SHIPMENT_CANCELLED' },
        });
        await this.outbox.emit(tx, 'match.recompute', { entity: 'load', id: s.loadId });
      } else {
        await tx.load.update({
          where: { id: s.loadId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancellationReason: input.reason,
            version: { increment: 1 },
          },
        });
      }
      // Araç ilanı: yük veren iptal ettiyse ve müsaitlik sürüyorsa tekrar aktif.
      const posting = await tx.truckPosting.findUniqueOrThrow({ where: { id: s.truckPostingId } });
      const release = cancelledBy !== 'CARRIER' && posting.availableUntil.getTime() > Date.now();
      await tx.truckPosting.update({
        where: { id: posting.id },
        data: { status: release ? 'ACTIVE' : 'EXPIRED', version: { increment: 1 } },
      });
      if (release)
        await this.outbox.emit(tx, 'match.recompute', { entity: 'posting', id: posting.id });

      await this.recordCancellationStats(tx, s, cancelledBy, input.noShow);
      if (!r.total.isZero()) {
        const fresh = await tx.shipment.findUniqueOrThrow({ where: { id } });
        await this.pricing.createInvoiceDrafts(tx, fresh);
      }
    });

    await audit(
      this.db,
      actor,
      'shipment.cancel',
      'Shipment',
      id,
      { status: s.status },
      { cancelledBy, fee: r.total.toString() },
    );
    for (const cid of [s.shipperCompanyId, s.carrierCompanyId]) {
      await this.notifications.notifyCompany(null, cid, 'SHIPMENT_CANCELLED', {
        shipmentId: id,
        referenceNo: s.referenceNo,
        reason: input.reason,
      });
    }
    return { ...(await this.get(actor, id)), cancellation: r };
  }

  /** İstatistikler + ardışık no-show serisi → firma incelemeye (#9). */
  private async recordCancellationStats(
    tx: DbOrTx,
    s: ShipmentRow,
    by: 'SHIPPER' | 'CARRIER' | 'PLATFORM',
    noShow: boolean,
  ) {
    if (by === 'SHIPPER') {
      await tx.companyStats.upsert({
        where: { companyId: s.shipperCompanyId },
        create: { companyId: s.shipperCompanyId, shipperCancelled: 1 },
        update: { shipperCancelled: { increment: 1 } },
      });
      return;
    }
    if (by !== 'CARRIER') return;
    const stats = await tx.companyStats.upsert({
      where: { companyId: s.carrierCompanyId },
      create: {
        companyId: s.carrierCompanyId,
        carrierCancelled: noShow ? 0 : 1,
        noShowCount: noShow ? 1 : 0,
        consecutiveNoShows: noShow ? 1 : 0,
        lastNoShowAt: noShow ? new Date() : null,
      },
      update: noShow
        ? {
            noShowCount: { increment: 1 },
            consecutiveNoShows: { increment: 1 },
            lastNoShowAt: new Date(),
          }
        : { carrierCancelled: { increment: 1 } },
    });
    const policy = await this.config.cancellation();
    if (noShow && stats.consecutiveNoShows >= policy.noShowSuspendStreak) {
      await tx.company.update({
        where: { id: s.carrierCompanyId },
        data: { status: 'UNDER_REVIEW' },
      });
      await tx.truckPosting.updateMany({
        where: { carrierCompanyId: s.carrierCompanyId, status: 'ACTIVE' },
        data: { pausedAt: new Date() },
      });
      await tx.riskFlag.create({
        data: {
          type: 'NO_SHOW_STREAK',
          entityType: 'Company',
          entityId: s.carrierCompanyId,
          companyId: s.carrierCompanyId,
          details: { consecutiveNoShows: stats.consecutiveNoShows, lastShipmentId: s.id },
        },
      });
    }
  }

  // ── Uyuşmazlık ───────────────────────────────────────────────────────
  async dispute(actor: AuthActor, id: string, reason: string) {
    const s = await this.full(id);
    const who = this.actorOf(actor, s);
    if (who !== 'SHIPPER' && who !== 'CARRIER')
      throw forbidden('PARTY_ONLY', 'Uyuşmazlığı taraflar açar');
    transition(shipmentMachine, s.status, 'DISPUTE', who);
    await this.db.$transaction(async (tx) => {
      const res = await tx.shipment.updateMany({
        where: { id, status: s.status, version: s.version },
        data: { status: 'DISPUTED', statusChangedAt: new Date(), version: { increment: 1 } },
      });
      if (res.count === 0) throw conflict('CONCURRENT_UPDATE', 'Sevkiyat bu arada güncellendi');
      await tx.dispute.create({
        data: {
          shipmentId: id,
          openedByCompanyId: who === 'SHIPPER' ? s.shipperCompanyId : s.carrierCompanyId,
          openedByUserId: actor.userId,
          reason,
          previousStatus: s.status,
        },
      });
      await tx.shipmentEvent.create({
        data: {
          shipmentId: id,
          type: 'DISPUTE_OPENED',
          fromStatus: s.status,
          toStatus: 'DISPUTED',
          actorUserId: actor.userId,
          actorRole: who,
          note: reason,
        },
      });
    });
    await this.notifications.notifyStaff(null, 'SHIPMENT_DISPUTED', {
      shipmentId: id,
      referenceNo: s.referenceNo,
    });
    for (const cid of [s.shipperCompanyId, s.carrierCompanyId]) {
      await this.notifications.notifyCompany(null, cid, 'SHIPMENT_DISPUTED', {
        shipmentId: id,
        referenceNo: s.referenceNo,
      });
    }
    return this.get(actor, id);
  }

  /** Ops kararı: tamamla veya iptal; kusurlu taraf ilişki geçmişine yazılır. */
  async resolveDispute(
    actor: AuthActor,
    disputeId: string,
    input: z.infer<typeof resolveDisputeSchema>,
  ) {
    const d = await this.db.dispute.findUnique({ where: { id: disputeId } });
    if (!d) throw notFound('Dispute', disputeId);
    if (d.status !== 'OPEN') throw conflict('DISPUTE_CLOSED', 'Uyuşmazlık zaten kapatılmış');
    const s = await this.full(d.shipmentId);
    const event = input.outcome === 'COMPLETED' ? 'RESOLVE_COMPLETE' : 'RESOLVE_CANCEL';
    transition(shipmentMachine, s.status, event, 'OPS');

    await this.db.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'RESOLVED',
          outcome: input.outcome,
          faultParty: input.faultParty ?? null,
          resolution: input.resolution,
          resolvedById: actor.userId,
          resolvedAt: new Date(),
        },
      });
      await tx.shipmentEvent.create({
        data: {
          shipmentId: s.id,
          type: 'DISPUTE_RESOLVED',
          fromStatus: 'DISPUTED',
          toStatus: input.outcome,
          actorUserId: actor.userId,
          actorRole: 'OPS',
          note: input.resolution,
          payload: { faultParty: input.faultParty ?? null },
        },
      });
      if (input.faultParty === 'CARRIER') {
        await tx.companyPairStats.upsert({
          where: {
            shipperCompanyId_carrierCompanyId: {
              shipperCompanyId: s.shipperCompanyId,
              carrierCompanyId: s.carrierCompanyId,
            },
          },
          create: {
            shipperCompanyId: s.shipperCompanyId,
            carrierCompanyId: s.carrierCompanyId,
            lastDisputeLostAt: new Date(),
          },
          update: { lastDisputeLostAt: new Date() },
        });
      }
      const now = new Date();
      await tx.shipment.update({
        where: { id: s.id },
        data: {
          status: input.outcome,
          statusChangedAt: now,
          version: { increment: 1 },
          ...(input.outcome === 'COMPLETED'
            ? { completedAt: now }
            : { cancelledAt: now, cancelledBy: 'PLATFORM', cancellationReason: input.resolution }),
        },
      });
      if (input.outcome === 'COMPLETED') {
        await this.syncLoad(tx, s.loadId, 'COMPLETED');
        await this.onCompleted(tx, s);
      } else {
        const load = await tx.load.findUniqueOrThrow({ where: { id: s.loadId } });
        await tx.load.update({
          where: { id: s.loadId },
          data: { status: transition(loadMachine, load.status, 'DISPUTE_CANCEL', 'SYSTEM') },
        });
        await tx.truckPosting.updateMany({
          where: { id: s.truckPostingId, status: 'RESERVED' },
          data: { status: 'EXPIRED' },
        });
      }
    });
    await audit(this.db, actor, 'dispute.resolve', 'Dispute', disputeId, d, input);
    return this.db.dispute.findUniqueOrThrow({ where: { id: disputeId } });
  }

  // ── Zamanlayıcılar ───────────────────────────────────────────────────
  /** Yükleme penceresi + tolerans sonrası hâlâ ASSIGNED → yük veren ve ops'a uyarı. */
  async noShowCheck(shipmentId: string) {
    const s = await this.db.shipment.findUnique({
      where: { id: shipmentId },
      include: { load: true },
    });
    if (!s || s.status !== 'ASSIGNED') return;
    await this.notifications.notifyCompany(
      null,
      s.shipperCompanyId,
      'NO_SHOW_ALERT',
      { shipmentId, referenceNo: s.referenceNo },
      { dedupKey: `noshow:${shipmentId}` },
    );
    await this.notifications.notifyStaff(null, 'NO_SHOW_ALERT', {
      shipmentId,
      referenceNo: s.referenceNo,
    });
  }

  /** POD sonrası 72 saat itirazsız → otomatik tamamlanır. */
  async autoComplete(shipmentId: string) {
    const s = await this.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s || s.status !== 'POD_SUBMITTED' || !s.podSubmittedAt) return;
    if (Date.now() - s.podSubmittedAt.getTime() < AUTO_COMPLETE_MS) return;
    await this.applyTransition(
      this.db,
      s,
      'COMPLETED',
      null,
      'SYSTEM',
      'Otomatik onay (72 saat itirazsız)',
    );
  }

  /** Test/uzlaştırma: süresi gelmiş POD'ları kapatır. */
  async reconcileAutoComplete(): Promise<number> {
    const due = await this.db.shipment.findMany({
      where: {
        status: 'POD_SUBMITTED',
        podSubmittedAt: { lte: new Date(Date.now() - AUTO_COMPLETE_MS) },
      },
      select: { id: true },
    });
    for (const d of due) await this.autoComplete(d.id);
    return due.length;
  }
}
