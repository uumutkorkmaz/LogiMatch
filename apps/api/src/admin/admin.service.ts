import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  adminListQuerySchema,
  resolveRiskFlagSchema,
  setCompanyStatusSchema,
  setCompanyVerificationSchema,
} from '@logimatch/shared';
import type { AuthActor } from '../common/actor';
import { conflict, notFound } from '../common/errors';
import { audit } from '../common/interceptors';
import { mapPage, paginate } from '../common/pagination';
import { DocumentsService } from '../documents/documents.service';
import { CompaniesService } from '../identity/companies.service';
import { type Db, InjectDb, Prisma } from '../infra/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformConfigService } from '../platform/platform-config.service';
import { OutboxService } from '../queue/outbox.service';

type ListQuery = z.infer<typeof adminListQuerySchema>;

@Injectable()
export class AdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly documents: DocumentsService,
    private readonly companies: CompaniesService,
    private readonly notifications: NotificationsService,
    private readonly config: PlatformConfigService,
    private readonly outbox: OutboxService,
  ) {}

  // ── Doğrulama kuyruğu ─────────────────────────────────────────────────
  async pendingVerifications() {
    const [documents, companies] = await Promise.all([
      this.db.document.findMany({
        where: { status: 'PENDING', ownerType: { not: 'SHIPMENT' } },
        orderBy: { createdAt: 'asc' },
        include: { company: { select: { id: true, legalName: true, type: true } } },
        take: 200,
      }),
      this.db.company.findMany({
        where: { verificationStatus: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        include: {
          documents: {
            where: { ownerType: 'COMPANY' },
            select: { type: true, status: true, expiresAt: true },
          },
        },
        take: 200,
      }),
    ]);
    return { documents: documents.map((d) => this.documents.withUrl(d)), companies };
  }

  async setVerification(
    actor: AuthActor,
    id: string,
    input: z.infer<typeof setCompanyVerificationSchema>,
  ) {
    const before = await this.db.company.findUnique({ where: { id } });
    if (!before) throw notFound('Company', id);
    const updated = await this.db.company.update({
      where: { id },
      data: {
        verificationStatus: input.verificationStatus,
        verifiedAt: input.verificationStatus === 'VERIFIED' ? new Date() : null,
      },
    });
    await this.documents.recomputeOwner(this.db, 'COMPANY', id);
    await audit(this.db, actor, 'company.verification', 'Company', id, before, updated);
    if (input.verificationStatus === 'VERIFIED') await this.companies.notifyVerified(id);
    else
      await this.notifications.notifyCompany(null, id, 'COMPANY_STATUS', {
        status: input.verificationStatus,
        reason: input.reason,
      });
    return updated;
  }

  // ── Firmalar ──────────────────────────────────────────────────────────
  async listCompanies(q: ListQuery) {
    const where: Prisma.CompanyWhereInput = {
      ...(q.q
        ? {
            OR: [
              { legalName: { contains: q.q, mode: 'insensitive' } },
              { taxNumber: { contains: q.q } },
              { city: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(q.status ? { status: q.status as Prisma.EnumCompanyStatusFilter['equals'] } : {}),
      ...(q.type ? { type: q.type as Prisma.EnumCompanyTypeFilter['equals'] } : {}),
    };
    return paginate(q, (args) =>
      this.db.company.findMany({
        where,
        orderBy: { id: 'desc' },
        include: {
          stats: true,
          _count: { select: { members: true, riskFlags: true, vehicles: true } },
        },
        ...args,
      }),
    );
  }

  /** Askıya alma / incelemeye alma / aktifleştirme. Askıdaki firmanın ilanları duraklatılır. */
  async setCompanyStatus(
    actor: AuthActor,
    id: string,
    input: z.infer<typeof setCompanyStatusSchema>,
  ) {
    const before = await this.db.company.findUnique({ where: { id } });
    if (!before) throw notFound('Company', id);
    const updated = await this.db.$transaction(async (tx) => {
      const c = await tx.company.update({ where: { id }, data: { status: input.status } });
      if (input.status === 'ACTIVE') {
        const paused = await tx.truckPosting.findMany({
          where: { carrierCompanyId: id, status: 'ACTIVE', pausedAt: { not: null } },
        });
        await tx.truckPosting.updateMany({
          where: { carrierCompanyId: id, pausedAt: { not: null } },
          data: { pausedAt: null },
        });
        await tx.companyStats.updateMany({
          where: { companyId: id },
          data: { consecutiveNoShows: 0 },
        });
        for (const p of paused)
          await this.outbox.emit(tx, 'match.recompute', { entity: 'posting', id: p.id });
      } else {
        await tx.truckPosting.updateMany({
          where: { carrierCompanyId: id, status: 'ACTIVE' },
          data: { pausedAt: new Date() },
        });
      }
      return c;
    });
    await audit(this.db, actor, 'company.status', 'Company', id, before, {
      ...updated,
      reason: input.reason,
    });
    await this.notifications.notifyCompany(null, id, 'COMPANY_STATUS', {
      status: input.status,
      reason: input.reason,
    });
    return updated;
  }

  // ── Uyuşmazlıklar ────────────────────────────────────────────────────
  listDisputes(status?: string) {
    return this.db.dispute.findMany({
      where: status ? { status: status as 'OPEN' | 'RESOLVED' } : { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      include: {
        shipment: {
          include: {
            load: { select: { referenceNo: true, pickupCity: true, deliveryCity: true } },
            shipperCompany: { select: { id: true, legalName: true } },
            carrierCompany: { select: { id: true, legalName: true } },
          },
        },
      },
    });
  }

  // ── Moderasyon ve risk ───────────────────────────────────────────────
  moderationQueue() {
    return this.db.load.findMany({
      where: {
        moderationStatus: 'PENDING_REVIEW',
        status: { in: ['PUBLISHED', 'MATCHING', 'OFFERED'] },
      },
      orderBy: { publishedAt: 'asc' },
      include: {
        shipperCompany: {
          select: { id: true, legalName: true, createdAt: true, listingsReviewedCount: true },
        },
      },
    });
  }

  async riskFlags(q: ListQuery) {
    const page = await paginate(q, (args) =>
      this.db.riskFlag.findMany({
        where: {
          ...(q.status ? { status: q.status as 'OPEN' } : { status: 'OPEN' }),
          ...(q.type ? { type: q.type as Prisma.EnumRiskFlagTypeFilter['equals'] } : {}),
        },
        orderBy: { id: 'desc' },
        include: { company: { select: { id: true, legalName: true } } },
        ...args,
      }),
    );
    // İletişim sızıntısında orijinal mesaj ops'a gösterilir.
    const msgIds = page.items.filter((f) => f.entityType === 'Message').map((f) => f.entityId);
    const msgs = msgIds.length
      ? await this.db.message.findMany({ where: { id: { in: msgIds } } })
      : [];
    return mapPage(page, (f) => {
      const m = msgs.find((x) => x.id === f.entityId);
      // bodyOriginal serileştiricide gizlidir; ops'a ayrı alanla gösterilir.
      return { ...f, message: m ? { body: m.body, originalBody: m.bodyOriginal } : null };
    });
  }

  async resolveRiskFlag(
    actor: AuthActor,
    id: string,
    input: z.infer<typeof resolveRiskFlagSchema>,
  ) {
    const f = await this.db.riskFlag.findUnique({ where: { id } });
    if (!f) throw notFound('RiskFlag', id);
    if (f.status !== 'OPEN') throw conflict('ALREADY_RESOLVED', 'Bayrak zaten kapatılmış');
    const updated = await this.db.riskFlag.update({
      where: { id },
      data: {
        status: input.status,
        resolution: input.resolution,
        resolvedById: actor.userId,
        resolvedAt: new Date(),
      },
    });
    await audit(this.db, actor, 'risk.resolve', 'RiskFlag', id, f, updated);
    return updated;
  }

  // ── Konfigürasyon (versiyonlu; yeni satır = yeni sürüm) ────────────────
  async currentConfig() {
    const [pricing, matching, cancellation, rates, rules, countries] = await Promise.all([
      this.db.pricingConfig.findFirst({
        where: { effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.db.matchingConfig.findFirst({
        where: { effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.db.cancellationPolicy.findFirst({
        where: { effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.db.exchangeRate.findMany({ orderBy: { effectiveAt: 'desc' }, take: 12 }),
      this.db.requiredDocumentRule.findMany({
        where: { active: true },
        orderBy: [{ ownerType: 'asc' }, { scope: 'asc' }],
      }),
      this.db.countryRule.findMany({ orderBy: { countryCode: 'asc' } }),
    ]);
    return {
      pricing,
      matching,
      cancellation,
      exchangeRates: rates,
      requiredDocuments: rules,
      countries,
    };
  }

  async newPricingVersion(actor: AuthActor, patch: Record<string, unknown>) {
    const cur = await this.db.pricingConfig.findFirstOrThrow({
      orderBy: { effectiveFrom: 'desc' },
    });
    const { id: _id, createdAt: _c, effectiveFrom: _e, createdById: _b, ...base } = cur;
    const created = await this.db.pricingConfig.create({
      data: {
        ...base,
        ratePerKmBands: base.ratePerKmBands as Prisma.InputJsonValue,
        multipliers: base.multipliers as Prisma.InputJsonValue,
        ...(patch as Partial<Prisma.PricingConfigCreateInput>),
        effectiveFrom: new Date(),
        createdById: actor.userId,
      },
    });
    this.config.invalidate();
    await audit(this.db, actor, 'config.pricing', 'PricingConfig', created.id, cur, created);
    return created;
  }

  async newMatchingVersion(actor: AuthActor, patch: Record<string, unknown>) {
    const cur = await this.db.matchingConfig.findFirstOrThrow({
      orderBy: { effectiveFrom: 'desc' },
    });
    const { id: _id, createdAt: _c, effectiveFrom: _e, createdById: _b, ...base } = cur;
    const next = { ...base, ...(patch as Partial<typeof base>) };
    const sum =
      next.wProximity +
      next.wRouteFit +
      next.wPriceFit +
      next.wReliability +
      next.wTimeFit +
      next.wEquipmentFit +
      next.wHistory;
    if (Math.abs(sum - 1) > 1e-6)
      throw conflict('WEIGHTS_INVALID', `Ağırlıkların toplamı 1 olmalı (şu an ${sum})`);
    const created = await this.db.matchingConfig.create({
      data: {
        ...next,
        params: next.params as Prisma.InputJsonValue,
        effectiveFrom: new Date(),
        createdById: actor.userId,
      },
    });
    this.config.invalidate();
    await audit(this.db, actor, 'config.matching', 'MatchingConfig', created.id, cur, created);
    return created;
  }

  async addExchangeRate(
    actor: AuthActor,
    base: 'EUR' | 'USD' | 'TRY',
    quote: 'EUR' | 'USD' | 'TRY',
    rate: string,
  ) {
    const created = await this.db.exchangeRate.create({
      data: { base, quote, rate, source: 'admin', effectiveAt: new Date() },
    });
    this.config.invalidate();
    await audit(this.db, actor, 'config.fx', 'ExchangeRate', created.id, undefined, created);
    return created;
  }

  // ── Metrikler ────────────────────────────────────────────────────────
  /** GMV, take rate, eşleşme/doluluk oranı, ortalama teklif turu, iptal oranı, huni. */
  async metrics(from?: Date, to?: Date) {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 90 * 86_400_000);
    const [money] = await this.db.$queryRaw<
      {
        gmv: string | null;
        revenue: string | null;
        shipments: number;
        cancelled: number;
        completed: number;
      }[]
    >`
      SELECT
        SUM(CASE WHEN status <> 'CANCELLED' THEN "agreedAmount" * "lockedFxRate" END)::numeric(18,2)::text AS gmv,
        SUM(CASE WHEN status <> 'CANCELLED' THEN "commissionAmount" * "lockedFxRate" END)::numeric(18,2)::text AS revenue,
        COUNT(*)::int AS shipments,
        COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed
      FROM "Shipment" WHERE "createdAt" >= ${start} AND "createdAt" < ${end}`;
    const [funnel] = await this.db.$queryRaw<
      {
        published: number;
        matched: number;
        mutual: number;
        offered: number;
        assigned: number;
        completed: number;
      }[]
    >`
      SELECT
        COUNT(*)::int AS published,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Match" m WHERE m."loadId" = l.id))::int AS matched,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Match" m WHERE m."loadId" = l.id AND (m.status = 'MUTUAL' OR m."shipperInterestAt" IS NOT NULL AND m."carrierInterestAt" IS NOT NULL)))::int AS mutual,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Offer" o WHERE o."loadId" = l.id))::int AS offered,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Shipment" s WHERE s."loadId" = l.id))::int AS assigned,
        COUNT(*) FILTER (WHERE l.status = 'COMPLETED')::int AS completed
      FROM "Load" l WHERE l."publishedAt" >= ${start} AND l."publishedAt" < ${end}`;
    const [rounds] = await this.db.$queryRaw<{ avg: number | null }[]>`
      SELECT AVG(round)::float AS avg FROM "Offer" WHERE status = 'ACCEPTED' AND "createdAt" >= ${start} AND "createdAt" < ${end}`;
    const daily = await this.db.$queryRaw<{ day: Date; gmv: string; shipments: number }[]>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Europe/Istanbul') AS day,
        SUM("agreedAmount" * "lockedFxRate")::numeric(18,2)::text AS gmv, COUNT(*)::int AS shipments
      FROM "Shipment" WHERE status <> 'CANCELLED' AND "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1 ORDER BY 1`;
    const [live] = await this.db.$queryRaw<
      {
        openLoads: number;
        activePostings: number;
        activeShipments: number;
        pendingDocs: number;
        openDisputes: number;
        openFlags: number;
      }[]
    >`
      SELECT
        (SELECT COUNT(*) FROM "Load" WHERE status IN ('PUBLISHED','MATCHING','OFFERED') AND "deletedAt" IS NULL)::int AS "openLoads",
        (SELECT COUNT(*) FROM "TruckPosting" WHERE status = 'ACTIVE' AND "deletedAt" IS NULL)::int AS "activePostings",
        (SELECT COUNT(*) FROM "Shipment" WHERE status IN ('ASSIGNED','AT_PICKUP','LOADED','IN_TRANSIT','AT_DELIVERY','DELIVERED','POD_SUBMITTED'))::int AS "activeShipments",
        (SELECT COUNT(*) FROM "Document" WHERE status = 'PENDING' AND "ownerType" <> 'SHIPMENT')::int AS "pendingDocs",
        (SELECT COUNT(*) FROM "Dispute" WHERE status = 'OPEN')::int AS "openDisputes",
        (SELECT COUNT(*) FROM "RiskFlag" WHERE status = 'OPEN')::int AS "openFlags"`;

    const gmv = Number(money?.gmv ?? 0);
    const revenue = Number(money?.revenue ?? 0);
    const published = funnel?.published ?? 0;
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
    return {
      period: { from: start.toISOString(), to: end.toISOString() },
      currency: 'TRY',
      gmv: money?.gmv ?? '0.00',
      commissionRevenue: money?.revenue ?? '0.00',
      takeRatePct: gmv > 0 ? Math.round((revenue / gmv) * 10000) / 100 : null,
      matchRatePct: pct(funnel?.matched ?? 0, published),
      fillRatePct: pct(funnel?.assigned ?? 0, published),
      avgOfferRounds: rounds?.avg != null ? Math.round(rounds.avg * 100) / 100 : null,
      cancellationRatePct: pct(money?.cancelled ?? 0, money?.shipments ?? 0),
      shipments: {
        total: money?.shipments ?? 0,
        completed: money?.completed ?? 0,
        cancelled: money?.cancelled ?? 0,
      },
      funnel,
      daily: daily.map((d) => ({
        day: d.day.toISOString().slice(0, 10),
        gmv: d.gmv,
        shipments: d.shipments,
      })),
      live,
    };
  }

  auditLogs(q: ListQuery) {
    return paginate(q, (args) =>
      this.db.auditLog.findMany({
        where: q.q ? { OR: [{ action: { contains: q.q } }, { entityId: q.q }] } : {},
        orderBy: { id: 'desc' },
        ...args,
      }),
    );
  }
}
