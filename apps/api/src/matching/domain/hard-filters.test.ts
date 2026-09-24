import { describe, expect, it } from 'vitest';
import { makeCandidate, makeCtx, makeLoad } from './fixtures';
import {
  drivingHoursWithBreaks,
  evaluateHardFilters,
  foreignCountries,
  peakCargo,
} from './hard-filters';
import { DEFAULT_MATCHING_PARAMS as P, type HardFilterCode } from './types';

const ctx = makeCtx();
const run = (l = makeLoad(), c = makeCandidate(), x = ctx) => evaluateHardFilters(l, c, x, P);
const failuresOf = (l = makeLoad(), c = makeCandidate(), x = ctx) => run(l, c, x).failures;
const expectOnly = (codes: HardFilterCode[], l = makeLoad(), c = makeCandidate(), x = ctx) =>
  expect(failuresOf(l, c, x)).toEqual(codes);

describe('baseline', () => {
  it('the default Tuzla→Ankara load and Gebze truck match', () => {
    const r = run();
    expect(r.pass).toBe(true);
    expect(r.derived.deadheadKm).toBeGreaterThan(10);
    expect(r.derived.deadheadKm).toBeLessThan(20);
    expect(r.derived.earliestArrival.toISOString()).toBe('2026-10-01T06:00:00.000Z');
  });
});

describe('1. TRAILER_TYPE', () => {
  it('fails when the trailer type is not accepted', () => {
    expectOnly(
      ['TRAILER_TYPE'],
      makeLoad(),
      makeCandidate({ trailer: { trailerType: 'DAMPERLI' } }),
    );
  });
  it('accepts any of multiple acceptable types', () => {
    expect(run(makeLoad(), makeCandidate({ trailer: { trailerType: 'MEGA' } })).pass).toBe(true);
  });
  it('requires every required feature', () => {
    expectOnly(['TRAILER_TYPE'], makeLoad({ requiredFeatures: ['TAIL_LIFT', 'SIDE_OPENING'] }));
    expect(run(makeLoad({ requiredFeatures: ['SIDE_OPENING'] })).pass).toBe(true);
  });
});

describe('2. CAPACITY', () => {
  it.each([
    [{ weightKg: 24001 }],
    [{ volumeM3: 91 }],
    [{ loadingMeters: 13.7 }],
    [{ palletCount: 34 }],
    [{ maxPieceHeightCm: 271 }],
    [{ maxPieceLengthCm: 1400, maxPieceWidthCm: 100 }],
  ])('fails for %j', (patch) => expectOnly(['CAPACITY'], makeLoad(patch)));

  it('exact capacity fits', () => {
    expect(run(makeLoad({ weightKg: 24000, volumeM3: 90, palletCount: 33 })).pass).toBe(true);
  });

  it('pieces can be rotated 90°', () => {
    expect(run(makeLoad({ maxPieceLengthCm: 240, maxPieceWidthCm: 1300 })).pass).toBe(true);
  });

  it('IND pallets use ~80% of EUR capacity', () => {
    expectOnly(['CAPACITY'], makeLoad({ palletType: 'IND', palletCount: 27 }));
    expect(run(makeLoad({ palletType: 'IND', palletCount: 26 })).pass).toBe(true);
  });

  it('null load dimensions are not checked', () => {
    expect(run(makeLoad({ volumeM3: null, loadingMeters: null, palletCount: null })).pass).toBe(
      true,
    );
  });
});

describe('#22 multi-stop cumulative capacity', () => {
  const stops = (w: number[]) =>
    w.map((kg, i) => ({
      type: kg >= 0 ? ('PICKUP' as const) : ('DELIVERY' as const),
      lat: 40 + i * 0.1,
      lng: 29,
      weightKg: Math.abs(kg),
    }));

  it('peak onboard weight is the running maximum', () => {
    const l = makeLoad({ weightKg: 30000, stops: stops([15000, 10000, -12000, 15000, -28000]) });
    expect(peakCargo(l).weightKg).toBe(28000);
    expectOnly(['CAPACITY'], l);
  });

  it('drops along the route free capacity', () => {
    const l = makeLoad({ weightKg: 30000, stops: stops([15000, -10000, 15000, -20000]) });
    expect(peakCargo(l).weightKg).toBe(20000);
    expect(run(l).pass).toBe(true);
  });
});

