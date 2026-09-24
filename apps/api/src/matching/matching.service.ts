import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { matchMachine, OPEN_MATCH_STATUSES, transition, type MatchStatus } from '@logimatch/shared';
import { type AuthActor, hasCompanyPermission, isMemberOf } from '../common/actor';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { maskCompany, maskPlate } from '../common/masking';
import { MetricsService } from '../health/metrics';
import { type Db, type DbOrTx, InjectDb, Prisma } from '../infra/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformConfigService } from '../platform/platform-config.service';
import { JobRegistry } from '../queue/job-registry';
import { OutboxService } from '../queue/outbox.service';
import { assertParams, compareScored, evaluatePair } from './domain/engine';
import type {
  HardFilterCode,
  MatchCandidate,
  MatchContext,
  MatchLoad,
  MatchingParams,
  ScoredMatch,
} from './domain/types';
import { CandidatesRepository } from './infra/candidates.repository';
import { syncOpenLoadStatus } from './load-status';

type Side = 'SHIPPER' | 'CARRIER';

const matchInclude = {
  load: { include: { shipperCompany: { include: { stats: true } } } },
  truckPosting: {
    include: {
      vehicle: true,
      trailer: true,
      driver: true,
      carrierCompany: { include: { stats: true } },
    },
  },
  offers: { orderBy: { createdAt: 'asc' } },
  shipment: { select: { id: true, referenceNo: true, status: true } },
  conversation: { select: { id: true } },
} satisfies Prisma.MatchInclude;
type MatchFull = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

const route = (m: { load: { pickupCity: string; deliveryCity: string } }) =>
  `${m.load.pickupCity} → ${m.load.deliveryCity}`;

