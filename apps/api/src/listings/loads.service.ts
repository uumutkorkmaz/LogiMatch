import { Injectable } from '@nestjs/common';
import {
  type CreateLoadInput,
  type LoadFieldsInput,
  type LoadQuery,
  loadCrossFieldIssues,
  loadFieldsSchema,
  loadMachine,
  Money,
  OPEN_LOAD_STATUSES,
  transition,
  type UpdateLoadInput,
} from '@logimatch/shared';
import {
  type AuthActor,
  assertCompanyOperational,
  assertCompanyPermission,
  isMemberOf,
  membershipOf,
  requireActiveCompany,
} from '../common/actor';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { audit } from '../common/interceptors';
import { coarseLocation, maskCompany } from '../common/masking';
import { mapPage, paginate } from '../common/pagination';
import { nextReference } from '../common/reference';
import { type Db, type DbOrTx, InjectDb, Prisma } from '../infra/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { estimatePriceRange } from '../pricing/domain/estimate';
import { PlatformConfigService } from '../platform/platform-config.service';
import { OutboxService } from '../queue/outbox.service';
import { GeoService } from './geo.service';

/** Yeni firmanın ilk N ilanı admin onayından geçer (#16). */
export const MODERATION_FIRST_N = 3;

/** Değişince açık teklifleri geri çeken ve eşleştirmeyi yeniden tetikleyen alanlar. */
const CRITICAL_FIELDS: (keyof LoadFieldsInput)[] = [
  'pickup',
  'delivery',
  'stops',
  'weightKg',
  'volumeM3',
  'loadingMeters',
  'palletCount',
  'requiredTrailerTypes',
  'requiredFeatures',
  'isAdr',
  'adrClass',
  'requiresTempControl',
  'minTempC',
  'maxTempC',
  'transportScope',
  'maxPieceLengthCm',
  'maxPieceWidthCm',
  'maxPieceHeightCm',
];

type LoadWithStops = Prisma.LoadGetPayload<{ include: { stops: true } }>;

