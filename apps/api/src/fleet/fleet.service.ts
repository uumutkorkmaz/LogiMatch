import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  type createDriverSchema,
  type createTrailerSchema,
  type createVehicleSchema,
  normalizePlate,
  type updateDriverSchema,
  type updateTrailerSchema,
  type updateVehicleSchema,
} from '@logimatch/shared';
import type { z } from 'zod';
import {
  type AuthActor,
  assertCompanyPermission,
  isMemberOf,
  requireActiveCompany,
} from '../common/actor';
import { conflict, forbidden, notFound } from '../common/errors';
import { audit } from '../common/interceptors';
import { type Db, InjectDb } from '../infra/prisma';
import { hashPassword } from '../auth/auth.service';
import { DocumentsService } from '../documents/documents.service';
import { OutboxService } from '../queue/outbox.service';

type Kind = 'vehicle' | 'trailer' | 'driver';

@Injectable()
export class FleetService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly documents: DocumentsService,
    private readonly outbox: OutboxService,
  ) {}

  private carrierCompany(actor: AuthActor) {
    return requireActiveCompany(actor, { kind: 'CARRIER', permission: 'fleet:write' });
  }

  private assertCanRead(actor: AuthActor, companyId: string) {
    if (!actor.isStaff && !isMemberOf(actor, companyId)) throw forbidden();
  }

  private async assertPlateFree(plate: string) {
    const p = normalizePlate(plate);
    const [v, t] = await Promise.all([
      this.db.vehicle.findFirst({ where: { plateNormalized: p, deletedAt: undefined } }),
      this.db.trailer.findFirst({ where: { plateNormalized: p, deletedAt: undefined } }),
    ]);
    if (v || t) throw conflict('PLATE_EXISTS', 'Bu plaka zaten kayıtlı');
    return p;
  }

  // ── Araç ─────────────────────────────────────────────────────────────
  async listVehicles(actor: AuthActor) {
    const m = requireActiveCompany(actor, { kind: 'CARRIER' });
    return this.db.vehicle.findMany({
      where: { carrierCompanyId: m.companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createVehicle(actor: AuthActor, input: z.infer<typeof createVehicleSchema>) {
    const m = this.carrierCompany(actor);
    const plateNormalized = await this.assertPlateFree(input.plate);
    return this.db.vehicle.create({
      data: {
        ...input,
        euroNorm: input.euroNorm ?? null,
        plateNormalized,
        carrierCompanyId: m.companyId,
      },
    });
  }

  async getVehicle(actor: AuthActor, id: string) {
    const v = await this.db.vehicle.findUnique({ where: { id } });
    if (!v) throw notFound('Vehicle', id);
    this.assertCanRead(actor, v.carrierCompanyId);
    return v;
  }

  async updateVehicle(actor: AuthActor, id: string, patch: z.infer<typeof updateVehicleSchema>) {
    const v = await this.getVehicle(actor, id);
    assertCompanyPermission(actor, v.carrierCompanyId, 'fleet:write');
    const updated = await this.db.vehicle.update({ where: { id }, data: patch });
    if (patch.status && patch.status !== 'ACTIVE') await this.recomputePostings('vehicle', id);
    return updated;
  }

  // ── Dorse ────────────────────────────────────────────────────────────
  async listTrailers(actor: AuthActor) {
    const m = requireActiveCompany(actor, { kind: 'CARRIER' });
    return this.db.trailer.findMany({
      where: { carrierCompanyId: m.companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTrailer(actor: AuthActor, input: z.infer<typeof createTrailerSchema>) {
    const m = this.carrierCompany(actor);
    const plateNormalized = await this.assertPlateFree(input.plate);
    return this.db.trailer.create({
      data: {
        ...input,
        minTempC: input.minTempC ?? null,
        maxTempC: input.maxTempC ?? null,
        plateNormalized,
        carrierCompanyId: m.companyId,
      },
    });
  }

  async getTrailer(actor: AuthActor, id: string) {
    const t = await this.db.trailer.findUnique({ where: { id } });
    if (!t) throw notFound('Trailer', id);
    this.assertCanRead(actor, t.carrierCompanyId);
    return t;
  }

  async updateTrailer(actor: AuthActor, id: string, patch: z.infer<typeof updateTrailerSchema>) {
    const t = await this.getTrailer(actor, id);
    assertCompanyPermission(actor, t.carrierCompanyId, 'fleet:write');
    const updated = await this.db.trailer.update({ where: { id }, data: patch });
    await this.recomputePostings('trailer', id);
    return updated;
  }

  // ── Şoför ────────────────────────────────────────────────────────────
  async listDrivers(actor: AuthActor) {
    const m = requireActiveCompany(actor, { kind: 'CARRIER' });
    return this.db.driver.findMany({
      where: { carrierCompanyId: m.companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDriver(actor: AuthActor, input: z.infer<typeof createDriverSchema>) {
    const m = this.carrierCompany(actor);
    const { userEmail, homeBase, ...rest } = input;
    let userId: string | null = null;
    if (userEmail) {
      const existing = await this.db.user.findUnique({ where: { email: userEmail } });
      if (existing) {
        const hasDriver = await this.db.driver.findUnique({ where: { userId: existing.id } });
        if (hasDriver)
          throw conflict('DRIVER_EXISTS', 'Bu kullanıcı zaten bir şoför profiline bağlı');
        userId = existing.id;
      } else {
        const u = await this.db.user.create({
          data: {
            email: userEmail,
            fullName: input.fullName,
            phone: input.phone ?? null,
            role: 'DRIVER',
            status: 'ACTIVE',
            passwordHash: await hashPassword(randomBytes(24).toString('base64url')),
          },
        });
        userId = u.id;
      }
    }
    return this.db.driver.create({
      data: {
        ...rest,
        phone: rest.phone ?? null,
        passportNumber: rest.passportNumber ?? null,
        passportValidUntil: rest.passportValidUntil ?? null,
        homeBaseLat: homeBase?.lat ?? null,
        homeBaseLng: homeBase?.lng ?? null,
        carrierCompanyId: m.companyId,
        userId,
      },
    });
  }

  async getDriver(actor: AuthActor, id: string) {
    const d = await this.db.driver.findUnique({ where: { id } });
    if (!d) throw notFound('Driver', id);
    if (!(actor.isStaff || isMemberOf(actor, d.carrierCompanyId) || d.userId === actor.userId))
      throw forbidden();
    return d;
  }

  async updateDriver(actor: AuthActor, id: string, patch: z.infer<typeof updateDriverSchema>) {
    const d = await this.getDriver(actor, id);
    assertCompanyPermission(actor, d.carrierCompanyId, 'fleet:write');
    const { homeBase, ...rest } = patch;
    const updated = await this.db.driver.update({
      where: { id },
      data: {
        ...rest,
        ...(homeBase ? { homeBaseLat: homeBase.lat, homeBaseLng: homeBase.lng } : {}),
      },
    });
    await this.recomputePostings('driver', id);
    return updated;
  }

  // ── Ortak ────────────────────────────────────────────────────────────
  /** Soft delete (#18); aktif ilanda veya sevkiyatta kullanılıyorsa silinemez. */
  async remove(actor: AuthActor, kind: Kind, id: string) {
    const entity =
      kind === 'vehicle'
        ? await this.getVehicle(actor, id)
        : kind === 'trailer'
          ? await this.getTrailer(actor, id)
          : await this.getDriver(actor, id);
    assertCompanyPermission(actor, entity.carrierCompanyId, 'fleet:write');
    const key = `${kind}Id` as const;
    const inUse =
      (await this.db.truckPosting.count({
        where: { [key]: id, status: { in: ['DRAFT', 'ACTIVE', 'RESERVED'] } },
      })) +
      (await this.db.shipment.count({
        where: {
          [key]: id,
          status: { in: ['ASSIGNED', 'AT_PICKUP', 'LOADED', 'IN_TRANSIT', 'AT_DELIVERY'] },
        },
      }));
    if (inUse > 0) throw conflict('ASSET_IN_USE', 'Aktif ilan veya sevkiyatta kullanılıyor');
    const now = new Date();
    if (kind === 'vehicle')
      await this.db.vehicle.update({ where: { id }, data: { deletedAt: now, status: 'INACTIVE' } });
    if (kind === 'trailer')
      await this.db.trailer.update({ where: { id }, data: { deletedAt: now, status: 'INACTIVE' } });
    if (kind === 'driver')
      await this.db.driver.update({ where: { id }, data: { deletedAt: now, status: 'INACTIVE' } });
    await audit(this.db, actor, `${kind}.delete`, kind, id);
  }

  private async recomputePostings(kind: Kind, id: string) {
    const postings = await this.db.truckPosting.findMany({
      where: { [`${kind}Id`]: id, status: 'ACTIVE' },
    });
    for (const p of postings)
      await this.outbox.emitNow('match.recompute', { entity: 'posting', id: p.id });
  }

  /** Filo belge süresi uyarı şeridi için: 30 gün içinde dolacak / dolmuş belgeler. */
  async expiringDocuments(actor: AuthActor) {
    const m = requireActiveCompany(actor, { kind: 'CARRIER' });
    const soon = new Date(Date.now() + 30 * 86_400_000);
    const docs = await this.db.document.findMany({
      where: {
        companyId: m.companyId,
        ownerType: { in: ['COMPANY', 'VEHICLE', 'TRAILER', 'DRIVER'] },
        OR: [{ status: 'EXPIRED' }, { status: 'APPROVED', expiresAt: { lte: soon } }],
      },
      orderBy: { expiresAt: 'asc' },
    });
    return docs.map((d) => this.documents.withUrl(d));
  }
}