describe('3. TIME_WINDOW', () => {
  it('fails when availability does not overlap the pickup window', () => {
    expectOnly(
      ['TIME_WINDOW'],
      makeLoad(),
      makeCandidate({
        posting: {
          availableFrom: new Date('2026-10-01T12:00:00Z'),
          availableUntil: new Date('2026-10-02T00:00:00Z'),
        },
      }),
    );
  });

  it('fails when the truck cannot reach the pickup before the window closes (deadhead ETA)', () => {
    // Ankara→Tuzla ~400 km yol ≈ 6,9 saat: 06:00'da boşalan araç 12:00'dan önce yetişemez.
    const c = makeCandidate({
      posting: {
        origin: { lat: 39.93, lng: 32.86 },
        maxDeadheadKm: 600,
        availableFrom: new Date('2026-10-01T06:00:00Z'),
      },
    });
    const r = run(makeLoad(), c);
    expect(r.failures).toEqual(['TIME_WINDOW']);
    expect(r.derived.etaToPickup.getTime()).toBeGreaterThan(
      new Date('2026-10-01T12:00:00Z').getTime(),
    );
  });

  it('uses now when availability started in the past', () => {
    const r = run(makeLoad(), makeCandidate(), makeCtx({ now: new Date('2026-10-01T09:00:00Z') }));
    expect(r.derived.earliestArrival.getTime()).toBeGreaterThan(
      new Date('2026-10-01T09:00:00Z').getTime(),
    );
    expect(r.pass).toBe(true);
  });

  it('window end is exclusive [start, end)', () => {
    const c = makeCandidate({
      posting: {
        availableFrom: new Date('2026-10-01T12:00:00Z'),
        availableUntil: new Date('2026-10-02T00:00:00Z'),
      },
    });
    expect(failuresOf(makeLoad(), c)).toContain('TIME_WINDOW');
  });

  it('adds breaks every 4.5 h of driving', () => {
    expect(drivingHoursWithBreaks(65 * 4, 65)).toBe(4);
    expect(drivingHoursWithBreaks(65 * 9, 65)).toBe(10.5);
  });
});

describe('4. ADR', () => {
  const adrLoad = makeLoad({ isAdr: true, adrClass: '3' });
  const adrTruck = makeCandidate({
    posting: { acceptsAdr: true },
    trailer: { features: ['ADR'], adrValidUntil: new Date('2027-01-01') },
    driver: { adrClasses: ['2', '3'], adrValidUntil: new Date('2027-01-01') },
  });

  it('passes with ADR trailer, qualified driver and valid certificates', () => {
    expect(run(adrLoad, adrTruck).pass).toBe(true);
  });

  it.each([
    ['posting does not accept ADR', { posting: { acceptsAdr: false } }],
    ['trailer lacks ADR feature', { trailer: { features: [] } }],
    ['driver class mismatch', { driver: { adrClasses: ['8'] } }],
    [
      'driver certificate expires before delivery',
      { driver: { adrValidUntil: new Date('2026-10-02') } },
    ],
    ['trailer ADR expired', { trailer: { adrValidUntil: null } }],
  ])('fails when %s', (_, patch) => {
    const c = makeCandidate({
      ...adrTruck,
      ...patch,
      posting: { ...adrTruck.posting, ...(patch as { posting?: object }).posting },
      trailer: { ...adrTruck.trailer, ...(patch as { trailer?: object }).trailer },
      driver: { ...adrTruck.driver, ...(patch as { driver?: object }).driver },
    });
    expect(failuresOf(adrLoad, c)).toEqual(['ADR']);
  });
});

