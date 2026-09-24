import { Decimal } from '@logimatch/shared';
import { describe, expect, it } from 'vitest';
import {
  assertParams,
  compareScored,
  evaluatePair,
  rankCandidatesForLoad,
  rankLoadsForCandidate,
} from './engine';
import { makeCandidate, makeCtx, makeLoad, NOW } from './fixtures';
import { deriveValues } from './hard-filters';
import {
  equipmentFitScore,
  historyScore,
  priceFitScore,
  proximityScore,
  reliabilityScore,
  routeFitScore,
  scoreMatch,
  timeFitScore,
} from './scoring';
import { DEFAULT_MATCHING_PARAMS as P, type MatchingParams } from './types';

const ctx = makeCtx();

describe('proximityScore', () => {
  it('is linear from 100 at 0 km to 0 at max deadhead', () => {
    expect(proximityScore(0, 200).value).toBe(100);
    expect(proximityScore(50, 200).value).toBe(75);
    expect(proximityScore(200, 200).value).toBe(0);
    expect(proximityScore(250, 200).value).toBe(0);
    expect(proximityScore(0, 0).value).toBe(100);
    expect(proximityScore(30, 200).reasons).toContain('NEAR_PICKUP');
    expect(proximityScore(80, 200).reasons).toEqual([]);
  });
});

describe('routeFitScore', () => {
  it('is neutral 50 without preferences', () => {
    expect(routeFitScore(makeLoad(), makeCandidate()).value).toBe(50);
  });

  it('is 100 when the delivery city is preferred (case/diacritic insensitive)', () => {
    const c = makeCandidate({
      posting: { preferredDestinations: [{ country: 'TR', city: 'ANKARA' }] },
    });
    const s = routeFitScore(makeLoad(), c);
    expect(s.value).toBe(100);
    expect(s.reasons).toContain('PREFERRED_DESTINATION');
  });

  it('country-level preference matches any city in that country', () => {
    const c = makeCandidate({ posting: { preferredDestinations: [{ country: 'TR' }] } });
    expect(routeFitScore(makeLoad(), c).value).toBe(100);
  });

  it('decays with distance to the nearest preferred city (max 80)', () => {
    const near = makeCandidate({
      posting: {
        preferredDestinations: [{ country: 'TR', city: 'Kırıkkale', lat: 39.85, lng: 33.51 }],
      },
    });
    const v = routeFitScore(makeLoad(), near).value;
    expect(v).toBeGreaterThan(50);
    expect(v).toBeLessThan(80);
    const far = makeCandidate({
      posting: { preferredDestinations: [{ country: 'TR', city: 'Van', lat: 38.49, lng: 43.38 }] },
    });
    expect(routeFitScore(makeLoad(), far).value).toBe(0);
    const noCoords = makeCandidate({
      posting: { preferredDestinations: [{ country: 'TR', city: 'Van' }] },
    });
    expect(routeFitScore(makeLoad(), noCoords).value).toBe(0);
  });

  it('adds a backhaul bonus when delivery is near the driver home base', () => {
    const c = makeCandidate({ driver: { homeBase: { lat: 39.93, lng: 32.86 } } });
    const s = routeFitScore(makeLoad(), c);
    expect(s.value).toBe(70);
    expect(s.reasons).toContain('BACKHAUL_HOME');
    const viaCompany = makeCandidate({ carrier: { home: { lat: 39.93, lng: 32.86 } } });
    expect(routeFitScore(makeLoad(), viaCompany).value).toBe(70);
  });

  it('caps at 100', () => {
    const c = makeCandidate({
      posting: { preferredDestinations: [{ country: 'TR', city: 'Ankara' }] },
      driver: { homeBase: { lat: 39.93, lng: 32.86 } },
    });
    expect(routeFitScore(makeLoad(), c).value).toBe(100);
  });
});

