import { Decimal, type Currency } from '@logimatch/shared';
import type { MatchCandidate, MatchContext, MatchLoad } from './types';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Date | Decimal | unknown[] | null | undefined
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function merge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] =
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      !(v instanceof Date) &&
      !(v instanceof Decimal) &&
      b &&
      typeof b === 'object'
        ? merge(b, v)
        : v;
  }
  return out as T;
}

export const NOW = new Date('2026-10-01T00:00:00Z');
const FAR = new Date('2027-12-31T00:00:00Z');

// İstanbul Tuzla → Ankara Ostim
export function makeLoad(patch?: DeepPartial<MatchLoad>): MatchLoad {
  return merge<MatchLoad>(
    {
      id: 'load-1',
      shipperCompanyId: 'shipper-1',
      status: 'PUBLISHED',
      moderationStatus: 'NOT_REQUIRED',
      shipper: { status: 'ACTIVE', verificationStatus: 'VERIFIED' },
      pickup: { lat: 40.82, lng: 29.3 },
      delivery: { lat: 39.97, lng: 32.75 },
      pickupCountry: 'TR',
      deliveryCountry: 'TR',
      deliveryCity: 'Ankara',
      pickupWindowStart: new Date('2026-10-01T06:00:00Z'),
      pickupWindowEnd: new Date('2026-10-01T12:00:00Z'),
      deliveryWindowEnd: new Date('2026-10-02T18:00:00Z'),
      stops: [],
      weightKg: 20000,
      volumeM3: 70,
      loadingMeters: 13.6,
      palletCount: 33,
      palletType: 'EUR',
      requiredTrailerTypes: ['TENTELI', 'MEGA'],
      requiredFeatures: [],
      isAdr: false,
      requiresTempControl: false,
      transportScope: 'DOMESTIC',
      pricingMode: 'OPEN_TO_OFFER',
      budgetMin: new Decimal(24000),
      budgetMax: new Decimal(30000),
      currency: 'TRY',
      routeDistanceKm: 450,
      visibility: 'PUBLIC',
      invitedCarrierCompanyIds: [],
    },
    patch,
  );
}

// Gebze'de boş tenteli
export function makeCandidate(patch?: DeepPartial<MatchCandidate>): MatchCandidate {
  return merge<MatchCandidate>(
    {
      posting: {
        id: 'posting-1',
        carrierCompanyId: 'carrier-1',
        status: 'ACTIVE',
        pausedAt: null,
        availableFrom: new Date('2026-09-30T20:00:00Z'),
        availableUntil: new Date('2026-10-01T18:00:00Z'),
        origin: { lat: 40.8, lng: 29.43 },
        preferredDestinations: [],
        maxDeadheadKm: 200,
        maxRouteDeviationKm: null,
        minPricePerKm: new Decimal(50),
        currency: 'TRY',
        acceptsAdr: false,
        acceptsPartialLoad: false,
        acceptsInternational: false,
      },
      trailer: {
        trailerType: 'TENTELI',
        capacityKg: 24000,
        volumeM3: 90,
        loadingMeters: 13.6,
        palletCapacity: 33,
        lengthCm: 1360,
        widthCm: 248,
        heightCm: 270,
        features: ['SIDE_OPENING'],
        minTempC: null,
        maxTempC: null,
        status: 'ACTIVE',
        complianceValidUntil: FAR,
        adrValidUntil: null,
      },
      vehicle: { status: 'ACTIVE', complianceValidUntil: FAR },
      driver: {
        status: 'ACTIVE',
        adrClasses: [],
        visaCountries: [],
        homeBase: null,
        complianceValidUntil: FAR,
        adrValidUntil: null,
        intlValidUntil: null,
      },
      carrier: {
        id: 'carrier-1',
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        complianceValidUntil: FAR,
        intlValidUntil: null,
        home: null,
      },
      stats: {
        ratingCount: 0,
        ratingAvg: 0,
        completed: 0,
        carrierCancelled: 0,
        noShow: 0,
        noShow90: 0,
        carrierCancel90: 0,
      },
      pair: { goodCount: 0, lastDisputeLostAt: null },
      blocked: false,
    },
    patch,
  );
}

const RATES: Record<string, number> = { EURTRY: 40, USDTRY: 35, EURUSD: 40 / 35 };

export function makeCtx(patch?: Partial<MatchContext>): MatchContext {
  return {
    now: NOW,
    visaGroups: { BG: 'SCHENGEN', RO: 'SCHENGEN', DE: 'SCHENGEN', GE: null },
    fx: (amount: Decimal, from: Currency, to: Currency) => {
      if (from === to) return amount;
      const direct = RATES[`${from}${to}`];
      if (direct) return amount.times(direct);
      return amount.div(RATES[`${to}${from}`]!);
    },
    ...patch,
  };
}

export const FAR_FUTURE = FAR;
