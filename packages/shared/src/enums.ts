// Prisma şemasındaki enum'ların framework'ten bağımsız kopyası (web de kullanır).
// apps/api içindeki bir test, değerlerin Prisma ile birebir aynı olduğunu doğrular.

const e = <const T extends readonly [string, ...string[]]>(...values: T) => values;

export const USER_ROLES = e('SHIPPER_USER', 'CARRIER_USER', 'DRIVER', 'ADMIN', 'OPS');
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = e('PENDING', 'ACTIVE', 'SUSPENDED', 'BANNED');
export type UserStatus = (typeof USER_STATUSES)[number];

export const COMPANY_TYPES = e('SHIPPER', 'CARRIER', 'BOTH');
export type CompanyType = (typeof COMPANY_TYPES)[number];

export const COMPANY_STATUSES = e('ACTIVE', 'UNDER_REVIEW', 'SUSPENDED');
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const VERIFICATION_STATUSES = e('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const COMPANY_ROLES = e('OWNER', 'MANAGER', 'DISPATCHER', 'ACCOUNTANT');
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export const DOCUMENT_OWNER_TYPES = e('COMPANY', 'VEHICLE', 'TRAILER', 'DRIVER', 'SHIPMENT');
export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];

export const DOCUMENT_TYPES = e(
  'K1',
  'K2',
  'K3',
  'L1',
  'L2',
  'C2',
  'C3',
  'R1',
  'R2',
  'SRC1',
  'SRC2',
  'SRC3',
  'SRC4',
  'SRC5',
  'PSIKOTEKNIK',
  'ADR_CERTIFICATE',
  'DRIVING_LICENSE',
  'VEHICLE_LICENSE',
  'INSPECTION',
  'CMR_INSURANCE',
  'CARGO_INSURANCE',
  'CARRIER_LIABILITY',
  'TAX_CERTIFICATE',
  'SIGNATURE_CIRCULAR',
  'ACTIVITY_CERTIFICATE',
  'TIR_CARNET',
  'ATP_CERTIFICATE',
  'IRSALIYE',
  'POD',
  'CMR',
  'PASSPORT',
  'VISA',
  'OTHER',
);
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = e('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const REQUIREMENT_SCOPES = e('DOMESTIC', 'INTERNATIONAL', 'ADR', 'TEMP_CONTROLLED');
export type RequirementScope = (typeof REQUIREMENT_SCOPES)[number];

export const VEHICLE_TYPES = e('TRACTOR', 'TRUCK', 'VAN', 'LIGHT_TRUCK');
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const ASSET_STATUSES = e('ACTIVE', 'IN_SERVICE', 'INACTIVE');
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const DRIVER_STATUSES = e('ACTIVE', 'ON_LEAVE', 'INACTIVE');
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const TRAILER_TYPES = e(
  'TENTELI',
  'KAPALI_KASA',
  'FRIGORIFIK',
  'ACIK_PLATFORM',
  'LOWBED',
  'DAMPERLI',
  'SILOBAS',
  'TANKER',
  'KONTEYNER_SASI',
  'KIRKAYAK',
  'JUMBO',
  'MEGA',
  'FRIGO_ATP',
  'HAYVAN_NAKLIYE',
  'OTO_TASIYICI',
  'VINCLI',
);
export type TrailerType = (typeof TRAILER_TYPES)[number];

export const TRAILER_FEATURES = e(
  'TAIL_LIFT',
  'CRANE',
  'ADR',
  'TEMP_CONTROLLED',
  'GPS',
  'DOUBLE_DECK',
  'SIDE_OPENING',
  'TOP_OPENING',
);
export type TrailerFeature = (typeof TRAILER_FEATURES)[number];

export const STOP_TYPES = e('PICKUP', 'DELIVERY');
export type StopType = (typeof STOP_TYPES)[number];

export const PALLET_TYPES = e('EUR', 'IND');
export type PalletType = (typeof PALLET_TYPES)[number];

export const HANDLING_METHODS = e('RAMPA', 'VINC', 'FORKLIFT', 'ELLE');
export type HandlingMethod = (typeof HANDLING_METHODS)[number];

export const TRANSPORT_SCOPES = e('DOMESTIC', 'INTERNATIONAL');
export type TransportScope = (typeof TRANSPORT_SCOPES)[number];

export const PRICING_MODES = e('FIXED', 'OPEN_TO_OFFER');
export type PricingMode = (typeof PRICING_MODES)[number];

export const CURRENCIES = e('TRY', 'EUR', 'USD');
export type Currency = (typeof CURRENCIES)[number];

export const PAYMENT_TERMS = e('PESIN', 'VADELI_30', 'VADELI_60', 'KAPIDA');
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];

