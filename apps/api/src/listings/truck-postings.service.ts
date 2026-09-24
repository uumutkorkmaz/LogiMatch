import { Injectable } from '@nestjs/common';
import {
  type CreateTruckPostingInput,
  findCity,
  placeKey,
  type PreferredDestinationInput,
  transition,
  truckPostingMachine,
  type TruckPostingQuery,
  type UpdateTruckPostingInput,
} from '@logimatch/shared';
import {
  type AuthActor,
  assertCompanyOperational,
  assertCompanyPermission,
  isMemberOf,
  membershipOf,
  requireActiveCompany,
} from '../common/actor';
import { badRequest, conflict, notFound, unprocessable } from '../common/errors';
import { audit } from '../common/interceptors';
import { maskCompany, maskPlate } from '../common/masking';
import { mapPage, paginate } from '../common/pagination';
import { nextReference } from '../common/reference';
import { type Db, type DbOrTx, InjectDb, Prisma } from '../infra/prisma';
import { OutboxService } from '../queue/outbox.service';
import { GeoService } from './geo.service';

const include = {
  vehicle: true,
  trailer: true,
  driver: true,
  carrierCompany: { include: { stats: true } },
} satisfies Prisma.TruckPostingInclude;
type PostingFull = Prisma.TruckPostingGetPayload<{ include: typeof include }>;

