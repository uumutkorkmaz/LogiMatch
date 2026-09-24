import type {
  AssetStatus,
  CompanyStatus,
  Currency,
  Decimal,
  DriverStatus,
  LatLng,
  LoadStatus,
  ModerationStatus,
  PalletType,
  PricingMode,
  StopType,
  TrailerFeature,
  TrailerType,
  TransportScope,
  TruckPostingStatus,
  VerificationStatus,
  Visibility,
} from '@logimatch/shared';

/** Eşleştirmenin gördüğü yük (DB'den bağımsız düz nesne). */
export interface MatchLoad {
  id: string;
  shipperCompanyId: string;
  status: LoadStatus;
  moderationStatus: ModerationStatus;
  shipper: { status: CompanyStatus; verificationStatus: VerificationStatus };
  pickup: LatLng;
  delivery: LatLng;
  pickupCountry: string;
  deliveryCountry: string;
  deliveryCity: string;
  pickupWindowStart: Date;
  pickupWindowEnd: Date;
  deliveryWindowEnd: Date;
  /** Tüm duraklar sırasıyla (ilk yükleme ve son teslim dahil). Boşsa tek duraklı. */
  stops: {
    type: StopType;
    lat: number;
    lng: number;
    weightKg?: number | null;
    volumeM3?: number | null;
    loadingMeters?: number | null;
    palletCount?: number | null;
  }[];
  weightKg: number;
  volumeM3?: number | null;
  loadingMeters?: number | null;
  palletCount?: number | null;
  palletType?: PalletType | null;
  maxPieceLengthCm?: number | null;
  maxPieceWidthCm?: number | null;
  maxPieceHeightCm?: number | null;
  requiredTrailerTypes: TrailerType[];
  requiredFeatures: TrailerFeature[];
  isAdr: boolean;
  adrClass?: string | null;
  requiresTempControl: boolean;
  minTempC?: number | null;
  maxTempC?: number | null;
  transportScope: TransportScope;
  pricingMode: PricingMode;
  budgetMin?: Decimal | null;
  budgetMax?: Decimal | null;
  estimatedPriceMin?: Decimal | null;
  estimatedPriceMax?: Decimal | null;
  currency: Currency;
  routeDistanceKm?: number | null;
  visibility: Visibility;
  invitedCarrierCompanyIds: string[];
}

export interface PreferredDestination {
  country: string;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** Aday araç: ilan + dorse + çekici + şoför + firma + istatistikler. */
export interface MatchCandidate {
  posting: {
    id: string;
    carrierCompanyId: string;
    status: TruckPostingStatus;
    pausedAt?: Date | null;
    availableFrom: Date;
    availableUntil: Date;
    origin: LatLng;
    preferredDestinations: PreferredDestination[];
    maxDeadheadKm: number;
    maxRouteDeviationKm?: number | null;
    minPricePerKm?: Decimal | null;
    currency: Currency;
    acceptsAdr: boolean;
    acceptsPartialLoad: boolean;
    acceptsInternational: boolean;
  };
  trailer: {
    trailerType: TrailerType;
    capacityKg: number;
    volumeM3: number;
    loadingMeters: number;
    palletCapacity: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    features: TrailerFeature[];
    minTempC?: number | null;
    maxTempC?: number | null;
    status: AssetStatus;
    complianceValidUntil?: Date | null;
    adrValidUntil?: Date | null;
  };
  vehicle: { status: AssetStatus; complianceValidUntil?: Date | null };
  driver: {
    status: DriverStatus;
    adrClasses: string[];
    visaCountries: string[];
    homeBase?: LatLng | null;
    complianceValidUntil?: Date | null;
    adrValidUntil?: Date | null;
    intlValidUntil?: Date | null;
  };
  carrier: {
    id: string;
    status: CompanyStatus;
    verificationStatus: VerificationStatus;
    complianceValidUntil?: Date | null;
    intlValidUntil?: Date | null;
    home?: LatLng | null;
  };
  stats: {
    ratingCount: number;
    ratingAvg: number;
    completed: number;
    carrierCancelled: number;
    noShow: number;
    noShow90: number;
    carrierCancel90: number;
  };
  pair: { goodCount: number; lastDisputeLostAt?: Date | null };
  /** İki yönlü BlockList kaydı var mı */
  blocked: boolean;
}

export interface MatchContext {
  now: Date;
  /** Ülke kodu → vize grubu (null = vize gerekmez) */
  visaGroups: Record<string, string | null>;
  fx: (amount: Decimal, from: Currency, to: Currency) => Decimal;
}

export interface MatchingWeights {
  proximity: number;
  routeFit: number;
  priceFit: number;
  reliability: number;
  timeFit: number;
  equipmentFit: number;
  history: number;
}

export interface MatchingParams {
  weights: MatchingWeights;
  threshold: number;
  topN: number;
  roadFactor: number;
  avgTruckSpeedKmh: number;
  candidateLimit: number;
}

export const DEFAULT_MATCHING_PARAMS: MatchingParams = {
  weights: {
    proximity: 0.25,
    routeFit: 0.2,
    priceFit: 0.15,
    reliability: 0.15,
    timeFit: 0.1,
    equipmentFit: 0.08,
    history: 0.07,
  },
  threshold: 40,
  topN: 20,
  roadFactor: 1.25,
  avgTruckSpeedKmh: 65,
  candidateLimit: 500,
};

export type HardFilterCode =
  | 'TRAILER_TYPE'
  | 'CAPACITY'
  | 'TIME_WINDOW'
  | 'ADR'
  | 'TEMPERATURE'
  | 'DOCUMENTS'
  | 'INTERNATIONAL'
  | 'STATUS'
  | 'BLOCKED'
  | 'DEADHEAD'
  | 'SELF_DEALING'
  | 'ROUTE_DEVIATION';

export interface Derived {
  deadheadKm: number;
  etaToPickup: Date;
  earliestArrival: Date;
  loadDistanceKm: number;
}

export interface HardFilterResult {
  pass: boolean;
  failures: HardFilterCode[];
  derived: Derived;
}

export type ScoreComponent = keyof MatchingWeights;

export type MatchReason =
  | 'NEAR_PICKUP'
  | 'BACKHAUL_HOME'
  | 'PREFERRED_DESTINATION'
  | 'PRICE_WITHIN_BUDGET'
  | 'HIGHLY_RATED'
  | 'GOOD_UTILIZATION'
  | 'WORKED_TOGETHER'
  | 'WIDE_TIME_OVERLAP';

export interface ScoreBreakdown {
  version: 1;
  total: number;
  components: Record<
    ScoreComponent,
    { value: number; weight: number; contribution: number; inputs: Record<string, unknown> }
  >;
  reasons: MatchReason[];
}

export interface ScoredMatch {
  loadId: string;
  truckPostingId: string;
  score: number;
  deadheadKm: number;
  breakdown: ScoreBreakdown;
}