export const LOAD_STATUSES = e(
  'DRAFT',
  'PUBLISHED',
  'MATCHING',
  'OFFERED',
  'ASSIGNED',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
);
export type LoadStatus = (typeof LOAD_STATUSES)[number];
/** Eşleştirmeye ve teklife açık durumlar. */
export const OPEN_LOAD_STATUSES: readonly LoadStatus[] = ['PUBLISHED', 'MATCHING', 'OFFERED'];

export const VISIBILITIES = e('PUBLIC', 'INVITED_ONLY');
export type Visibility = (typeof VISIBILITIES)[number];

export const MODERATION_STATUSES = e('NOT_REQUIRED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const GEOCODE_STATUSES = e('OK', 'FAILED', 'MANUAL_PIN');
export type GeocodeStatus = (typeof GEOCODE_STATUSES)[number];

export const ROUTE_STATUSES = e('PENDING', 'OK', 'ROUTE_NOT_FOUND');
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const TRUCK_POSTING_STATUSES = e('DRAFT', 'ACTIVE', 'RESERVED', 'EXPIRED', 'CANCELLED');
export type TruckPostingStatus = (typeof TRUCK_POSTING_STATUSES)[number];

export const MATCH_DIRECTIONS = e('SYSTEM', 'LOAD_INITIATED', 'TRUCK_INITIATED');
export type MatchDirection = (typeof MATCH_DIRECTIONS)[number];

export const MATCH_STATUSES = e(
  'SUGGESTED',
  'VIEWED',
  'INTERESTED_BY_SHIPPER',
  'INTERESTED_BY_CARRIER',
  'MUTUAL',
  'DISMISSED',
  'EXPIRED',
);
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export const OPEN_MATCH_STATUSES: readonly MatchStatus[] = [
  'SUGGESTED',
  'VIEWED',
  'INTERESTED_BY_SHIPPER',
  'INTERESTED_BY_CARRIER',
  'MUTUAL',
];

export const PARTY_SIDES = e('SHIPPER', 'CARRIER');
export type PartySide = (typeof PARTY_SIDES)[number];

export const OFFER_STATUSES = e(
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'COUNTERED',
  'EXPIRED',
  'WITHDRAWN',
);
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const SHIPMENT_STATUSES = e(
  'ASSIGNED',
  'AT_PICKUP',
  'LOADED',
  'IN_TRANSIT',
  'AT_DELIVERY',
  'DELIVERED',
  'POD_SUBMITTED',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
);
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
/** Araç/dorse/şoförü meşgul eden durumlar (EXCLUDE kısıtı ile aynı küme). */
export const ACTIVE_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'ASSIGNED',
  'AT_PICKUP',
  'LOADED',
  'IN_TRANSIT',
  'AT_DELIVERY',
];

export const COMMISSION_MODELS = e('SHIPPER_PAYS', 'CARRIER_PAYS', 'SPLIT');
export type CommissionModel = (typeof COMMISSION_MODELS)[number];

export const CANCELLED_BY = e('SHIPPER', 'CARRIER', 'PLATFORM');
export type CancelledBy = (typeof CANCELLED_BY)[number];

export const SHIPMENT_EVENT_TYPES = e(
  'STATUS_CHANGED',
  'DEPARTED_TO_PICKUP',
  'NOTE',
  'DOCUMENT_ADDED',
  'DELAY_REPORTED',
  'CANCELLED',
  'DISPUTE_OPENED',
  'DISPUTE_RESOLVED',
);
export type ShipmentEventType = (typeof SHIPMENT_EVENT_TYPES)[number];

export const DISPUTE_STATUSES = e('OPEN', 'RESOLVED');
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const CONVERSATION_CONTEXTS = e('MATCH', 'SHIPMENT');
export type ConversationContext = (typeof CONVERSATION_CONTEXTS)[number];

export const INVOICE_KINDS = e('TRANSPORT', 'COMMISSION', 'CANCELLATION_FEE');
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_STATUSES = e('DRAFT', 'ISSUED', 'PAID');
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const NOTIFICATION_CHANNELS = e('IN_APP', 'EMAIL', 'SMS', 'PUSH');
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const RISK_FLAG_TYPES = e(
  'DUPLICATE_TAX_NUMBER',
  'DUPLICATE_PHONE',
  'DUPLICATE_IBAN',
  'CONTACT_LEAK',
  'NO_SHOW_STREAK',
  'LISTING_REVIEW',
  'PRICE_ANOMALY',
);
export type RiskFlagType = (typeof RISK_FLAG_TYPES)[number];

export const RISK_FLAG_STATUSES = e('OPEN', 'RESOLVED', 'DISMISSED');
export type RiskFlagStatus = (typeof RISK_FLAG_STATUSES)[number];