@Injectable()
export class TruckPostingsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly geo: GeoService,
    private readonly outbox: OutboxService,
  ) {}

  /** Tercih edilen destinasyonlara gazetteer koordinatı ekler (routeFit ve koridor için). */
  private destinations(prefs: PreferredDestinationInput[]) {
    const resolved = prefs.map((p) => {
      const c = p.city ? findCity(p.city, p.country) : undefined;
      return {
        country: p.country,
        city: c?.name ?? p.city ?? null,
        lat: c?.lat ?? null,
        lng: c?.lng ?? null,
      };
    });
    return {
      preferredDestinations: resolved as unknown as Prisma.InputJsonValue,
      preferredCities: resolved.filter((r) => r.city).map((r) => placeKey(r.city!)),
      preferredCountries: [...new Set(resolved.map((r) => r.country))],
    };
  }

  private async assertAssets(
    companyId: string,
    vehicleId: string,
    trailerId: string,
    driverId: string,
  ) {
    const [v, t, d] = await Promise.all([
      this.db.vehicle.findUnique({ where: { id: vehicleId } }),
      this.db.trailer.findUnique({ where: { id: trailerId } }),
      this.db.driver.findUnique({ where: { id: driverId } }),
    ]);
    if (!v || v.carrierCompanyId !== companyId) throw notFound('Vehicle', vehicleId);
    if (!t || t.carrierCompanyId !== companyId) throw notFound('Trailer', trailerId);
    if (!d || d.carrierCompanyId !== companyId) throw notFound('Driver', driverId);
    if (v.status !== 'ACTIVE' || t.status !== 'ACTIVE' || d.status !== 'ACTIVE') {
      throw unprocessable(
        'ASSET_INACTIVE',
        'Araç, dorse veya şoför aktif değil (belgelerini kontrol edin)',
      );
    }
  }

  async create(actor: AuthActor, input: CreateTruckPostingInput) {
    const m = requireActiveCompany(actor, { kind: 'CARRIER', permission: 'listing:write' });
    await this.assertAssets(m.companyId, input.vehicleId, input.trailerId, input.driverId);
    const origin = await this.geo.resolve(input.origin);
    if (origin.source === 'FAILED') {
      throw unprocessable('GEOCODE_FAILED', 'Konum bulunamadı; haritadan işaretleyin');
    }
    return this.db.$transaction(async (tx) =>
      tx.truckPosting.create({
        data: {
          referenceNo: await nextReference(tx, 'TP'),
          carrierCompanyId: m.companyId,
          createdByUserId: actor.userId,
          vehicleId: input.vehicleId,
          trailerId: input.trailerId,
          driverId: input.driverId,
          availableFrom: input.availableFrom,
          availableUntil: input.availableUntil,
          originAddress: input.origin.address,
          originCity: input.origin.city,
          originDistrict: input.origin.district ?? null,
          originCountry: input.origin.country,
          originLat: origin.lat!,
          originLng: origin.lng!,
          ...this.destinations(input.preferredDestinations),
          maxDeadheadKm: input.maxDeadheadKm,
          maxRouteDeviationKm: input.maxRouteDeviationKm ?? null,
          minPricePerKm: input.minPricePerKm ?? null,
          currency: input.currency,
          acceptsAdr: input.acceptsAdr,
          acceptsPartialLoad: input.acceptsPartialLoad,
          acceptsInternational: input.acceptsInternational,
          notes: input.notes ?? null,
        },
        include,
      }),
    );
  }

  async update(actor: AuthActor, id: string, patch: UpdateTruckPostingInput) {
    const p = await this.owned(actor, id);
    if (p.status !== 'DRAFT' && p.status !== 'ACTIVE')
      throw conflict('POSTING_NOT_EDITABLE', 'Rezerve veya kapalı ilan düzenlenemez');
    const from = patch.availableFrom ?? p.availableFrom;
    const until = patch.availableUntil ?? p.availableUntil;
    if (from >= until)
      throw badRequest('VALIDATION_FAILED', 'Müsaitlik sonu başlangıçtan sonra olmalı');
    if (patch.vehicleId || patch.trailerId || patch.driverId) {
      await this.assertAssets(
        p.carrierCompanyId,
        patch.vehicleId ?? p.vehicleId,
        patch.trailerId ?? p.trailerId,
        patch.driverId ?? p.driverId,
      );
    }
    const origin = patch.origin ? await this.geo.resolve(patch.origin) : null;
    if (origin?.source === 'FAILED')
      throw unprocessable('GEOCODE_FAILED', 'Konum bulunamadı; haritadan işaretleyin');
    const { origin: o, preferredDestinations, ...rest } = patch;
    const updated = await this.db.$transaction(async (tx) => {
      const res = await tx.truckPosting.updateMany({
        where: { id, version: p.version },
        data: {
          ...rest,
          ...(o && origin
            ? {
                originAddress: o.address,
                originCity: o.city,
                originDistrict: o.district ?? null,
                originCountry: o.country,
                originLat: origin.lat!,
                originLng: origin.lng!,
              }
            : {}),
          ...(preferredDestinations ? this.destinations(preferredDestinations) : {}),
          version: { increment: 1 },
        },
      });
      if (res.count === 0)
        throw conflict('CONCURRENT_UPDATE', 'İlan başka biri tarafından güncellendi');
      if (p.status === 'ACTIVE') {
        await tx.offer.updateMany({
          where: { truckPostingId: id, status: 'PENDING' },
          data: { status: 'WITHDRAWN', note: 'POSTING_CHANGED' },
        });
        await this.outbox.emit(tx, 'match.recompute', { entity: 'posting', id });
      }
      return tx.truckPosting.findUniqueOrThrow({ where: { id }, include });
    });
    await audit(this.db, actor, 'posting.update', 'TruckPosting', id, p, updated);
    return updated;
  }

  async publish(actor: AuthActor, id: string) {
    const p = await this.owned(actor, id);
    if (!actor.isStaff) assertCompanyOperational(membershipOf(actor, p.carrierCompanyId)!);
    const to = transition(
      truckPostingMachine,
      p.status,
      'PUBLISH',
      actor.isStaff ? 'OPS' : 'CARRIER',
    );
    if (p.availableUntil.getTime() <= Date.now())
      throw unprocessable('AVAILABILITY_PASSED', 'Müsaitlik süresi geçmiş');
    await this.assertAssets(p.carrierCompanyId, p.vehicleId, p.trailerId, p.driverId);
    return this.db
      .$transaction(async (tx) => {
        const res = await tx.truckPosting.updateMany({
          where: { id, version: p.version, status: 'DRAFT' },
          data: { status: to, publishedAt: new Date(), version: { increment: 1 } },
        });
        if (res.count === 0)
          throw conflict('CONCURRENT_UPDATE', 'İlan başka biri tarafından güncellendi');
        await this.outbox.emit(tx, 'match.compute', { entity: 'posting', id });
        await this.outbox.emit(
          tx,
          'listing.expire',
          { entity: 'posting', id },
          { runAt: p.availableUntil },
        );
        return tx.truckPosting.findUniqueOrThrow({ where: { id }, include });
      })
      .catch((err: unknown) => {
        if ((err as { code?: string }).code === 'P2002') {
          throw conflict('VEHICLE_ALREADY_POSTED', 'Bu araç için zaten aktif bir ilan var');
        }
        throw err;
      });
  }

  async cancel(actor: AuthActor, id: string, reason: string) {
    const p = await this.owned(actor, id);
    const to = transition(
      truckPostingMachine,
      p.status,
      'CANCEL',
      actor.isStaff ? 'OPS' : 'CARRIER',
    );
    const updated = await this.db.$transaction(async (tx) => {
      const res = await tx.truckPosting.updateMany({
        where: { id, version: p.version },
        data: { status: to, cancelledAt: new Date(), notes: reason, version: { increment: 1 } },
      });
      if (res.count === 0)
        throw conflict('CONCURRENT_UPDATE', 'İlan başka biri tarafından güncellendi');
      await this.closePostingDeals(tx, id, 'POSTING_CANCELLED');
      return tx.truckPosting.findUniqueOrThrow({ where: { id } });
    });
    await audit(this.db, actor, 'posting.cancel', 'TruckPosting', id, p, updated);
    return updated;
  }

  async closePostingDeals(tx: DbOrTx, postingId: string, reason: string) {
    await tx.offer.updateMany({
      where: { truckPostingId: postingId, status: 'PENDING' },
      data: { status: 'WITHDRAWN', note: reason },
    });
    await tx.match.updateMany({
      where: {
        truckPostingId: postingId,
        status: {
          in: ['SUGGESTED', 'VIEWED', 'INTERESTED_BY_SHIPPER', 'INTERESTED_BY_CARRIER', 'MUTUAL'],
        },
      },
      data: { status: 'EXPIRED', dismissReason: reason },
    });
  }

  /** listing.expire işi (#5). */
  async expire(id: string) {
    const p = await this.db.truckPosting.findUnique({ where: { id } });
    if (!p || p.status !== 'ACTIVE' || p.availableUntil.getTime() > Date.now()) return;
    await this.db.$transaction(async (tx) => {
      const res = await tx.truckPosting.updateMany({
        where: { id, status: 'ACTIVE' },
        data: { status: 'EXPIRED', version: { increment: 1 } },
      });
      if (res.count) await this.closePostingDeals(tx, id, 'POSTING_EXPIRED');
    });
  }

  private async owned(actor: AuthActor, id: string): Promise<PostingFull> {
    const p = await this.db.truckPosting.findUnique({ where: { id }, include });
    if (!p) throw notFound('TruckPosting', id);
    if (!actor.isStaff) assertCompanyPermission(actor, p.carrierCompanyId, 'listing:write');
    return p;
  }

  /** Yük verenler için: plaka, şoför ve firma kimliği gizli. */
  publicView(p: PostingFull) {
    const {
      vehicle,
      trailer,
      driver,
      carrierCompany,
      createdByUserId: _c,
      originAddress: _o,
      notes: _n,
      ...rest
    } = p;
    return {
      ...rest,
      originAddress: [p.originDistrict, p.originCity].filter(Boolean).join(', '),
      originLat: Math.round(p.originLat * 100) / 100,
      originLng: Math.round(p.originLng * 100) / 100,
      vehicle: {
        type: vehicle.type,
        brand: vehicle.brand,
        year: vehicle.year,
        euroNorm: vehicle.euroNorm,
        plate: maskPlate(vehicle.plate),
      },
      trailer: { ...trailer, plate: maskPlate(trailer.plate), plateNormalized: undefined },
      driver: {
        adrClasses: driver.adrClasses,
        visaCountries: driver.visaCountries,
        srcTypes: driver.srcTypes,
      },
      carrier: maskCompany(carrierCompany, 'CARRIER'),
      viewerSide: 'PUBLIC',
    };
  }

  async get(actor: AuthActor, id: string) {
    const p = await this.db.truckPosting.findUnique({ where: { id }, include });
    if (!p) throw notFound('TruckPosting', id);
    if (actor.isStaff || isMemberOf(actor, p.carrierCompanyId))
      return { ...p, viewerSide: 'OWNER' };
    const mine = actor.memberships.map((m) => m.companyId);
    const deal = await this.db.shipment.count({
      where: { truckPostingId: id, shipperCompanyId: { in: mine } },
    });
    if (deal) return { ...p, viewerSide: 'SHIPPER_ASSIGNED' };
    if (p.status !== 'ACTIVE') throw notFound('TruckPosting', id);
    return this.publicView(p);
  }

  async list(actor: AuthActor, q: TruckPostingQuery) {
    const mine = actor.memberships.map((m) => m.companyId);
    const where: Prisma.TruckPostingWhereInput = {};
    if (q.mine) {
      where.carrierCompanyId = actor.activeCompanyId ?? '00000000-0000-0000-0000-000000000000';
      if (q.status) where.status = q.status;
    } else {
      where.status = actor.isStaff && q.status ? q.status : 'ACTIVE';
      where.pausedAt = null;
    }
    if (q.originCity) where.originCity = { equals: q.originCity, mode: 'insensitive' };
    if (q.destinationCity) where.preferredCities = { has: placeKey(q.destinationCity) };
    if (q.trailerType || q.minCapacityKg != null) {
      where.trailer = {
        ...(q.trailerType ? { trailerType: q.trailerType } : {}),
        ...(q.minCapacityKg != null ? { capacityKg: { gte: q.minCapacityKg } } : {}),
      };
    }
    if (q.acceptsAdr != null) where.acceptsAdr = q.acceptsAdr;
    if (q.availableFrom || q.availableTo) {
      where.AND = [
        ...(q.availableTo ? [{ availableFrom: { lt: q.availableTo } }] : []),
        ...(q.availableFrom ? [{ availableUntil: { gt: q.availableFrom } }] : []),
      ];
    }
    if (q.bbox) {
      where.originLat = { gte: q.bbox.minLat, lte: q.bbox.maxLat };
      where.originLng = { gte: q.bbox.minLng, lte: q.bbox.maxLng };
    }
    const page = await paginate(q, (args) =>
      this.db.truckPosting.findMany({ where, orderBy: { id: 'desc' }, include, ...args }),
    );
    return mapPage(page, (p) =>
      actor.isStaff || mine.includes(p.carrierCompanyId) ? p : this.publicView(p),
    );
  }
}
