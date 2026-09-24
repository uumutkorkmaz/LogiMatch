import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { updateMeSchema } from '@logimatch/shared';
import type { AuthActor } from '../common/actor';
import { conflict, unprocessable } from '../common/errors';
import { audit } from '../common/interceptors';
import { type Db, InjectDb } from '../infra/prisma';
import { hashPassword } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';

@Injectable()
export class MeService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly tokens: TokenService,
  ) {}

  async get(actor: AuthActor) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      include: {
        memberships: { include: { company: true } },
        driver: { select: { id: true, carrierCompanyId: true, fullName: true } },
      },
    });
    return { ...user, activeCompanyId: actor.activeCompanyId };
  }

  async update(actor: AuthActor, patch: z.infer<typeof updateMeSchema>) {
    if (patch.phone) {
      const taken = await this.db.user.findFirst({
        where: { phone: patch.phone, id: { not: actor.userId } },
      });
      if (taken) throw conflict('PHONE_TAKEN', 'Bu telefon başka bir hesapta kayıtlı');
    }
    const before = await this.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const updated = await this.db.user.update({
      where: { id: actor.userId },
      data: {
        ...patch,
        ...(patch.phone && patch.phone !== before.phone ? { phoneVerifiedAt: null } : {}),
      },
    });
    await audit(this.db, actor, 'me.update', 'User', actor.userId, before, updated);
    return updated;
  }

  /** KVKK md. 11 — kişisel veri ihracı (#19). */
  async export(actor: AuthActor) {
    const id = actor.userId;
    const [user, memberships, messages, notifications, auditLogs, ratings, driver] =
      await Promise.all([
        this.db.user.findUniqueOrThrow({ where: { id } }),
        this.db.companyMember.findMany({ where: { userId: id }, include: { company: true } }),
        this.db.message.findMany({ where: { senderUserId: id }, orderBy: { createdAt: 'asc' } }),
        this.db.notification.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } }),
        this.db.auditLog.findMany({
          where: { actorUserId: id },
          orderBy: { createdAt: 'asc' },
          take: 5000,
        }),
        this.db.rating.findMany({ where: { raterUserId: id } }),
        this.db.driver.findUnique({ where: { userId: id } }),
      ]);
    await audit(this.db, actor, 'kvkk.export', 'User', id);
    return {
      exportedAt: new Date().toISOString(),
      user,
      memberships,
      driverProfile: driver,
      messages,
      notifications,
      ratingsGiven: ratings,
      auditLogs,
    };
  }

  /**
   * KVKK anonimleştirme talebi. Mali kayıtlar (Shipment, Invoice, Offer) silinmez;
   * kullanıcıya bağlı kişisel alanlar boşaltılır, oturumlar kapatılır.
   */
  async anonymize(actor: AuthActor) {
    const owned = actor.memberships.filter((m) => m.companyRole === 'OWNER');
    for (const m of owned) {
      const owners = await this.db.companyMember.count({
        where: { companyId: m.companyId, companyRole: 'OWNER' },
      });
      if (owners <= 1) {
        throw unprocessable('LAST_OWNER', 'Firmanın tek sahibisiniz; önce sahipliği devredin');
      }
    }
    const id = actor.userId;
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          email: `anon-${id}@deleted.invalid`,
          phone: null,
          fullName: null,
          passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
          status: 'BANNED',
          anonymizedAt: new Date(),
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
        },
      });
      await tx.driver.updateMany({
        where: { userId: id },
        data: { fullName: 'Anonim Şoför', phone: null, passportNumber: null },
      });
      await tx.companyMember.deleteMany({ where: { userId: id } });
      await tx.otpChallenge.deleteMany({ where: { userId: id } });
    });
    await this.tokens.revokeAllForUser(id);
    await audit(this.db, actor, 'kvkk.anonymize', 'User', id);
  }
}
