import { Injectable } from '@nestjs/common';
import type { RatingInput } from '@logimatch/shared';
import { type AuthActor, isMemberOf } from '../common/actor';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { type Db, InjectDb } from '../infra/prisma';

const WINDOW_DAYS = 14;
const DAY = 86_400_000;

/** Çift kör: iki taraf da gönderene veya 14 gün dolana kadar karşı taraf göremez. */
export function isRatingVisible(
  r: { visibleAt: Date | null; createdAt: Date },
  now = new Date(),
): boolean {
  return (
    (r.visibleAt != null && r.visibleAt <= now) ||
    now.getTime() - r.createdAt.getTime() >= WINDOW_DAYS * DAY
  );
}

@Injectable()
export class RatingsService {
  constructor(@InjectDb() private readonly db: Db) {}

  async rate(actor: AuthActor, shipmentId: string, input: RatingInput) {
    const s = await this.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s) throw notFound('Shipment', shipmentId);
    const side = isMemberOf(actor, s.shipperCompanyId)
      ? 'SHIPPER'
      : isMemberOf(actor, s.carrierCompanyId)
        ? 'CARRIER'
        : null;
    if (!side) throw forbidden('NOT_A_PARTY', 'Bu sevkiyatın tarafı değilsiniz');
    if (s.status !== 'COMPLETED' || !s.completedAt) {
      throw unprocessable(
        'SHIPMENT_NOT_COMPLETED',
        'Yalnızca tamamlanan sevkiyatlar değerlendirilebilir',
      );
    }
    if (Date.now() - s.completedAt.getTime() > WINDOW_DAYS * DAY) {
      throw unprocessable(
        'RATING_WINDOW_CLOSED',
        `Değerlendirme süresi (${WINDOW_DAYS} gün) doldu`,
      );
    }
    if (side === 'CARRIER' && input.cargoCare !== undefined) {
      throw unprocessable('INVALID_DIMENSION', 'Taşıyıcı, yük özeni boyutunu puanlayamaz');
    }
    const raterCompanyId = side === 'SHIPPER' ? s.shipperCompanyId : s.carrierCompanyId;
    const ratedCompanyId = side === 'SHIPPER' ? s.carrierCompanyId : s.shipperCompanyId;

    return this.db.$transaction(async (tx) => {
      const exists = await tx.rating.findUnique({
        where: { shipmentId_raterCompanyId: { shipmentId, raterCompanyId } },
      });
      if (exists) throw conflict('ALREADY_RATED', 'Bu sevkiyatı zaten değerlendirdiniz');
      const other = await tx.rating.findFirst({
        where: { shipmentId, raterCompanyId: ratedCompanyId },
      });
      const now = new Date();
      const rating = await tx.rating.create({
        data: {
          shipmentId,
          raterCompanyId,
          ratedCompanyId,
          raterSide: side,
          raterUserId: actor.userId,
          stars: input.stars,
          punctuality: input.punctuality ?? null,
          communication: input.communication ?? null,
          cargoCare: input.cargoCare ?? null,
          documentation: input.documentation ?? null,
          priceHonesty: input.priceHonesty ?? null,
          comment: input.comment ?? null,
          visibleAt: other ? now : null,
        },
      });
      if (other) await tx.rating.update({ where: { id: other.id }, data: { visibleAt: now } });

      await tx.companyStats.upsert({
        where: { companyId: ratedCompanyId },
        create: { companyId: ratedCompanyId, ratingCount: 1, ratingSum: input.stars },
        update: { ratingCount: { increment: 1 }, ratingSum: { increment: input.stars } },
      });
      // Shipper'ın ≥4 puanı ve uyuşmazlıksız sevkiyat → iki firma "sorunsuz çalıştı" (historyScore).
      if (side === 'SHIPPER' && input.stars >= 4) {
        const disputes = await tx.dispute.count({ where: { shipmentId } });
        if (disputes === 0) {
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
              goodCount: 1,
            },
            update: { goodCount: { increment: 1 } },
          });
        }
      }
      return rating;
    });
  }

  async forShipment(actor: AuthActor, shipmentId: string) {
    const s = await this.db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s) throw notFound('Shipment', shipmentId);
    const mine = actor.memberships.map((m) => m.companyId);
    const ratings = await this.db.rating.findMany({ where: { shipmentId } });
    return ratings.filter(
      (r) => actor.isStaff || mine.includes(r.raterCompanyId) || isRatingVisible(r),
    );
  }

  /** Firmanın görünür değerlendirmeleri + boyut ortalamaları. */
  async forCompany(companyId: string) {
    const all = await this.db.rating.findMany({
      where: { ratedCompanyId: companyId },
      orderBy: { createdAt: 'desc' },
    });
    const visible = all.filter((r) => isRatingVisible(r));
    const avg = (
      k: 'stars' | 'punctuality' | 'communication' | 'cargoCare' | 'documentation' | 'priceHonesty',
    ) => {
      const vals = visible.map((r) => r[k]).filter((v): v is number => v != null);
      return vals.length
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
        : null;
    };
    return {
      count: visible.length,
      averages: {
        stars: avg('stars'),
        punctuality: avg('punctuality'),
        communication: avg('communication'),
        cargoCare: avg('cargoCare'),
        documentation: avg('documentation'),
        priceHonesty: avg('priceHonesty'),
      },
      // Yorumlar anonim: değerlendiren firma kimliği gösterilmez.
      items: visible.slice(0, 50).map((r) => ({
        id: r.id,
        raterSide: r.raterSide,
        stars: r.stars,
        punctuality: r.punctuality,
        communication: r.communication,
        cargoCare: r.cargoCare,
        documentation: r.documentation,
        priceHonesty: r.priceHonesty,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
    };
  }
}
