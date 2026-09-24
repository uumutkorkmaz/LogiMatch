// API yanıtlarının web tarafında kullanılan alanları. Para ve Decimal alanları string gelir.
import type {
  CompanyRole,
  CompanyStatus,
  CompanyType,
  Currency,
  DocumentStatus,
  DocumentType,
  LoadStatus,
  MatchStatus,
  OfferStatus,
  PartySide,
  ShipmentStatus,
  TrailerFeature,
  TrailerType,
  TruckPostingStatus,
  UserRole,
  VerificationStatus,
} from '@logimatch/shared';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CompanyLite {
  id: string;
  legalName: string;
  tradeName: string | null;
  city: string;
  type: CompanyType;
  status: CompanyStatus;
  verificationStatus: VerificationStatus;
  phone?: string | null;
  email?: string | null;
  taxNumber?: string;
  taxOffice?: string;
  address?: string;
  district?: string | null;
}

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: UserRole;
  locale: 'tr' | 'en';
  emailVerifiedAt: string | null;
  activeCompanyId: string | null;
  memberships: { companyId: string; companyRole: CompanyRole; company: CompanyLite }[];
  driver: { id: string; carrierCompanyId: string } | null;
}

export interface MaskedCompany {
  id: string;
  masked: true;
  alias: string;
  city: string;
  verified: boolean;
  rating: number | null;
  ratingCount: number;
  completedShipments: number;
  memberSinceYear: number;
}

export interface LoadStop {
  id: string;
  sequence: number;
  type: 'PICKUP' | 'DELIVERY';
  address: string;
  city: string;
  district: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  windowStart: string;
  windowEnd: string;
}

export interface Load {
  id: string;
  referenceNo: string;
  shipperCompanyId: string;
  status: LoadStatus;
  moderationStatus: 'NOT_REQUIRED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  geocodeStatus: 'OK' | 'FAILED' | 'MANUAL_PIN';
  routeStatus: 'PENDING' | 'OK' | 'ROUTE_NOT_FOUND';
  pickupAddress: string;
  pickupCity: string;
  pickupDistrict: string | null;
  pickupCountry: string;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDistrict: string | null;
  deliveryCountry: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  cargoType: string;
  cargoDescription: string | null;
  weightKg: number;
  volumeM3: number | null;
  loadingMeters: number | null;
  palletCount: number | null;
  requiredTrailerTypes: TrailerType[];
  requiredFeatures: TrailerFeature[];
  isAdr: boolean;
  adrClass: string | null;
  unNumber: string | null;
  requiresTempControl: boolean;
  minTempC: number | null;
  maxTempC: number | null;
  transportScope: 'DOMESTIC' | 'INTERNATIONAL';
  pricingMode: 'FIXED' | 'OPEN_TO_OFFER';
  budgetMin: string | null;
  budgetMax: string | null;
  estimatedPriceMin: string | null;
  estimatedPriceMax: string | null;
  currency: Currency;
  paymentTerm: string;
  routeDistanceKm: number | null;
  routeDurationMin: number | null;
  publishedAt: string | null;
  expiresAt: string | null;
  stops: LoadStop[];
  viewerSide?: 'OWNER' | 'PUBLIC' | 'CARRIER_ASSIGNED';
  shipper?: MaskedCompany;
  shipperCompany?: CompanyLite | MaskedCompany;
  _count?: { matches: number; offers: number };
}

export interface Trailer {
  id: string;
  plate: string;
  trailerType: TrailerType;
  capacityKg: number;
  volumeM3: number;
  loadingMeters: number;
  palletCapacity: number;
  axleCount: number;
  features: TrailerFeature[];
  minTempC: number | null;
  maxTempC: number | null;
  status: 'ACTIVE' | 'IN_SERVICE' | 'INACTIVE';
  complianceValidUntil: string | null;
}

export interface Vehicle {
  id: string;
  plate: string;
  type: string;
  brand: string;
  model: string;
  year: number;
  euroNorm: string | null;
  status: 'ACTIVE' | 'IN_SERVICE' | 'INACTIVE';
  complianceValidUntil: string | null;
}

export interface Driver {
  id: string;
  fullName: string;
  phone: string | null;
  srcTypes: string[];
  adrClasses: string[];
  visaCountries: string[];
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
  complianceValidUntil: string | null;
}

export interface Posting {
  id: string;
  referenceNo: string;
  carrierCompanyId: string;
  status: TruckPostingStatus;
  availableFrom: string;
  availableUntil: string;
  originAddress: string | null;
  originCity: string;
  originDistrict: string | null;
  originLat: number;
  originLng: number;
  preferredDestinations: { country: string; city: string | null }[];
  maxDeadheadKm: number;
  minPricePerKm: string | null;
  currency: Currency;
  acceptsAdr: boolean;
  acceptsPartialLoad: boolean;
  acceptsInternational: boolean;
  pausedAt: string | null;
  vehicle: Partial<Vehicle>;
  trailer: Partial<Trailer>;
  driver: Partial<Driver>;
  carrierCompany?: CompanyLite | MaskedCompany;
  carrier?: MaskedCompany;
  viewerSide?: string;
}