@Injectable()
export class LoadsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly geo: GeoService,
    private readonly outbox: OutboxService,
    private readonly config: PlatformConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Yazma ────────────────────────────────────────────────────────────
  async create(actor: AuthActor, input: CreateLoadInput) {
    const m = requireActiveCompany(actor, { kind: 'SHIPPER', permission: 'listing:write' });
    const data = await this.buildData(input);
    const load = await this.db.$transaction(async (tx) => {
      const referenceNo = await nextReference(tx, 'LD');
      return tx.load.create({
        data: {
          ...data.fields,
          referenceNo,
          shipperCompanyId: m.companyId,
          createdByUserId: actor.userId,
          status: 'DRAFT',
          stops: { create: data.stops },
        },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      });
    });
    return load;
  }

  /**
   * Girdiyi DB alanlarına çevirir: geocoding (#20), tüm duraklar üzerinden rota (#21, #22)
   * ve bütçe yoksa referans fiyat aralığı.
   */
  private async buildData(input: LoadFieldsInput) {
    const [pickup, delivery, ...mid] = await Promise.all([
      this.geo.resolve(input.pickup),
      this.geo.resolve(input.delivery),
      ...input.stops.map((s) => this.geo.resolve(s)),
    ]);
    const all = [pickup, ...mid, delivery];
    const failed = all.some((r) => r.source === 'FAILED');
    const pinned = all.some((r) => r.source === 'PIN');
    const geocodeStatus: 'OK' | 'FAILED' | 'MANUAL_PIN' = failed
      ? 'FAILED'
      : pinned
        ? 'MANUAL_PIN'
        : 'OK';

    let route: { distanceKm: number; durationMin: number } | null = null;
    if (!failed) route = await this.geo.route(all.map((r) => ({ lat: r.lat!, lng: r.lng! })));

    let estimatedPriceMin: string | null = null;
    let estimatedPriceMax: string | null = null;
    if (route) {
      const cfg = await this.config.pricing();
      const est = estimatePriceRange(
        {
          distanceKm: route.distanceKm,
          trailerType: input.requiredTrailerTypes[0]!,
          weightKg: input.weightKg,
          isAdr: input.isAdr,
          requiresTempControl: input.requiresTempControl,
          international: input.transportScope === 'INTERNATIONAL',
        },
        cfg.bands,
      );
      const rate = await this.config.fxRate('TRY', input.currency).catch(() => null);
      if (rate) {
        estimatedPriceMin = est.min.convert(rate, input.currency).toString();
        estimatedPriceMax = est.max.convert(rate, input.currency).toString();
      }
    }

    const stopRows = [
      { ...input.pickup, type: 'PICKUP' as const, r: pickup, q: {} },
      ...input.stops.map((s, i) => ({ ...s, r: mid[i]!, q: s })),
      { ...input.delivery, type: 'DELIVERY' as const, r: delivery, q: {} },
    ].map((s, i) => ({
      sequence: i + 1,
      type: s.type,
      address: s.address,
      city: s.city,
      district: s.district ?? null,
      country: s.country,
      lat: s.r.lat,
      lng: s.r.lng,
      windowStart: s.windowStart,
      windowEnd: s.windowEnd,
      weightKg: 'weightKg' in s.q ? (s.q.weightKg ?? null) : null,
      volumeM3: 'volumeM3' in s.q ? (s.q.volumeM3 ?? null) : null,
      loadingMeters: 'loadingMeters' in s.q ? (s.q.loadingMeters ?? null) : null,
      palletCount: 'palletCount' in s.q ? (s.q.palletCount ?? null) : null,
    }));

    const fields = {
      pickupAddress: input.pickup.address,
      pickupCity: input.pickup.city,
      pickupDistrict: input.pickup.district ?? null,
      pickupCountry: input.pickup.country,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      pickupWindowStart: input.pickup.windowStart,
      pickupWindowEnd: input.pickup.windowEnd,
      deliveryAddress: input.delivery.address,
      deliveryCity: input.delivery.city,
      deliveryDistrict: input.delivery.district ?? null,
      deliveryCountry: input.delivery.country,
      deliveryLat: delivery.lat,
      deliveryLng: delivery.lng,
      deliveryWindowStart: input.delivery.windowStart,
      deliveryWindowEnd: input.delivery.windowEnd,
      cargoType: input.cargoType,
      cargoDescription: input.cargoDescription ?? null,
      weightKg: input.weightKg,
      volumeM3: input.volumeM3 ?? null,
      loadingMeters: input.loadingMeters ?? null,
      palletCount: input.palletCount ?? null,
      palletType: input.palletType ?? null,
      isStackable: input.isStackable,
      isFragile: input.isFragile,
      declaredValue: input.declaredValue ?? null,
      maxPieceLengthCm: input.maxPieceLengthCm ?? null,
      maxPieceWidthCm: input.maxPieceWidthCm ?? null,
      maxPieceHeightCm: input.maxPieceHeightCm ?? null,
      requiredTrailerTypes: input.requiredTrailerTypes,
      requiredFeatures: input.requiredFeatures,
      isAdr: input.isAdr,
      adrClass: input.isAdr ? (input.adrClass ?? null) : null,
      unNumber: input.isAdr ? (input.unNumber ?? null) : null,
      packingGroup: input.isAdr ? (input.packingGroup ?? null) : null,
      requiresTempControl: input.requiresTempControl,
      minTempC: input.requiresTempControl ? (input.minTempC ?? null) : null,
      maxTempC: input.requiresTempControl ? (input.maxTempC ?? null) : null,
      loadingMethod: input.loadingMethod ?? null,
      unloadingMethod: input.unloadingMethod ?? null,
      transportScope: input.transportScope,
      customsRequired: input.customsRequired,
      incoterm: input.incoterm ?? null,
      pricingMode: input.pricingMode,
      budgetMin:
        input.pricingMode === 'FIXED' ? (input.budgetMax ?? null) : (input.budgetMin ?? null),
      budgetMax: input.budgetMax ?? null,
      currency: input.currency,
      paymentTerm: input.paymentTerm,
      withholdingApplies: input.withholdingApplies,
      vatRate: input.transportScope === 'INTERNATIONAL' ? '0' : '0.20',
      estimatedPriceMin,
      estimatedPriceMax,
      routeDistanceKm: route?.distanceKm ?? null,
      routeDurationMin: route?.durationMin ?? null,
      routeStatus: failed
        ? ('PENDING' as const)
        : route
          ? ('OK' as const)
          : ('ROUTE_NOT_FOUND' as const),
      geocodeStatus: geocodeStatus,
      expiresAt: input.expiresAt ?? null,
      visibility: input.visibility,
      invitedCarrierCompanyIds: input.invitedCarrierCompanyIds,
    };
    return { fields, stops: stopRows };
  }

  /** DB satırını tekrar girdi şekline çevirir (PATCH birleştirmesi için). */
  private toInput(l: LoadWithStops): LoadFieldsInput {
    const mids = l.stops.filter((s) => s.sequence !== 1 && s.sequence !== l.stops.length);
    return loadFieldsSchema.parse({
      pickup: {
        address: l.pickupAddress,
        city: l.pickupCity,
        district: l.pickupDistrict ?? undefined,
        country: l.pickupCountry,
        lat: l.geocodeStatus === 'MANUAL_PIN' ? (l.pickupLat ?? undefined) : undefined,
        lng: l.geocodeStatus === 'MANUAL_PIN' ? (l.pickupLng ?? undefined) : undefined,
        windowStart: l.pickupWindowStart,
        windowEnd: l.pickupWindowEnd,
      },
      delivery: {
        address: l.deliveryAddress,
        city: l.deliveryCity,
        district: l.deliveryDistrict ?? undefined,
        country: l.deliveryCountry,
        lat: l.geocodeStatus === 'MANUAL_PIN' ? (l.deliveryLat ?? undefined) : undefined,
        lng: l.geocodeStatus === 'MANUAL_PIN' ? (l.deliveryLng ?? undefined) : undefined,
        windowStart: l.deliveryWindowStart,
        windowEnd: l.deliveryWindowEnd,
      },
      stops: mids.map((s) => ({
        type: s.type,
        address: s.address,
        city: s.city,
        district: s.district ?? undefined,
        country: s.country,
        lat: s.lat ?? undefined,
        lng: s.lng ?? undefined,
        windowStart: s.windowStart,
        windowEnd: s.windowEnd,
        weightKg: s.weightKg ?? undefined,
        volumeM3: s.volumeM3 ?? undefined,
        loadingMeters: s.loadingMeters ?? undefined,
        palletCount: s.palletCount ?? undefined,
      })),
      cargoType: l.cargoType,
      cargoDescription: l.cargoDescription ?? undefined,
      weightKg: l.weightKg,
      volumeM3: l.volumeM3 ?? undefined,
      loadingMeters: l.loadingMeters ?? undefined,
      palletCount: l.palletCount ?? undefined,
      palletType: l.palletType ?? undefined,
      isStackable: l.isStackable,
      isFragile: l.isFragile,
      declaredValue: l.declaredValue?.toString(),
      maxPieceLengthCm: l.maxPieceLengthCm ?? undefined,
      maxPieceWidthCm: l.maxPieceWidthCm ?? undefined,
      maxPieceHeightCm: l.maxPieceHeightCm ?? undefined,
      requiredTrailerTypes: l.requiredTrailerTypes,
      requiredFeatures: l.requiredFeatures,
      isAdr: l.isAdr,
      adrClass: l.adrClass ?? undefined,
      unNumber: l.unNumber ?? undefined,
      packingGroup: l.packingGroup ?? undefined,
      requiresTempControl: l.requiresTempControl,
      minTempC: l.minTempC ?? undefined,
      maxTempC: l.maxTempC ?? undefined,
      loadingMethod: l.loadingMethod ?? undefined,
      unloadingMethod: l.unloadingMethod ?? undefined,
      transportScope: l.transportScope,
      customsRequired: l.customsRequired,
      incoterm: l.incoterm ?? undefined,
      pricingMode: l.pricingMode,
      budgetMin: l.budgetMin?.toString(),
      budgetMax: l.budgetMax?.toString(),
      currency: l.currency,
      paymentTerm: l.paymentTerm,
      withholdingApplies: l.withholdingApplies,
      expiresAt: l.expiresAt ?? undefined,
      visibility: l.visibility,
      invitedCarrierCompanyIds: l.invitedCarrierCompanyIds,
    });
  }

  async update(actor: AuthActor, id: string, patch: UpdateLoadInput) {
    const load = await this.loadOwned(actor, id);
    if (load.status !== 'DRAFT' && !OPEN_LOAD_STATUSES.includes(load.status)) {
      throw conflict('LOAD_NOT_EDITABLE', 'Atanmış veya kapanmış ilan düzenlenemez');
    }
    const merged: LoadFieldsInput = { ...this.toInput(load), ...patch };
    const issues = loadCrossFieldIssues(merged);
    if (issues.length)
      throw badRequest('VALIDATION_FAILED', 'İlan doğrulanamadı', { errors: issues });

    const critical = CRITICAL_FIELDS.some((f) => f in patch);
    const data = await this.buildData(merged);
    const updated = await this.db.$transaction(async (tx) => {
      const res = await tx.load.updateMany({
        where: { id, version: load.version },
        data: { ...data.fields, version: { increment: 1 } },
      });
      if (res.count === 0)
        throw conflict('CONCURRENT_UPDATE', 'İlan başka biri tarafından güncellendi');
      await tx.loadStop.deleteMany({ where: { loadId: id } });
      await tx.loadStop.createMany({ data: data.stops.map((s) => ({ ...s, loadId: id })) });
      if (OPEN_LOAD_STATUSES.includes(load.status) && critical) {
        await this.withdrawPendingOffers(tx, id, 'LOAD_CHANGED');
        await this.outbox.emit(tx, 'match.recompute', { entity: 'load', id });
      }
      return tx.load.findUniqueOrThrow({
        where: { id },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      });
    });
    await audit(this.db, actor, 'load.update', 'Load', id, load, updated);
    return updated;
  }

  /** Harita pini ile geocoding düzeltmesi (#20). */
  async pin(actor: AuthActor, id: string, target: 'pickup' | 'delivery', lat: number, lng: number) {
    const load = await this.loadOwned(actor, id);
    const input = this.toInput(load);
    input[target] = { ...input[target], lat, lng };
    return this.update(actor, id, { [target]: input[target] });
  }

  async publish(actor: AuthActor, id: string) {
    const load = await this.loadOwned(actor, id);
    const m = membershipOf(actor, load.shipperCompanyId);
    if (!actor.isStaff) {
      assertCompanyPermission(actor, load.shipperCompanyId, 'listing:write');
      assertCompanyOperational(m!);
    }
    const to = transition(loadMachine, load.status, 'PUBLISH', actor.isStaff ? 'OPS' : 'SHIPPER');
    if (load.geocodeStatus === 'FAILED') {
      throw unprocessable('GEOCODE_FAILED', 'Adres bulunamadı; haritadan konum işaretleyin', {
        hint: 'POST /loads/:id/pin',
      });
    }
    if (load.pickupWindowEnd.getTime() <= Date.now()) {
      throw unprocessable('PICKUP_WINDOW_PASSED', 'Yükleme penceresi geçmiş');
    }
    const company = await this.db.company.findUniqueOrThrow({
      where: { id: load.shipperCompanyId },
    });
    const needsReview = company.listingsReviewedCount < MODERATION_FIRST_N;
    const expiresAt =
      load.expiresAt && load.expiresAt < load.pickupWindowEnd
        ? load.expiresAt
        : load.pickupWindowEnd;

    const published = await this.db.$transaction(async (tx) => {
      const res = await tx.load.updateMany({
        where: { id, version: load.version, status: 'DRAFT' },
        data: {
          status: to,
          publishedAt: new Date(),
          expiresAt,
          moderationStatus: needsReview ? 'PENDING_REVIEW' : 'NOT_REQUIRED',
          version: { increment: 1 },
        },
      });
      if (res.count === 0)
        throw conflict('CONCURRENT_UPDATE', 'İlan başka biri tarafından güncellendi');
      if (needsReview) {
        await tx.riskFlag.create({
          data: {
            type: 'LISTING_REVIEW',
            entityType: 'Load',
            entityId: id,
            companyId: load.shipperCompanyId,
            details: {
              referenceNo: load.referenceNo,
              reason: `İlk ${MODERATION_FIRST_N} ilan onayı`,
            },
          },
        });
      } else {
        await this.outbox.emit(tx, 'match.compute', { entity: 'load', id });
      }
      await this.outbox.emit(tx, 'listing.expire', { entity: 'load', id }, { runAt: expiresAt });
      return tx.load.findUniqueOrThrow({
        where: { id },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      });
    });
    if (needsReview)
      await this.notifications.notifyStaff(null, 'LOAD_MODERATION', {
        referenceNo: load.referenceNo,
        pending: true,
      });
    return published;
  }

  /** Admin moderasyon kararı (#16). */
  async moderate(actor: AuthActor, id: string, approve: boolean, reason?: string) {
    const load = await this.db.load.findUnique({ where: { id } });
    if (!load) throw notFound('Load', id);
    if (load.moderationStatus !== 'PENDING_REVIEW')
      throw conflict('NOT_IN_REVIEW', 'İlan incelemede değil');
    await this.db.$transaction(async (tx) => {
      await tx.load.update({
        where: { id },
        data: approve
          ? { moderationStatus: 'APPROVED', version: { increment: 1 } }
          : {
              moderationStatus: 'REJECTED',
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancellationReason: reason ?? 'Moderasyon reddi',
              version: { increment: 1 },
            },
      });
      if (approve) {
        await tx.company.update({
          where: { id: load.shipperCompanyId },
          data: { listingsReviewedCount: { increment: 1 } },
        });
        await this.outbox.emit(tx, 'match.compute', { entity: 'load', id });
      }
      await tx.riskFlag.updateMany({
        where: { type: 'LISTING_REVIEW', entityId: id, status: 'OPEN' },
        data: {
          status: approve ? 'RESOLVED' : 'DISMISSED',
          resolvedById: actor.userId,
          resolvedAt: new Date(),
          resolution: reason ?? (approve ? 'Onaylandı' : 'Reddedildi'),
        },
      });
    });
    await audit(
      this.db,
      actor,
      approve ? 'load.moderation.approve' : 'load.moderation.reject',
      'Load',
      id,
    );
    await this.notifications.notifyCompany(null, load.shipperCompanyId, 'LOAD_MODERATION', {
      referenceNo: load.referenceNo,
      approved: approve,
      reason,
    });
    return this.db.load.findUniqueOrThrow({ where: { id } });
  }

  async cancel(actor: AuthActor, id: string, reason: string) {
    const load = await this.loadOwned(actor, id);
    if (load.status === 'ASSIGNED') {
      throw conflict(
        'LOAD_HAS_SHIPMENT',
        'Atanmış ilan sevkiyat üzerinden iptal edilir: POST /shipments/:id/cancel',
      );
    }
    const to = transition(loadMachine, load.status, 'CANCEL', actor.isStaff ? 'OPS' : 'SHIPPER');
    const updated = await this.db.$transaction(async (tx) => {
      const res = await tx.load.updateMany({
        where: { id, version: load.version },
        data: {
          status: to,
          cancelledAt: new Date(),
          cancellationReason: reason,
          version: { increment: 1 },
        },
      });
      if (res.count === 0)
        throw conflict('CONCURRENT_UPDATE', 'İlan başka biri tarafından güncellendi');
      await this.closeLoadDeals(tx, id, 'LOAD_CANCELLED');
      return tx.load.findUniqueOrThrow({ where: { id } });
    });
    await audit(this.db, actor, 'load.cancel', 'Load', id, load, updated);
    return updated;
  }

  /** İlan kapanınca açık eşleşmeler EXPIRED, bekleyen teklifler WITHDRAWN. */
  async closeLoadDeals(tx: DbOrTx, loadId: string, reason: string) {
    await this.withdrawPendingOffers(tx, loadId, reason);
    await tx.match.updateMany({
      where: {
        loadId,
        status: {
          in: ['SUGGESTED', 'VIEWED', 'INTERESTED_BY_SHIPPER', 'INTERESTED_BY_CARRIER', 'MUTUAL'],
        },
      },
      data: { status: 'EXPIRED', dismissReason: reason },
    });
  }

  private async withdrawPendingOffers(tx: DbOrTx, loadId: string, reason: string) {
    await tx.offer.updateMany({
      where: { loadId, status: 'PENDING' },
      data: { status: 'WITHDRAWN', note: reason, respondedAt: new Date() },
    });
  }

  /** listing.expire işi (#5). */
  async expire(id: string) {
    const load = await this.db.load.findUnique({ where: { id } });
    if (!load || !OPEN_LOAD_STATUSES.includes(load.status)) return;
    const expiresAt = load.expiresAt ?? load.pickupWindowEnd;
    if (expiresAt.getTime() > Date.now()) return;
    await this.db.$transaction(async (tx) => {
      const res = await tx.load.updateMany({
        where: { id, status: { in: [...OPEN_LOAD_STATUSES] } },
        data: { status: 'EXPIRED', version: { increment: 1 } },
      });
      if (res.count) await this.closeLoadDeals(tx, id, 'LOAD_EXPIRED');
    });
  }

  // ── Okuma ────────────────────────────────────────────────────────────
  private async loadOwned(actor: AuthActor, id: string): Promise<LoadWithStops> {
    const load = await this.db.load.findUnique({
      where: { id },
      include: { stops: { orderBy: { sequence: 'asc' } } },
    });
    if (!load) throw notFound('Load', id);
    if (!actor.isStaff) assertCompanyPermission(actor, load.shipperCompanyId, 'listing:write');
    return load;
  }

  async get(actor: AuthActor, id: string) {
    const load = await this.db.load.findUnique({
      where: { id },
      include: {
        stops: { orderBy: { sequence: 'asc' } },
        shipperCompany: { include: { stats: true } },
      },
    });
    if (!load) throw notFound('Load', id);
    if (actor.isStaff || isMemberOf(actor, load.shipperCompanyId))
      return { ...load, viewerSide: 'OWNER' };

    const mine = actor.memberships.map((m) => m.companyId);
    const shipment = await this.db.shipment.findFirst({
      where: { loadId: id, carrierCompanyId: { in: mine }, status: { not: 'CANCELLED' } },
    });
    if (shipment) return { ...load, viewerSide: 'CARRIER_ASSIGNED' };

    const publicOk =
      OPEN_LOAD_STATUSES.includes(load.status) &&
      ['NOT_REQUIRED', 'APPROVED'].includes(load.moderationStatus) &&
      (load.visibility === 'PUBLIC' || mine.some((c) => load.invitedCarrierCompanyIds.includes(c)));
    const hasMatch = await this.db.match.count({
      where: { loadId: id, truckPosting: { carrierCompanyId: { in: mine } } },
    });
    if (!publicOk && hasMatch === 0) throw notFound('Load', id);
    return this.publicView(load);
  }

  /** Taraf olmayanlar için maskeli görünüm: adres ilçe düzeyinde, firma takma adla. */
  publicView(load: LoadWithStops & { shipperCompany: Parameters<typeof maskCompany>[0] }) {
    const {
      shipperCompany,
      createdByUserId: _c,
      pickupAddress: _pa,
      deliveryAddress: _da,
      stops,
      ...rest
    } = load;
    return {
      ...rest,
      viewerSide: 'PUBLIC',
      pickupAddress: [load.pickupDistrict, load.pickupCity].filter(Boolean).join(', '),
      deliveryAddress: [load.deliveryDistrict, load.deliveryCity].filter(Boolean).join(', '),
      ...Object.fromEntries(
        Object.entries(coarseLocation(load.pickupLat, load.pickupLng)).map(([k, v]) => [
          `pickup${k === 'lat' ? 'Lat' : 'Lng'}`,
          v,
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(coarseLocation(load.deliveryLat, load.deliveryLng)).map(([k, v]) => [
          `delivery${k === 'lat' ? 'Lat' : 'Lng'}`,
          v,
        ]),
      ),
      stops: stops.map((s) => ({
        ...s,
        address: [s.district, s.city].filter(Boolean).join(', '),
        ...coarseLocation(s.lat, s.lng),
      })),
      shipper: maskCompany(shipperCompany, 'SHIPPER'),
    };
  }

  async list(actor: AuthActor, q: LoadQuery) {
    const mine = actor.memberships.map((m) => m.companyId);
    const where: Prisma.LoadWhereInput = {};
    if (q.mine) {
      if (!actor.activeCompanyId) throw forbidden('COMPANY_REQUIRED', 'Firma gerekli');
      where.shipperCompanyId = actor.activeCompanyId;
      if (q.status) where.status = q.status;
    } else if (!actor.isStaff || !q.status) {
      where.status =
        q.status && OPEN_LOAD_STATUSES.includes(q.status)
          ? q.status
          : { in: [...OPEN_LOAD_STATUSES] };
      where.moderationStatus = { in: ['NOT_REQUIRED', 'APPROVED'] };
      where.OR = [{ visibility: 'PUBLIC' }, { invitedCarrierCompanyIds: { hasSome: mine } }];
    } else {
      where.status = q.status;
    }
    if (q.pickupCity) where.pickupCity = { equals: q.pickupCity, mode: 'insensitive' };
    if (q.deliveryCity) where.deliveryCity = { equals: q.deliveryCity, mode: 'insensitive' };
    if (q.trailerType) where.requiredTrailerTypes = { has: q.trailerType };
    if (q.minWeightKg != null || q.maxWeightKg != null)
      where.weightKg = { gte: q.minWeightKg, lte: q.maxWeightKg };
    if (q.isAdr != null) where.isAdr = q.isAdr;
    if (q.transportScope) where.transportScope = q.transportScope;
    if (q.pickupFrom || q.pickupTo) {
      // Pencere kesişimi: [start, end) ∩ [from, to)
      where.AND = [
        ...(q.pickupTo ? [{ pickupWindowStart: { lt: q.pickupTo } }] : []),
        ...(q.pickupFrom ? [{ pickupWindowEnd: { gt: q.pickupFrom } }] : []),
      ];
    }
    if (q.bbox) {
      where.pickupLat = { gte: q.bbox.minLat, lte: q.bbox.maxLat };
      where.pickupLng = { gte: q.bbox.minLng, lte: q.bbox.maxLng };
    }
    const page = await paginate(q, (args) =>
      this.db.load.findMany({
        where,
        orderBy: { id: 'desc' },
        include: {
          stops: { orderBy: { sequence: 'asc' } },
          shipperCompany: { include: { stats: true } },
          _count: { select: { matches: true, offers: true } },
        },
        ...args,
      }),
    );
    return mapPage(page, (l) =>
      q.mine || actor.isStaff || mine.includes(l.shipperCompanyId) ? l : this.publicView(l),
    );
  }

  /** Toplam bütçe özeti (panel kartları için). */
  async summary(actor: AuthActor) {
    const m = requireActiveCompany(actor, { kind: 'SHIPPER' });
    const rows = await this.db.load.groupBy({
      by: ['status'],
      where: { shipperCompanyId: m.companyId },
      _count: true,
    });
    return Object.fromEntries(rows.map((r) => [r.status, r._count]));
  }
}

export const zeroTry = Money.zero('TRY');
