import { Distance, placeKey } from '@logimatch/shared';
import { peakCargo } from './hard-filters';
import type {
  Derived,
  MatchCandidate,
  MatchContext,
  MatchLoad,
  MatchingParams,
  MatchReason,
  ScoreBreakdown,
  ScoreComponent,
} from './types';

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

interface Sub {
  value: number;
  inputs: Record<string, unknown>;
  reasons?: MatchReason[];
}

/** 0 km = 100, maxDeadhead = 0, lineer. */
export function proximityScore(deadheadKm: number, maxDeadheadKm: number): Sub {
  const value = maxDeadheadKm <= 0 ? 100 : clamp(100 * (1 - deadheadKm / maxDeadheadKm));
  return {
    value,
    inputs: { deadheadKm: r2(deadheadKm), maxDeadheadKm },
    reasons: deadheadKm <= 50 ? ['NEAR_PICKUP'] : [],
  };
}

/** Tercih edilen destinasyona uyum + dönüş yükü (backhaul) bonusu. */
export function routeFitScore(load: MatchLoad, c: MatchCandidate): Sub {
  const prefs = c.posting.preferredDestinations;
  const reasons: MatchReason[] = [];
  let value: number;
  let matched: string | null = null;
  if (prefs.length === 0) {
    value = 50;
  } else {
    const cityKey = placeKey(load.deliveryCity);
    const exact = prefs.find(
      (p) => p.country === load.deliveryCountry && (p.city ? placeKey(p.city) === cityKey : true),
    );
    if (exact) {
      value = 100;
      matched = exact.city ?? exact.country;
      reasons.push('PREFERRED_DESTINATION');
    } else {
      const withCoords = prefs.filter((p) => p.lat != null && p.lng != null);
      const nearest = withCoords.length
        ? Math.min(
            ...withCoords.map(
              (p) => Distance.between({ lat: p.lat!, lng: p.lng! }, load.delivery).km,
            ),
          )
        : Infinity;
      value = Number.isFinite(nearest) ? 80 * Math.max(0, 1 - nearest / 300) : 0;
    }
  }
  const home = c.driver.homeBase ?? c.carrier.home ?? null;
  const homeKm = home ? Distance.between(home, load.delivery).km : null;
  const backhaul = homeKm != null && homeKm <= 100;
  if (backhaul) {
    value += 20;
    reasons.push('BACKHAUL_HOME');
  }
  return {
    value: clamp(value),
    inputs: {
      preferred: prefs.length,
      matched,
      homeKm: homeKm == null ? null : r2(homeKm),
      backhaul,
    },
    reasons,
  };
}

/** Aracın taban fiyatı ile yükün bütçe aralığının örtüşmesi. */
export function priceFitScore(
  load: MatchLoad,
  c: MatchCandidate,
  ctx: MatchContext,
  distanceKm: number,
): Sub {
  const min = c.posting.minPricePerKm;
  let lo = load.pricingMode === 'FIXED' ? load.budgetMax : load.budgetMin;
  let hi = load.budgetMax;
  if (lo == null && hi != null) lo = hi.times(0.85);
  if (hi == null && lo != null) hi = lo.times(1.15);
  if (lo == null || hi == null) {
    lo = load.estimatedPriceMin ?? null;
    hi = load.estimatedPriceMax ?? null;
  }
  if (min == null || lo == null || hi == null) {
    return { value: 75, inputs: { reason: min == null ? 'NO_MIN_PRICE' : 'NO_BUDGET' } };
  }
  const floor = ctx.fx(min.times(distanceKm), c.posting.currency, load.currency).toNumber();
  const l = lo.toNumber();
  const h = hi.toNumber();
  let value: number;
  if (floor <= l) value = 100;
  else if (floor <= h) value = h === l ? 100 : 100 - (50 * (floor - l)) / (h - l);
  else if (floor <= h * 1.15) value = 50 * (1 - (floor - h) / (h * 0.15));
  else value = 0;
  return {
    value: clamp(value),
    inputs: { floor: r2(floor), lo: r2(l), hi: r2(h), currency: load.currency },
    reasons: floor <= h ? ['PRICE_WITHIN_BUDGET'] : [],
  };
}