describe('5. TEMPERATURE', () => {
  const cold = makeLoad({
    requiresTempControl: true,
    minTempC: 2,
    maxTempC: 8,
    requiredTrailerTypes: ['FRIGORIFIK'],
  });
  const reefer = makeCandidate({
    trailer: {
      trailerType: 'FRIGORIFIK',
      features: ['TEMP_CONTROLLED'],
      minTempC: -25,
      maxTempC: 12,
    },
  });

  it('passes when the reefer range covers the load range', () => {
    expect(run(cold, reefer).pass).toBe(true);
  });

  it('fails when the range does not cover', () => {
    const c = makeCandidate({
      trailer: {
        trailerType: 'FRIGORIFIK',
        features: ['TEMP_CONTROLLED'],
        minTempC: 4,
        maxTempC: 12,
      },
    });
    expect(failuresOf(cold, c)).toEqual(['TEMPERATURE']);
  });

  it('fails without temperature control', () => {
    const c = makeCandidate({ trailer: { trailerType: 'FRIGORIFIK', features: [] } });
    expect(failuresOf(cold, c)).toEqual(['TEMPERATURE']);
  });
});

describe('6. DOCUMENTS (#7)', () => {
  it.each(['carrier', 'vehicle', 'trailer', 'driver'] as const)(
    'fails when %s compliance expires before delivery ends',
    (who) => {
      const c = makeCandidate({
        [who]: { complianceValidUntil: new Date('2026-10-02T12:00:00Z') },
      });
      expect(failuresOf(makeLoad(), c)).toEqual(['DOCUMENTS']);
    },
  );

  it('fails when documents are missing entirely', () => {
    expect(
      failuresOf(makeLoad(), makeCandidate({ driver: { complianceValidUntil: null } })),
    ).toEqual(['DOCUMENTS']);
  });
});

describe('7. INTERNATIONAL', () => {
  const intl = makeLoad({
    transportScope: 'INTERNATIONAL',
    delivery: { lat: 42.7, lng: 23.32 },
    deliveryCountry: 'BG',
    deliveryCity: 'Sofya',
    routeDistanceKm: 560,
  });
  const intlTruck = makeCandidate({
    posting: { acceptsInternational: true, maxDeadheadKm: 300 },
    carrier: { intlValidUntil: new Date('2027-06-01') },
    driver: { intlValidUntil: new Date('2027-06-01'), visaCountries: ['SCHENGEN'] },
  });

  it('passes with C2/R1, passport and Schengen visa', () => {
    expect(foreignCountries(intl)).toEqual(['BG']);
    expect(run(intl, intlTruck).pass).toBe(true);
  });

  it.each([
    [
      'posting refuses international',
      { posting: { acceptsInternational: false, maxDeadheadKm: 300 } },
    ],
    ['no authorization', { carrier: { intlValidUntil: null } }],
    ['no visa', { driver: { intlValidUntil: new Date('2027-06-01'), visaCountries: [] } }],
    [
      'passport expires',
      { driver: { intlValidUntil: new Date('2026-10-01'), visaCountries: ['SCHENGEN'] } },
    ],
  ])('fails when %s', (_, patch) => {
    const c = makeCandidate({
      posting: { ...intlTruck.posting, ...(patch as { posting?: object }).posting },
      carrier: { ...intlTruck.carrier, ...(patch as { carrier?: object }).carrier },
      driver: { ...intlTruck.driver, ...(patch as { driver?: object }).driver },
    });
    expect(failuresOf(intl, c)).toEqual(['INTERNATIONAL']);
  });

  it('visa-free countries need no visa; unknown countries need an explicit entry', () => {
    const ge = makeLoad({ ...intl, deliveryCountry: 'GE' });
    const noVisa = makeCandidate({
      ...intlTruck,
      driver: { ...intlTruck.driver, visaCountries: [] },
    });
    expect(run(ge, noVisa).pass).toBe(true);
    const xx = makeLoad({ ...intl, deliveryCountry: 'XX' });
    expect(failuresOf(xx, noVisa)).toEqual(['INTERNATIONAL']);
  });
});