export interface ScoreComponentView {
  value: number;
  weight: number;
  contribution: number;
  inputs: Record<string, unknown>;
}

export interface Offer {
  id: string;
  matchId: string;
  loadId: string;
  offeredBy: PartySide;
  offeredByCompanyId: string;
  amount: string;
  currency: Currency;
  validUntil: string;
  note: string | null;
  status: OfferStatus;
  round: number;
  parentOfferId: string | null;
  aboveBudgetWarning: boolean;
  createdAt: string;
  direction?: 'incoming' | 'outgoing';
  load?: Pick<
    Load,
    | 'id'
    | 'referenceNo'
    | 'pickupCity'
    | 'deliveryCity'
    | 'budgetMin'
    | 'budgetMax'
    | 'currency'
    | 'pricingMode'
  >;
}

export interface Match {
  id: string;
  loadId: string;
  truckPostingId: string;
  score: string;
  deadheadKm: number;
  status: MatchStatus;
  direction: string;
  scoreBreakdown: {
    total: number;
    components: Record<string, ScoreComponentView>;
    reasons: string[];
  };
  viewerSide: 'SHIPPER' | 'CARRIER' | 'STAFF';
  contactRevealed: boolean;
  load: Load & { shipperCompany: CompanyLite | MaskedCompany };
  truckPosting: Posting;
  offers: Offer[];
  shipment: { id: string; referenceNo: string; status: ShipmentStatus } | null;
  conversation: { id: string } | null;
}

export interface ShipmentEvent {
  id: string;
  type: string;
  fromStatus: ShipmentStatus | null;
  toStatus: ShipmentStatus | null;
  actorRole: string | null;
  occurredAt: string;
  note: string | null;
  payload: Record<string, unknown> | null;
}

export interface Shipment {
  id: string;
  referenceNo: string;
  loadId: string;
  status: ShipmentStatus;
  currency: Currency;
  agreedAmount: string;
  commissionAmount: string;
  carrierPayout: string;
  shipperTotal: string;
  commissionModel: string;
  plannedPickupAt: string;
  plannedDeliveryAt: string;
  deadheadKm: number;
  cancellationReason: string | null;
  cancellationFee: string | null;
  cancelledBy: string | null;
  noShow: boolean;
  completedAt: string | null;
  shipperCompanyId: string;
  carrierCompanyId: string;
  load: Load;
  shipperCompany: CompanyLite;
  carrierCompany: CompanyLite;
  vehicle: Vehicle;
  trailer: Trailer;
  driver: Driver;
  conversation: { id: string } | null;
  disputes: { id: string; status: string; reason: string }[];
  viewerRole?: 'SHIPPER' | 'CARRIER' | 'DRIVER' | 'OPS';
  availableEvents?: string[];
}

export interface InvoiceCalcView {
  subtotal: string;
  vatRate: string;
  vatAmount: string;
  withholdingRatio: string;
  withholdingAmount: string;
  total: string;
  payable: string;
}

export interface Settlement {
  currency: Currency;
  kind: 'DELIVERED' | 'CANCELLED';
  commissionRate: string;
  transport: InvoiceCalcView | null;
  commission: { payer: PartySide; invoice: InvoiceCalcView }[];
  cancellation: { payer: PartySide; invoice: InvoiceCalcView; platformCut: string } | null;
  shipper: { toCarrier: string; toTaxOffice: string; toPlatform: string; total: string };
  carrier: { fromShipper: string; toPlatform: string; net: string };
}

export interface Invoice {
  id: string;
  number: string;
  kind: 'TRANSPORT' | 'COMMISSION' | 'CANCELLATION_FEE';
  total: string;
  payableAmount: string;
  currency: Currency;
  issuerIsPlatform: boolean;
}

export interface DocumentRow {
  id: string;
  ownerType: string;
  ownerId: string;
  type: DocumentType;
  status: DocumentStatus;
  fileName: string;
  expiresAt: string | null;
  rejectionReason: string | null;
  url: string;
  createdAt: string;
  company?: { id: string; legalName: string; type: CompanyType };
}

export interface Notification {
  id: string;
  template: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  contextType: 'MATCH' | 'SHIPMENT';
  matchId: string | null;
  shipmentId: string | null;
  contactRevealed: boolean;
  unread: number;
  lastMessage: { body: string; createdAt: string } | null;
  match: {
    id: string;
    status: MatchStatus;
    load: { referenceNo: string; pickupCity: string; deliveryCity: string };
  } | null;
  shipment: { id: string; referenceNo: string; status: ShipmentStatus } | null;
}

export interface Message {
  id: string;
  body: string;
  mine: boolean;
  contactMasked: boolean;
  createdAt: string;
  sender: { id: string; fullName: string | null };
}