/** Bayes puan + tamamlama oranı − son 90 gün no-show/iptal cezaları. */
export function reliabilityScore(stats: MatchCandidate['stats']): Sub {
  const m = 5;
  const prior = 3.5;
  const n = stats.ratingCount;
  const R = (n * stats.ratingAvg + m * prior) / (n + m);
  const ratingPart = ((R - 1) / 4) * 100;
  const pseudo = 2;
  const completion =
    (stats.completed + pseudo * 0.8) /
    (stats.completed + stats.carrierCancelled + stats.noShow + pseudo);
  const value = clamp(
    0.6 * ratingPart + 0.4 * 100 * completion - 10 * stats.noShow90 - 5 * stats.carrierCancel90,
  );
  return {
    value,
    inputs: {
      bayesRating: r2(R),
      ratingCount: n,
      completionRate: r2(completion),
      noShow90: stats.noShow90,
      carrierCancel90: stats.carrierCancel90,
    },
    reasons: R >= 4.5 && n >= 3 ? ['HIGHLY_RATED'] : [],
  };
}

/** Yükleme penceresinin ne kadarında araç orada olabilir. */
export function timeFitScore(load: MatchLoad, c: MatchCandidate, d: Derived): Sub {
  const winMs = load.pickupWindowEnd.getTime() - load.pickupWindowStart.getTime();
  const end = Math.min(c.posting.availableUntil.getTime(), load.pickupWindowEnd.getTime());
  const usable = Math.max(0, end - d.earliestArrival.getTime());
  const value = winMs <= 0 ? 0 : clamp((100 * usable) / winMs);
  return {
    value,
    inputs: {
      earliestArrival: d.earliestArrival.toISOString(),
      usableHours: r2(usable / 3_600_000),
      windowHours: r2(winMs / 3_600_000),
    },
    reasons: value >= 80 ? ['WIDE_TIME_OVERLAP'] : [],
  };
}

/** Fazla kapasite israfı cezası (40 t dorseye 2 t yük = düşük). */
export function equipmentFitScore(load: MatchLoad, c: MatchCandidate): Sub {
  const t = c.trailer;
  const peak = peakCargo(load);
  const ratios = [peak.weightKg / t.capacityKg];
  if (peak.volumeM3 != null && t.volumeM3 > 0) ratios.push(peak.volumeM3 / t.volumeM3);
  if (peak.loadingMeters != null && t.loadingMeters > 0)
    ratios.push(peak.loadingMeters / t.loadingMeters);
  const util = Math.max(...ratios);
  const floor = c.posting.acceptsPartialLoad ? 50 : 10;
  const value = util >= 0.7 ? 100 : Math.max(floor, (100 * util) / 0.7);
  return {
    value: clamp(value),
    inputs: { utilization: r2(util), partialOk: c.posting.acceptsPartialLoad },
    reasons: util >= 0.7 ? ['GOOD_UTILIZATION'] : [],
  };
}

/** İki firma daha önce sorunsuz çalıştıysa bonus. */
export function historyScore(pair: MatchCandidate['pair'], now: Date): Sub {
  const recentLoss =
    pair.lastDisputeLostAt != null && now.getTime() - pair.lastDisputeLostAt.getTime() < 365 * DAY;
  const n = pair.goodCount;
  const value = recentLoss ? 0 : n <= 0 ? 0 : n === 1 ? 60 : n === 2 ? 80 : 100;
  return {
    value,
    inputs: { goodShipments: n, recentDisputeLost: recentLoss },
    reasons: n > 0 && !recentLoss ? ['WORKED_TOGETHER'] : [],
  };
}

/** DOMAIN §6.3 — ağırlıklı toplam, 2 ondalık. */
export function scoreMatch(
  load: MatchLoad,
  c: MatchCandidate,
  ctx: MatchContext,
  params: MatchingParams,
  d: Derived,
): ScoreBreakdown {
  const subs: Record<ScoreComponent, Sub> = {
    proximity: proximityScore(d.deadheadKm, c.posting.maxDeadheadKm),
    routeFit: routeFitScore(load, c),
    priceFit: priceFitScore(load, c, ctx, d.loadDistanceKm),
    reliability: reliabilityScore(c.stats),
    timeFit: timeFitScore(load, c, d),
    equipmentFit: equipmentFitScore(load, c),
    history: historyScore(c.pair, ctx.now),
  };
  const components = {} as ScoreBreakdown['components'];
  let total = 0;
  const reasons: MatchReason[] = [];
  for (const key of Object.keys(subs) as ScoreComponent[]) {
    const s = subs[key];
    const weight = params.weights[key];
    const contribution = s.value * weight;
    total += contribution;
    components[key] = {
      value: r2(s.value),
      weight,
      contribution: r2(contribution),
      inputs: s.inputs,
    };
    reasons.push(...(s.reasons ?? []));
  }
  return { version: 1, total: r2(clamp(total)), components, reasons };
}

export function weightsSum(params: MatchingParams): number {
  const w = params.weights;
  return (
    w.proximity + w.routeFit + w.priceFit + w.reliability + w.timeFit + w.equipmentFit + w.history
  );
}