@Injectable()
export class MatchingService implements OnModuleInit {
  private readonly logger = new Logger('Matching');

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly repo: CandidatesRepository,
    private readonly config: PlatformConfigService,
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationsService,
    private readonly registry: JobRegistry,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    const run = (p: { entity: 'load' | 'posting'; id: string }) =>
      p.entity === 'load'
        ? this.computeForLoad(p.id).then(() => undefined)
        : this.computeForPosting(p.id).then(() => undefined);
    this.registry.register('match.compute', run);
    this.registry.register('match.recompute', run);
  }

  private async context(): Promise<{ ctx: MatchContext; params: MatchingParams & { id: string } }> {
    const [params, visaGroups, fx] = await Promise.all([
      this.config.matching(),
      this.config.countryVisaGroups(),
      this.config.fxConverter(),
    ]);
    assertParams(params);
    return { ctx: { now: new Date(), visaGroups, fx }, params };
  }

  // ── Hesaplama ────────────────────────────────────────────────────────
  /**
   * Yük yayınlandı/değişti → uygun araçlar (DOMAIN §6, ARCHITECTURE §7.1).
   * İdempotent: aynı çift için unique (loadId, truckPostingId); ilgi durumları korunur.
   */
  async computeForLoad(
    loadId: string,
  ): Promise<{ created: number; updated: number; expired: number }> {
    const end = this.metrics.matchingDuration.startTimer({ direction: 'load' });
    const load = await this.repo.loadById(loadId);
    if (!load) return { created: 0, updated: 0, expired: 0 };
    const { ctx, params } = await this.context();

    const candidates =
      load.pickup.lat === 0 && load.pickup.lng === 0
        ? []
        : await this.repo.candidatesForLoad(load, params);
    this.metrics.matchingCandidates.observe(candidates.length);
    const scored = candidates
      .map((c) => evaluatePair(load, c, ctx, params).scored)
      .filter((s): s is ScoredMatch => !!s && s.score >= params.threshold)
      .sort(compareScored)
      .slice(0, params.topN);

    // Mevcut açık eşleşmeleri yeniden değerlendir (aday listesinde olmayanlar dahil).
    const existing = await this.db.match.findMany({
      where: { loadId, status: { in: [...OPEN_MATCH_STATUSES] } },
      select: { id: true, truckPostingId: true, status: true },
    });
    const seen = new Set(candidates.map((c) => c.posting.id));
    const missing = existing
      .filter((m) => !seen.has(m.truckPostingId))
      .map((m) => m.truckPostingId);
    const extra = await this.repo.candidatesByPostingIds(missing, load.shipperCompanyId);
    const evaluations = new Map(
      [...candidates, ...extra].map((c) => [c.posting.id, evaluatePair(load, c, ctx, params)]),
    );

    const res = await this.persist(scored, existing, evaluations, params.id, 'load', loadId);
    end();
    return res;
  }

  /** Araç ilanı yayınlandı/değişti → uygun yükler (simetrik akış). */
  async computeForPosting(
    postingId: string,
  ): Promise<{ created: number; updated: number; expired: number }> {
    const end = this.metrics.matchingDuration.startTimer({ direction: 'posting' });
    const cand = await this.repo.candidateByPostingId(postingId);
    if (!cand) return { created: 0, updated: 0, expired: 0 };
    const { ctx, params } = await this.context();

    const loads =
      cand.posting.status === 'ACTIVE' ? await this.repo.loadsNearPosting(cand, params) : [];
    const existing = await this.db.match.findMany({
      where: { truckPostingId: postingId, status: { in: [...OPEN_MATCH_STATUSES] } },
      select: { id: true, loadId: true, truckPostingId: true, status: true },
    });
    const seen = new Set(loads.map((l) => l.id));
    const extraLoads = await this.repo.loadsByIds(
      existing.filter((m) => !seen.has(m.loadId)).map((m) => m.loadId),
    );
    const allLoads = [...loads, ...extraLoads];
    const perShipper = await this.repo.withShipperContext(cand, [
      ...new Set(allLoads.map((l) => l.shipperCompanyId)),
    ]);

    const evaluate = (l: MatchLoad) =>
      evaluatePair(l, { ...cand, ...perShipper.get(l.shipperCompanyId)! }, ctx, params);
    const evals = new Map(allLoads.map((l) => [l.id, evaluate(l)]));
    const scored = loads
      .map((l) => evals.get(l.id)!.scored)
      .filter((s): s is ScoredMatch => !!s && s.score >= params.threshold)
      .sort(compareScored)
      .slice(0, params.topN);

    const res = await this.persist(
      scored,
      existing.map((e) => ({ ...e, truckPostingId: e.loadId })),
      evals,
      params.id,
      'posting',
      postingId,
    );
    end();
    return res;
  }

  /**
   * Upsert + artık uygun olmayan açık eşleşmeleri kapatma.
   * `existing[].truckPostingId` alanı karşı tarafın id'sidir (load yönünde posting, posting yönünde load).
   */
  private async persist(
    scored: ScoredMatch[],
    existing: { id: string; truckPostingId: string; status: MatchStatus }[],
    evaluations: Map<string, ReturnType<typeof evaluatePair>>,
    matchingConfigId: string,
    direction: 'load' | 'posting',
    subjectId: string,
  ) {
    let created = 0;
    let updated = 0;
    let expired = 0;
    const newMatches: { id: string; loadId: string; carrierCompanyId?: string; score: number }[] =
      [];
    const touchedLoads = new Set<string>();

    await this.db.$transaction(async (tx) => {
      for (const s of scored) {
        const row = await tx.match.findUnique({
          where: { loadId_truckPostingId: { loadId: s.loadId, truckPostingId: s.truckPostingId } },
        });
        const common = {
          score: s.score,
          scoreBreakdown: s.breakdown as unknown as Prisma.InputJsonValue,
          deadheadKm: s.deadheadKm,
          matchingConfigId,
        };
        if (!row) {
          const m = await tx.match.create({
            data: {
              ...common,
              loadId: s.loadId,
              truckPostingId: s.truckPostingId,
              direction: 'SYSTEM',
            },
          });
          newMatches.push({ id: m.id, loadId: s.loadId, score: s.score });
          created++;
        } else if (row.status === 'EXPIRED') {
          await tx.match.update({
            where: { id: row.id },
            data: { ...common, status: 'SUGGESTED', dismissReason: null },
          });
          newMatches.push({ id: row.id, loadId: s.loadId, score: s.score });
          updated++;
        } else if (row.status !== 'DISMISSED') {
          await tx.match.update({ where: { id: row.id }, data: common });
          updated++;
        }
        touchedLoads.add(s.loadId);
      }
      // Hard filtreyi artık geçemeyen açık eşleşmeler kapanır (MUTUAL korunur; kabulde tekrar doğrulanır).
      for (const e of existing) {
        const ev = evaluations.get(e.truckPostingId);
        const stillValid = ev?.pass && ev.scored && ev.scored.score >= 0;
        if (!stillValid && e.status !== 'MUTUAL') {
          await tx.match.update({
            where: { id: e.id },
            data: {
              status: 'EXPIRED',
              dismissReason: `NO_LONGER_ELIGIBLE:${(ev?.failures ?? ['MISSING']).join(',')}`,
            },
          });
          expired++;
        }
        if (direction === 'load') touchedLoads.add(subjectId);
        else touchedLoads.add(e.truckPostingId);
      }
      if (direction === 'load') touchedLoads.add(subjectId);
      for (const loadId of touchedLoads) await syncOpenLoadStatus(tx, loadId);
    });

    await this.notifyNew(newMatches, direction, subjectId);
    this.logger.debug({ direction, subjectId, created, updated, expired }, 'matching done');
    return { created, updated, expired };
  }

  private async notifyNew(
    items: { id: string; loadId: string; score: number }[],
    direction: 'load' | 'posting',
    subjectId: string,
  ) {
    if (items.length === 0) return;
    const matches = await this.db.match.findMany({
      where: { id: { in: items.map((i) => i.id) } },
      include: { load: true, truckPosting: true },
    });
    const byShipper = new Map<string, { referenceNo: string; count: number; loadId: string }>();
    for (const m of matches) {
      const k = m.load.shipperCompanyId;
      const cur = byShipper.get(`${k}:${m.loadId}`) ?? {
        referenceNo: m.load.referenceNo,
        count: 0,
        loadId: m.loadId,
      };
      cur.count++;
      byShipper.set(`${k}:${m.loadId}`, cur);
      await this.notifications.notifyCompany(
        null,
        m.truckPosting.carrierCompanyId,
        'MATCH_NEW_FOR_CARRIER',
        { matchId: m.id, route: route(m), score: Number(m.score) },
        { dedupKey: `match:${m.id}` },
      );
    }
    for (const [key, v] of byShipper) {
      await this.notifications.notifyCompany(
        null,
        key.split(':')[0]!,
        'MATCH_NEW_FOR_SHIPPER',
        { loadId: v.loadId, referenceNo: v.referenceNo, count: v.count },
        { dedupKey: `matches:${v.loadId}:${direction}:${subjectId}` },
      );
    }
  }

  /** Kabulden hemen önce çiftin hâlâ uygun olduğunu doğrular (MUTUAL korunmuştu). */
  async revalidate(
    loadId: string,
    postingId: string,
  ): Promise<{ pass: boolean; failures: HardFilterCode[] }> {
    const load = await this.repo.loadById(loadId);
    if (!load) return { pass: false, failures: ['STATUS'] };
    const [cand] = await this.repo.candidatesByPostingIds([postingId], load.shipperCompanyId);
    if (!cand) return { pass: false, failures: ['STATUS'] };
    const { ctx, params } = await this.context();
    // Kabul anında yük OFFERED durumunda olabilir; açık sayılır.
    const r = evaluatePair(load, cand, ctx, params);
    return { pass: r.pass, failures: r.failures };
  }

  // ── Taraf akışı ───────────────────────────────────────────────────────
  private sideOf(
    actor: AuthActor,
    m: { load: { shipperCompanyId: string }; truckPosting: { carrierCompanyId: string } },
  ): Side {
    if (isMemberOf(actor, m.load.shipperCompanyId)) return 'SHIPPER';
    if (isMemberOf(actor, m.truckPosting.carrierCompanyId)) return 'CARRIER';
    throw forbidden('NOT_A_PARTY', 'Bu eşleşmenin tarafı değilsiniz');
  }

  private async getFull(id: string): Promise<MatchFull> {
    const m = await this.db.match.findUnique({ where: { id }, include: matchInclude });
    if (!m) throw notFound('Match', id);
    return m;
  }

  /** Taraf bakış açısına göre maskeli görünüm. Sevkiyat varsa iletişim açıktır. */
  view(m: MatchFull, side: Side | 'STAFF') {
    const revealed = side === 'STAFF' || !!m.shipment;
    const { load, truckPosting: p, ...rest } = m;
    const loadView =
      revealed || side === 'SHIPPER'
        ? load
        : {
            ...load,
            pickupAddress: [load.pickupDistrict, load.pickupCity].filter(Boolean).join(', '),
            deliveryAddress: [load.deliveryDistrict, load.deliveryCity].filter(Boolean).join(', '),
            shipperCompany: maskCompany(load.shipperCompany, 'SHIPPER'),
          };
    const postingView =
      revealed || side === 'CARRIER'
        ? p
        : {
            ...p,
            originAddress: [p.originDistrict, p.originCity].filter(Boolean).join(', '),
            vehicle: { ...p.vehicle, plate: maskPlate(p.vehicle.plate), plateNormalized: null },
            trailer: { ...p.trailer, plate: maskPlate(p.trailer.plate), plateNormalized: null },
            driver: {
              id: p.driver.id,
              adrClasses: p.driver.adrClasses,
              srcTypes: p.driver.srcTypes,
              visaCountries: p.driver.visaCountries,
            },
            carrierCompany: maskCompany(p.carrierCompany, 'CARRIER'),
          };
    return {
      ...rest,
      viewerSide: side,
      contactRevealed: revealed,
      load: loadView,
      truckPosting: postingView,
    };
  }

  async get(actor: AuthActor, id: string) {
    const m = await this.getFull(id);
    if (
      actor.isStaff &&
      !isMemberOf(actor, m.load.shipperCompanyId) &&
      !isMemberOf(actor, m.truckPosting.carrierCompanyId)
    ) {
      return this.view(m, 'STAFF');
    }
    const side = this.sideOf(actor, m);
    if (m.status === 'SUGGESTED') {
      await this.db.match.update({
        where: { id },
        data: {
          status: transition(matchMachine, 'SUGGESTED', 'VIEW', side),
          ...(side === 'SHIPPER'
            ? { viewedByShipperAt: new Date() }
            : { viewedByCarrierAt: new Date() }),
        },
      });
    }
    return this.view(await this.getFull(id), side);
  }

  async listForLoad(actor: AuthActor, loadId: string) {
    const load = await this.db.load.findUnique({ where: { id: loadId } });
    if (!load) throw notFound('Load', loadId);
    if (!actor.isStaff && !isMemberOf(actor, load.shipperCompanyId)) throw forbidden();
    const rows = await this.db.match.findMany({
      where: { loadId, status: { not: 'DISMISSED' } },
      include: matchInclude,
      orderBy: [{ score: 'desc' }, { deadheadKm: 'asc' }],
    });
    return rows.map((m) => this.view(m, actor.isStaff ? 'STAFF' : 'SHIPPER'));
  }

  async listForPosting(actor: AuthActor, postingId: string) {
    const p = await this.db.truckPosting.findUnique({ where: { id: postingId } });
    if (!p) throw notFound('TruckPosting', postingId);
    if (!actor.isStaff && !isMemberOf(actor, p.carrierCompanyId)) throw forbidden();
    const rows = await this.db.match.findMany({
      where: { truckPostingId: postingId, status: { not: 'DISMISSED' } },
      include: matchInclude,
      orderBy: [{ score: 'desc' }, { deadheadKm: 'asc' }],
    });
    return rows.map((m) => this.view(m, actor.isStaff ? 'STAFF' : 'CARRIER'));
  }

  /** "Eşleşmelerim": aktif firmanın taraf olduğu eşleşmeler. */
  async listMine(actor: AuthActor, status?: string) {
    const cid = actor.activeCompanyId;
    if (!cid) return [];
    const rows = await this.db.match.findMany({
      where: {
        OR: [{ load: { shipperCompanyId: cid } }, { truckPosting: { carrierCompanyId: cid } }],
        ...(status
          ? { status: status as MatchStatus }
          : { status: { in: [...OPEN_MATCH_STATUSES] } }),
      },
      include: matchInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    });
    return rows.map((m) => this.view(m, this.sideOf(actor, m)));
  }

  /** İlgi bildirimi (DOMAIN §4.3); iki taraf da ilgiliyse MUTUAL → sohbet + teklif akışı. */
  async interest(actor: AuthActor, id: string, interested: boolean) {
    const m = await this.getFull(id);
    const side = this.sideOf(actor, m);
    const companyId =
      side === 'SHIPPER' ? m.load.shipperCompanyId : m.truckPosting.carrierCompanyId;
    if (!hasCompanyPermission(actor, companyId, 'offer:write'))
      throw forbidden('COMPANY_PERMISSION_DENIED', 'Teklif yetkiniz yok');
    if (!interested) return this.dismiss(actor, id, 'NOT_INTERESTED');

    const event = side === 'SHIPPER' ? 'SHIPPER_INTEREST' : 'CARRIER_INTEREST';
    const to = transition(matchMachine, m.status, event, side);
    await this.db.$transaction(async (tx) => {
      const res = await tx.match.updateMany({
        where: { id, version: m.version },
        data: {
          status: to,
          version: { increment: 1 },
          ...(side === 'SHIPPER'
            ? { shipperInterestAt: new Date() }
            : { carrierInterestAt: new Date() }),
        },
      });
      if (res.count === 0)
        throw conflict('CONCURRENT_UPDATE', 'Eşleşme güncellendi; tekrar deneyin');
      if (to === 'MUTUAL') await this.onMutual(tx, m);
    });

    const other = side === 'SHIPPER' ? m.truckPosting.carrierCompanyId : m.load.shipperCompanyId;
    await this.notifications.notifyCompany(
      null,
      other,
      to === 'MUTUAL' ? 'MATCH_MUTUAL' : 'MATCH_INTEREST',
      { matchId: id, route: route(m) },
      {
        dedupKey: `match-interest:${id}:${to}`,
      },
    );
    if (to === 'MUTUAL') {
      await this.notifications.notifyCompany(
        null,
        companyId,
        'MATCH_MUTUAL',
        { matchId: id, route: route(m) },
        { dedupKey: `match-interest:${id}:${to}` },
      );
    }
    return this.get(actor, id);
  }

  /**
   * MUTUAL: maskeli sohbet açılır. Sabit fiyatlı yükte sistem shipper adına sabit fiyat teklifini açar
   * (DOMAIN §4.4; karşı teklif kapalı).
   */
  private async onMutual(tx: DbOrTx, m: MatchFull) {
    await tx.conversation.upsert({
      where: { matchId: m.id },
      create: {
        contextType: 'MATCH',
        matchId: m.id,
        shipperCompanyId: m.load.shipperCompanyId,
        carrierCompanyId: m.truckPosting.carrierCompanyId,
      },
      update: {},
    });
    if (m.load.pricingMode === 'FIXED' && m.load.budgetMax) {
      const validUntil = new Date(
        Math.min(Date.now() + 24 * 3_600_000, m.load.pickupWindowStart.getTime()),
      );
      if (validUntil.getTime() > Date.now()) {
        const offer = await tx.offer.create({
          data: {
            matchId: m.id,
            loadId: m.loadId,
            truckPostingId: m.truckPostingId,
            offeredBy: 'SHIPPER',
            offeredByCompanyId: m.load.shipperCompanyId,
            offeredByUserId: m.load.createdByUserId,
            amount: m.load.budgetMax,
            currency: m.load.currency,
            validUntil,
            note: 'Sabit fiyat',
          },
        });
        await this.outbox.emit(tx, 'offer.expire', { offerId: offer.id }, { runAt: validUntil });
        await syncOpenLoadStatus(tx, m.loadId);
      }
    }
  }

  async dismiss(actor: AuthActor, id: string, reason: string) {
    const m = await this.getFull(id);
    const side =
      actor.isStaff &&
      !isMemberOf(actor, m.load.shipperCompanyId) &&
      !isMemberOf(actor, m.truckPosting.carrierCompanyId)
        ? 'OPS'
        : this.sideOf(actor, m);
    const to = transition(matchMachine, m.status, 'DISMISS', side);
    await this.db.$transaction(async (tx) => {
      await tx.match.update({
        where: { id },
        data: {
          status: to,
          dismissedBy: side === 'OPS' ? null : side,
          dismissReason: reason,
          version: { increment: 1 },
        },
      });
      await tx.offer.updateMany({
        where: { matchId: id, status: 'PENDING' },
        data: { status: 'WITHDRAWN', note: 'MATCH_DISMISSED' },
      });
      await syncOpenLoadStatus(tx, m.loadId);
    });
    return { id, status: to };
  }

  /**
   * Panodan manuel eşleşme (LOAD_INITIATED / TRUCK_INITIATED). Hard filtreler uygulanır, eşik uygulanmaz.
   */
  async manual(actor: AuthActor, loadId: string, postingId: string) {
    const [loadRow, postingRow] = await Promise.all([
      this.db.load.findUnique({ where: { id: loadId } }),
      this.db.truckPosting.findUnique({ where: { id: postingId } }),
    ]);
    if (!loadRow) throw notFound('Load', loadId);
    if (!postingRow) throw notFound('TruckPosting', postingId);
    const side: Side | null = isMemberOf(actor, loadRow.shipperCompanyId)
      ? 'SHIPPER'
      : isMemberOf(actor, postingRow.carrierCompanyId)
        ? 'CARRIER'
        : null;
    if (!side) throw forbidden('NOT_A_PARTY', 'İlanlardan biri size ait olmalı');

    const existing = await this.db.match.findUnique({
      where: { loadId_truckPostingId: { loadId, truckPostingId: postingId } },
    });
    if (existing && existing.status !== 'EXPIRED' && existing.status !== 'DISMISSED') {
      return this.interest(actor, existing.id, true);
    }

    const load = await this.repo.loadById(loadId);
    const [cand] = await this.repo.candidatesByPostingIds([postingId], loadRow.shipperCompanyId);
    const { ctx, params } = await this.context();
    const ev = evaluatePair(load!, cand!, ctx, params);
    if (!ev.pass) {
      throw unprocessable('NOT_ELIGIBLE', 'Bu yük ve araç zorunlu kriterlerde uyuşmuyor', {
        failures: ev.failures,
      });
    }
    const data = {
      score: ev.scored!.score,
      scoreBreakdown: ev.scored!.breakdown as unknown as Prisma.InputJsonValue,
      deadheadKm: ev.scored!.deadheadKm,
      matchingConfigId: params.id,
      direction: side === 'SHIPPER' ? ('LOAD_INITIATED' as const) : ('TRUCK_INITIATED' as const),
      status:
        side === 'SHIPPER'
          ? ('INTERESTED_BY_SHIPPER' as const)
          : ('INTERESTED_BY_CARRIER' as const),
      ...(side === 'SHIPPER'
        ? { shipperInterestAt: new Date() }
        : { carrierInterestAt: new Date() }),
      dismissReason: null,
      dismissedBy: null,
    };
    const match = await this.db.$transaction(async (tx) => {
      const m = existing
        ? await tx.match.update({
            where: { id: existing.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.match.create({ data: { ...data, loadId, truckPostingId: postingId } });
      await syncOpenLoadStatus(tx, loadId);
      return m;
    });
    const other = side === 'SHIPPER' ? postingRow.carrierCompanyId : loadRow.shipperCompanyId;
    await this.notifications.notifyCompany(null, other, 'MATCH_INTEREST', {
      matchId: match.id,
      route: `${loadRow.pickupCity} → ${loadRow.deliveryCity}`,
    });
    return this.get(actor, match.id);
  }

  /** Admin: seçili veya tüm açık ilanlar için yeniden hesap (kuyruğa atar). */
  async enqueueRecompute(
    loadIds: string[],
    postingIds: string[],
    allOpen: boolean,
  ): Promise<number> {
    let ids: { entity: 'load' | 'posting'; id: string }[] = loadIds.map((id) => ({
      entity: 'load' as const,
      id,
    }));
    ids = ids.concat(postingIds.map((id) => ({ entity: 'posting' as const, id })));
    if (allOpen) {
      const loads = await this.db.load.findMany({
        where: {
          status: { in: ['PUBLISHED', 'MATCHING', 'OFFERED'] },
          moderationStatus: { in: ['NOT_REQUIRED', 'APPROVED'] },
        },
        select: { id: true },
      });
      ids = ids.concat(loads.map((l) => ({ entity: 'load' as const, id: l.id })));
    }
    for (const x of ids) await this.outbox.emitNow('match.compute', x);
    return ids.length;
  }
}

export type { MatchCandidate };