describe('priceFitScore', () => {
  const load = makeLoad(); // bütçe 24.000–30.000 TRY, 450 km
  const at = (perKm: number, l = load, currency: 'TRY' | 'EUR' = 'TRY') =>
    priceFitScore(
      l,
      makeCandidate({ posting: { minPricePerKm: new Decimal(perKm), currency } }),
      ctx,
      450,
    ).value;

  it('100 when the truck floor is under the budget floor', () => {
    expect(at(50)).toBe(100); // 22.500
  });
  it('100 → 50 linearly inside the budget', () => {
    expect(at(60)).toBeCloseTo(75, 5); // 27.000
    expect(at(66.6667)).toBeCloseTo(50, 1); // 30.000
  });
  it('50 → 0 within 15% above the budget, then 0', () => {
    expect(at(70)).toBeGreaterThan(0);
    expect(at(70)).toBeLessThan(50);
    expect(at(90)).toBe(0);
  });
  it('converts the carrier currency', () => {
    expect(at(1.25, load, 'EUR')).toBe(100); // 1.25 EUR × 40 = 50 TRY/km
  });
  it('neutral 75 without a minimum price or any budget', () => {
    expect(
      priceFitScore(load, makeCandidate({ posting: { minPricePerKm: null } }), ctx, 450).value,
    ).toBe(75);
    const noBudget = makeLoad({
      budgetMin: null,
      budgetMax: null,
      estimatedPriceMin: null,
      estimatedPriceMax: null,
    });
    expect(priceFitScore(noBudget, makeCandidate(), ctx, 450).value).toBe(75);
  });
  it('uses the fixed price, a one-sided budget or the estimate', () => {
    const fixed = makeLoad({
      pricingMode: 'FIXED',
      budgetMin: null,
      budgetMax: new Decimal(25000),
    });
    expect(at(50, fixed)).toBe(100);
    expect(at(60, fixed)).toBeLessThan(50);
    const onlyMax = makeLoad({ budgetMin: null });
    expect(at(55, onlyMax)).toBe(100); // taban 24.750 ≤ 25.500 (max × 0,85)
    expect(at(60, onlyMax)).toBeLessThan(100);
    const onlyMin = makeLoad({ budgetMax: null });
    expect(at(50, onlyMin)).toBe(100);
    const est = makeLoad({
      budgetMin: null,
      budgetMax: null,
      estimatedPriceMin: new Decimal(25000),
      estimatedPriceMax: new Decimal(31000),
    });
    expect(at(50, est)).toBe(100);
  });
});

describe('reliabilityScore', () => {
  const base = {
    ratingCount: 0,
    ratingAvg: 0,
    completed: 0,
    carrierCancelled: 0,
    noShow: 0,
    noShow90: 0,
    carrierCancel90: 0,
  };

  it('new carriers get the Bayesian prior (~69.5)', () => {
    expect(reliabilityScore(base).value).toBeCloseTo(69.5, 1);
  });
  it('great track record approaches 100', () => {
    const s = reliabilityScore({ ...base, ratingCount: 40, ratingAvg: 4.9, completed: 60 });
    expect(s.value).toBeGreaterThan(90);
    expect(s.reasons).toContain('HIGHLY_RATED');
  });
  it('recent no-shows and cancellations are penalised', () => {
    const good = reliabilityScore({
      ...base,
      ratingCount: 10,
      ratingAvg: 4.5,
      completed: 20,
    }).value;
    const bad = reliabilityScore({
      ...base,
      ratingCount: 10,
      ratingAvg: 4.5,
      completed: 20,
      noShow: 2,
      noShow90: 2,
      carrierCancelled: 1,
      carrierCancel90: 1,
    }).value;
    expect(good - bad).toBeGreaterThan(25);
  });
  it('never goes below 0', () => {
    expect(reliabilityScore({ ...base, noShow: 9, noShow90: 9 }).value).toBe(0);
  });
});

describe('timeFitScore', () => {
  it('100 when the truck can be there for the whole window', () => {
    const l = makeLoad();
    const c = makeCandidate();
    expect(timeFitScore(l, c, deriveValues(l, c, ctx, P)).value).toBe(100);
  });
  it('proportional to the usable part of the window', () => {
    const l = makeLoad();
    const c = makeCandidate({ posting: { availableUntil: new Date('2026-10-01T09:00:00Z') } });
    expect(timeFitScore(l, c, deriveValues(l, c, ctx, P)).value).toBeCloseTo(50, 5);
  });
});

describe('equipmentFitScore', () => {
  it('100 above 70% utilization', () => {
    expect(equipmentFitScore(makeLoad(), makeCandidate()).value).toBe(100);
  });
  it('penalises wasting a 24 t trailer on 2 t', () => {
    const l = makeLoad({ weightKg: 2000, volumeM3: 5, loadingMeters: 1, palletCount: 2 });
    const s = equipmentFitScore(l, makeCandidate());
    expect(s.value).toBeLessThan(20);
    expect(
      equipmentFitScore(l, makeCandidate({ posting: { acceptsPartialLoad: true } })).value,
    ).toBe(50);
  });
  it('uses the most constraining dimension (volume here)', () => {
    const l = makeLoad({ weightKg: 5000, volumeM3: 80, loadingMeters: null });
    expect(equipmentFitScore(l, makeCandidate()).value).toBe(100);
  });
});

