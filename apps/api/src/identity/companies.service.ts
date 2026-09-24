import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateCompanyInput, RiskFlagType } from '@logimatch/shared';
import { findCity } from '@logimatch/shared';
import type { z } from 'zod';
import type { addMemberSchema, updateCompanySchema } from '@logimatch/shared';
import { type AuthActor, assertCompanyPermission, isMemberOf } from '../common/actor';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { audit } from '../common/interceptors';
import { maskCompany } from '../common/masking';
import { type Db, type DbOrTx, InjectDb, Prisma } from '../infra/prisma';
import { type ITaxIdVerifier, TAX_ID } from '../integrations/ports';
import { hashPassword } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(TAX_ID) private readonly taxVerifier: ITaxIdVerifier,
    private readonly notifications: NotificationsService,
  ) {}

  async create(actor: AuthActor, input: CreateCompanyInput) {
    if (actor.memberships.some((m) => m.companyRole === 'OWNER') && !actor.isStaff) {
      throw conflict('ALREADY_OWNER', 'Zaten bir firmanın sahibisiniz');
    }
    const city = findCity(input.city);
    const company = await this.db.$transaction(async (tx) => {
      const c = await tx.company.create({
        data: {
          ...input,
          tradeName: input.tradeName ?? null,
          mersisNo: input.mersisNo ?? null,
          district: input.district ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          iban: input.iban ?? null,
          homeLat: city?.lat ?? null,
          homeLng: city?.lng ?? null,
          members: {
            create: { userId: actor.userId, companyRole: 'OWNER', acceptedAt: new Date() },
          },
          stats: { create: {} },
        },
      });
      await this.detectDuplicates(tx, c);
      return c;
    });
    await audit(this.db, actor, 'company.create', 'Company', company.id, undefined, company);
    return company;
  }

  /** Aynı VKN / telefon / IBAN ile başka firma → admin bayrağı (#15). Engellemez. */
  async detectDuplicates(
    tx: DbOrTx,
    c: { id: string; taxNumber: string; phone: string | null; iban: string | null },
  ): Promise<void> {
    const checks: [RiskFlagType, Prisma.CompanyWhereInput | null][] = [
      ['DUPLICATE_TAX_NUMBER', { taxNumber: c.taxNumber }],
      ['DUPLICATE_PHONE', c.phone ? { phone: c.phone } : null],
      ['DUPLICATE_IBAN', c.iban ? { iban: c.iban } : null],
    ];
    for (const [type, where] of checks) {
      if (!where) continue;
      const others = await tx.company.findMany({
        where: { ...where, id: { not: c.id } },
        select: { id: true },
      });
      if (others.length > 0) {
        await tx.riskFlag.create({
          data: {
            type,
            entityType: 'Company',
            entityId: c.id,
            companyId: c.id,
            details: { otherCompanyIds: others.map((o) => o.id) },
          },
        });
      }
    }
  }

  async get(actor: AuthActor, id: string) {
    const c = await this.db.company.findUnique({ where: { id }, include: { stats: true } });
    if (!c) throw notFound('Company', id);
    if (actor.isStaff || isMemberOf(actor, id) || (await this.hasDealWith(actor, id))) return c;
    return maskCompany(c, c.type === 'SHIPPER' ? 'SHIPPER' : 'CARRIER');
  }

  /** Aralarında sevkiyat varsa iletişim açıktır. */
  async hasDealWith(actor: AuthActor, companyId: string): Promise<boolean> {
    const mine = actor.memberships.map((m) => m.companyId);
    if (mine.length === 0) return false;
    const n = await this.db.shipment.count({
      where: {
        OR: [
          { shipperCompanyId: { in: mine }, carrierCompanyId: companyId },
          { carrierCompanyId: { in: mine }, shipperCompanyId: companyId },
        ],
      },
    });
    return n > 0;
  }

  async update(actor: AuthActor, id: string, patch: z.infer<typeof updateCompanySchema>) {
    assertCompanyPermission(actor, id, 'company:manage');
    const before = await this.db.company.findUnique({ where: { id } });
    if (!before) throw notFound('Company', id);
    const city = patch.city ? findCity(patch.city) : null;
    const updated = await this.db.$transaction(async (tx) => {
      const c = await tx.company.update({
        where: { id },
        data: { ...patch, ...(city ? { homeLat: city.lat, homeLng: city.lng } : {}) },
      });
      if (patch.phone || patch.iban) await this.detectDuplicates(tx, c);
      return c;
    });
    await audit(this.db, actor, 'company.update', 'Company', id, before, updated);
    return updated;
  }

  async members(actor: AuthActor, id: string) {
    assertCompanyPermission(actor, id, 'member:read');
    return this.db.companyMember.findMany({
      where: { companyId: id },
      include: {
        user: { select: { id: true, email: true, fullName: true, phone: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Üye ekler; kullanıcı yoksa geçici şifreli hesap açar (şifre sıfırlama ile girer). */
  async addMember(actor: AuthActor, id: string, input: z.infer<typeof addMemberSchema>) {
    assertCompanyPermission(actor, id, 'company:manage');
    const company = await this.db.company.findUnique({ where: { id } });
    if (!company) throw notFound('Company', id);
    let user = await this.db.user.findUnique({ where: { email: input.email } });
    if (!user) {
      user = await this.db.user.create({
        data: {
          email: input.email,
          fullName: input.fullName ?? null,
          role: company.type === 'SHIPPER' ? 'SHIPPER_USER' : 'CARRIER_USER',
          passwordHash: await hashPassword(randomBytes(24).toString('base64url')),
          status: 'ACTIVE',
        },
      });
    }
    const exists = await this.db.companyMember.findUnique({
      where: { userId_companyId: { userId: user.id, companyId: id } },
    });
    if (exists) throw conflict('ALREADY_MEMBER', 'Kullanıcı zaten üye');
    const member = await this.db.companyMember.create({
      data: {
        userId: user.id,
        companyId: id,
        companyRole: input.companyRole,
        invitedById: actor.userId,
        acceptedAt: new Date(),
      },
    });
    await audit(this.db, actor, 'company.member.add', 'Company', id, undefined, member);
    return member;
  }

  async removeMember(actor: AuthActor, id: string, userId: string) {
    assertCompanyPermission(actor, id, 'company:manage');
    const m = await this.db.companyMember.findUnique({
      where: { userId_companyId: { userId, companyId: id } },
    });
    if (!m) throw notFound('Member', userId);
    if (m.companyRole === 'OWNER') {
      const owners = await this.db.companyMember.count({
        where: { companyId: id, companyRole: 'OWNER' },
      });
      if (owners <= 1) throw unprocessable('LAST_OWNER', 'Son firma sahibi çıkarılamaz');
    }
    await this.db.companyMember.delete({ where: { id: m.id } });
    await audit(this.db, actor, 'company.member.remove', 'Company', id, m, undefined);
  }

  /** ITaxIdVerifier (mock) ile VKN sorgusu; sonuç audit'e yazılır. */
  async verifyTax(actor: AuthActor, id: string) {
    assertCompanyPermission(actor, id, 'company:manage');
    const c = await this.db.company.findUnique({ where: { id } });
    if (!c) throw notFound('Company', id);
    const result = await this.taxVerifier.verify(c.taxNumber, c.taxOffice);
    await audit(this.db, actor, 'company.verify-tax', 'Company', id, undefined, result);
    if (!result.valid)
      throw unprocessable('TAX_ID_INVALID', 'Vergi numarası doğrulanamadı', {
        reason: result.reason,
      });
    if (c.verificationStatus === 'UNVERIFIED') {
      await this.db.company.update({ where: { id }, data: { verificationStatus: 'PENDING' } });
    }
    return result;
  }

  async block(actor: AuthActor, targetId: string, reason?: string) {
    const m = actor.activeCompanyId;
    if (!m) throw forbidden('COMPANY_REQUIRED', 'Firma gerekli');
    if (m === targetId) throw badRequest('CANNOT_BLOCK_SELF', 'Kendi firmanızı engelleyemezsiniz');
    assertCompanyPermission(actor, m, 'listing:write');
    const target = await this.db.company.findUnique({ where: { id: targetId } });
    if (!target) throw notFound('Company', targetId);
    return this.db.blockList.upsert({
      where: {
        blockerCompanyId_blockedCompanyId: { blockerCompanyId: m, blockedCompanyId: targetId },
      },
      create: { blockerCompanyId: m, blockedCompanyId: targetId, reason: reason ?? null },
      update: { reason: reason ?? null },
    });
  }

  async unblock(actor: AuthActor, targetId: string) {
    const m = actor.activeCompanyId;
    if (!m) throw forbidden('COMPANY_REQUIRED', 'Firma gerekli');
    await this.db.blockList.deleteMany({
      where: { blockerCompanyId: m, blockedCompanyId: targetId },
    });
  }

  async blockList(actor: AuthActor) {
    const m = actor.activeCompanyId;
    if (!m) return [];
    return this.db.blockList.findMany({
      where: { blockerCompanyId: m },
      orderBy: { createdAt: 'desc' },
    });
  }

  async notifyVerified(companyId: string) {
    await this.notifications.notifyCompany(null, companyId, 'COMPANY_VERIFIED', {});
  }
}