describe('8. STATUS', () => {
  it.each([
    ['load cancelled', makeLoad({ status: 'CANCELLED' }), makeCandidate()],
    ['load in moderation', makeLoad({ moderationStatus: 'PENDING_REVIEW' }), makeCandidate()],
    [
      'shipper unverified',
      makeLoad({ shipper: { verificationStatus: 'PENDING' } }),
      makeCandidate(),
    ],
    ['posting reserved', makeLoad(), makeCandidate({ posting: { status: 'RESERVED' } })],
    ['posting paused', makeLoad(), makeCandidate({ posting: { pausedAt: new Date() } })],
    ['carrier suspended', makeLoad(), makeCandidate({ carrier: { status: 'SUSPENDED' } })],
    ['vehicle in service', makeLoad(), makeCandidate({ vehicle: { status: 'IN_SERVICE' } })],
    ['driver inactive', makeLoad(), makeCandidate({ driver: { status: 'INACTIVE' } })],
  ])('fails when %s', (_, l, c) => expect(failuresOf(l, c)).toEqual(['STATUS']));

  it('MATCHING and OFFERED loads are still open', () => {
    expect(run(makeLoad({ status: 'MATCHING' })).pass).toBe(true);
    expect(run(makeLoad({ status: 'OFFERED' })).pass).toBe(true);
    expect(run(makeLoad({ moderationStatus: 'APPROVED' })).pass).toBe(true);
  });
});

describe('9. BLOCKED', () => {
  it('fails when either side blocked the other', () => {
    expectOnly(['BLOCKED'], makeLoad(), makeCandidate({ blocked: true }));
  });
  it('invite-only loads only match invited carriers', () => {
    const l = makeLoad({ visibility: 'INVITED_ONLY', invitedCarrierCompanyIds: ['someone-else'] });
    expectOnly(['BLOCKED'], l);
    expect(
      run(makeLoad({ visibility: 'INVITED_ONLY', invitedCarrierCompanyIds: ['carrier-1'] })).pass,
    ).toBe(true);
  });
});

describe('10. DEADHEAD', () => {
  it('fails beyond the carrier limit', () => {
    expectOnly(['DEADHEAD'], makeLoad(), makeCandidate({ posting: { maxDeadheadKm: 10 } }));
  });
});

describe('11. SELF_DEALING (#14)', () => {
  it('a BOTH company cannot haul its own load', () => {
    expectOnly(['SELF_DEALING'], makeLoad({ shipperCompanyId: 'carrier-1' }));
  });
});

describe('12. ROUTE_DEVIATION', () => {
  const corridor = (maxKm: number) =>
    makeCandidate({
      posting: {
        maxRouteDeviationKm: maxKm,
        preferredDestinations: [{ country: 'TR', city: 'Ankara', lat: 39.93, lng: 32.86 }],
      },
    });

  it('passes when delivery is on the corridor', () => {
    expect(run(makeLoad(), corridor(30)).pass).toBe(true);
  });

  it('fails when delivery deviates too much', () => {
    const izmir = makeLoad({ delivery: { lat: 38.42, lng: 27.14 }, deliveryCity: 'İzmir' });
    expect(failuresOf(izmir, corridor(50))).toEqual(['ROUTE_DEVIATION']);
  });

  it('is ignored when the carrier set no limit or no coordinates', () => {
    const noLimit = makeCandidate({
      posting: {
        preferredDestinations: [{ country: 'TR', city: 'Ankara', lat: 39.93, lng: 32.86 }],
      },
    });
    const izmir = makeLoad({ delivery: { lat: 38.42, lng: 27.14 }, deliveryCity: 'İzmir' });
    expect(run(izmir, noLimit).pass).toBe(true);
    const noCoords = makeCandidate({
      posting: {
        maxRouteDeviationKm: 1,
        preferredDestinations: [{ country: 'TR', city: 'Ankara' }],
      },
    });
    expect(run(izmir, noCoords).pass).toBe(true);
  });
});

describe('multiple failures are all reported', () => {
  it('collects every failing filter', () => {
    const r = run(
      makeLoad({ weightKg: 30000, isAdr: true, adrClass: '3' }),
      makeCandidate({ trailer: { trailerType: 'DAMPERLI' }, blocked: true }),
    );
    expect(r.failures).toEqual(['TRAILER_TYPE', 'CAPACITY', 'ADR', 'BLOCKED']);
  });
});
