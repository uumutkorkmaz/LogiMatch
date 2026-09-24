import { evaluateHardFilters } from './hard-filters';
import { scoreMatch, weightsSum } from './scoring';
import type {
  HardFilterCode,
  MatchCandidate,
  MatchContext,
  MatchLoad,
  MatchingParams,
  ScoredMatch,
} from './types';

export interface Evaluation {
  truckPostingId: string;
  loadId: string;
  pass: boolean;
  failures: HardFilterCode[];
  scored: ScoredMatch | null;
}

/** Tek (yük, araç) çifti: hard filtre + skor. Filtreyi geçemezse skor hesaplanmaz. */
export function evaluatePair(
  load: MatchLoad,
  c: MatchCandidate,
  ctx: MatchContext,
  params: MatchingParams,
): Evaluation {
  const hf = evaluateHardFilters(load, c, ctx, params);
  if (!hf.pass) {
    return {
      loadId: load.id,
      truckPostingId: c.posting.id,
      pass: false,
      failures: hf.failures,
      scored: null,
    };
  }
  const breakdown = scoreMatch(load, c, ctx, params, hf.derived);
  return {
    loadId: load.id,
    truckPostingId: c.posting.id,
    pass: true,
    failures: [],
    scored: {
      loadId: load.id,
      truckPostingId: c.posting.id,
      score: breakdown.total,
      deadheadKm: Math.round(hf.derived.deadheadKm * 10) / 10,
      breakdown,
    },
  };
}

/** Skor sırası; eşitlikte boş km'si az olan önde (DOMAIN §6.3). */
export function compareScored(a: ScoredMatch, b: ScoredMatch): number {
  return (
    b.score - a.score ||
    a.deadheadKm - b.deadheadKm ||
    a.truckPostingId.localeCompare(b.truckPostingId)
  );
}

/** Yük için: hard filtreyi geçen, eşiği aşan ilk N araç. */
export function rankCandidatesForLoad(
  load: MatchLoad,
  candidates: MatchCandidate[],
  ctx: MatchContext,
  params: MatchingParams,
): ScoredMatch[] {
  assertParams(params);
  return candidates
    .map((c) => evaluatePair(load, c, ctx, params).scored)
    .filter((s): s is ScoredMatch => !!s && s.score >= params.threshold)
    .sort(compareScored)
    .slice(0, params.topN);
}

/** Araç için: uygun ilk N yük (simetrik akış). */
export function rankLoadsForCandidate(
  candidate: MatchCandidate,
  loads: MatchLoad[],
  ctx: MatchContext,
  params: MatchingParams,
): ScoredMatch[] {
  assertParams(params);
  return loads
    .map((l) => evaluatePair(l, candidate, ctx, params).scored)
    .filter((s): s is ScoredMatch => !!s && s.score >= params.threshold)
    .sort(compareScored)
    .slice(0, params.topN);
}

export function assertParams(params: MatchingParams): void {
  const sum = weightsSum(params);
  if (Math.abs(sum - 1) > 1e-6) throw new Error(`Matching weights must sum to 1 (got ${sum})`);
}