describe('historyScore', () => {
  it('rewards repeated clean collaboration', () => {
    expect(historyScore({ goodCount: 0 }, NOW).value).toBe(0);
    expect(historyScore({ goodCount: 1 }, NOW).value).toBe(60);
    expect(historyScore({ goodCount: 2 }, NOW).value).toBe(80);
    expect(historyScore({ goodCount: 7 }, NOW).value).toBe(100);
  });
  it('a dispute lost in the last 12 months zeroes it', () => {
    expect(
      historyScore({ goodCount: 5, lastDisputeLostAt: new Date('2026-05-01') }, NOW).value,
    ).toBe(0);
    expect(
      historyScore({ goodCount: 5, lastDisputeLostAt: new Date('2025-01-01') }, NOW).value,
    ).toBe(100);
  });
});

describe('scoreMatch', () => {
  it('weighted total equals the sum of contributions and explains itself', () => {
    const l = makeLoad();
    const c = makeCandidate({ driver: { homeBase: { lat: 39.93, lng: 32.86 } } });
    const b = scoreMatch(l, c, ctx, P, deriveValues(l, c, ctx, P));
    const sum = Object.values(b.components).reduce((a, x) => a + x.contribution, 0);
    expect(b.total).toBeCloseTo(sum, 1);
    expect(b.version).toBe(1);
    expect(b.components.proximity.weight).toBe(0.25);
    expect(b.reasons).toEqual(
      expect.arrayContaining(['NEAR_PICKUP', 'BACKHAUL_HOME', 'PRICE_WITHIN_BUDGET']),
    );
    expect(b.total).toBeGreaterThan(70);
  });
});

describe('engine', () => {
  it('evaluatePair returns failures and no score when filters fail', () => {
    const e = evaluatePair(makeLoad(), makeCandidate({ blocked: true }), ctx, P);
    expect(e.pass).toBe(false);
    expect(e.scored).toBeNull();
    expect(e.failures).toEqual(['BLOCKED']);
  });

  it('ranks by score, drops below-threshold and failing candidates, keeps top N', () => {
    const near = makeCandidate({ posting: { id: 'near', origin: { lat: 40.82, lng: 29.31 } } });
    const far = makeCandidate({
      posting: { id: 'far', origin: { lat: 40.3, lng: 30.2 }, maxDeadheadKm: 300 },
    });
    const bad = makeCandidate({ posting: { id: 'bad' }, trailer: { trailerType: 'TANKER' } });
    const ranked = rankCandidatesForLoad(makeLoad(), [far, bad, near], ctx, P);
    expect(ranked.map((r) => r.truckPostingId)).toEqual(['near', 'far']);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);

    const top1 = rankCandidatesForLoad(makeLoad(), [far, near], ctx, { ...P, topN: 1 });
    expect(top1).toHaveLength(1);
    const strict = rankCandidatesForLoad(makeLoad(), [far, near], ctx, { ...P, threshold: 99 });
    expect(strict).toEqual([]);
  });

  it('breaks ties by smaller deadhead, then id', () => {
    const a = {
      loadId: 'l',
      truckPostingId: 'a',
      score: 80,
      deadheadKm: 30,
      breakdown: {} as never,
    };
    const b = { ...a, truckPostingId: 'b', deadheadKm: 10 };
    const c = { ...a, truckPostingId: 'c', deadheadKm: 10 };
    expect([a, c, b].sort(compareScored).map((x) => x.truckPostingId)).toEqual(['b', 'c', 'a']);
  });

  it('works symmetrically for a truck looking for loads', () => {
    const l1 = makeLoad({ id: 'l1' });
    const l2 = makeLoad({ id: 'l2', requiredTrailerTypes: ['TANKER'] });
    const l3 = makeLoad({ id: 'l3', pickup: { lat: 40.9, lng: 29.2 } });
    const ranked = rankLoadsForCandidate(makeCandidate(), [l1, l2, l3], ctx, P);
    expect(ranked.map((r) => r.loadId).sort()).toEqual(['l1', 'l3']);
  });

  it('rejects weights that do not sum to 1', () => {
    const bad: MatchingParams = { ...P, weights: { ...P.weights, history: 0.5 } };
    expect(() => assertParams(bad)).toThrow(/sum to 1/);
    expect(() => rankCandidatesForLoad(makeLoad(), [], ctx, bad)).toThrow();
    expect(() => rankLoadsForCandidate(makeCandidate(), [], ctx, bad)).toThrow();
  });
});
