-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SHIPPER_USER', 'CARRIER_USER', 'DRIVER', 'ADMIN', 'OPS');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('tr', 'en');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('SHIPPER', 'CARRIER', 'BOTH');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'UNDER_REVIEW', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('OWNER', 'MANAGER', 'DISPATCHER', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('COMPANY', 'VEHICLE', 'TRAILER', 'DRIVER', 'SHIPMENT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('K1', 'K2', 'K3', 'L1', 'L2', 'C2', 'C3', 'R1', 'R2', 'SRC1', 'SRC2', 'SRC3', 'SRC4', 'SRC5', 'PSIKOTEKNIK', 'ADR_CERTIFICATE', 'DRIVING_LICENSE', 'VEHICLE_LICENSE', 'INSPECTION', 'CMR_INSURANCE', 'CARGO_INSURANCE', 'CARRIER_LIABILITY', 'TAX_CERTIFICATE', 'SIGNATURE_CIRCULAR', 'ACTIVITY_CERTIFICATE', 'TIR_CARNET', 'ATP_CERTIFICATE', 'IRSALIYE', 'POD', 'CMR', 'PASSPORT', 'VISA', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RequirementScope" AS ENUM ('DOMESTIC', 'INTERNATIONAL', 'ADR', 'TEMP_CONTROLLED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('TRACTOR', 'TRUCK', 'VAN', 'LIGHT_TRUCK');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'IN_SERVICE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TrailerType" AS ENUM ('TENTELI', 'KAPALI_KASA', 'FRIGORIFIK', 'ACIK_PLATFORM', 'LOWBED', 'DAMPERLI', 'SILOBAS', 'TANKER', 'KONTEYNER_SASI', 'KIRKAYAK', 'JUMBO', 'MEGA', 'FRIGO_ATP', 'HAYVAN_NAKLIYE', 'OTO_TASIYICI', 'VINCLI');

-- CreateEnum
CREATE TYPE "TrailerFeature" AS ENUM ('TAIL_LIFT', 'CRANE', 'ADR', 'TEMP_CONTROLLED', 'GPS', 'DOUBLE_DECK', 'SIDE_OPENING', 'TOP_OPENING');

-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "PalletType" AS ENUM ('EUR', 'IND');

-- CreateEnum
CREATE TYPE "HandlingMethod" AS ENUM ('RAMPA', 'VINC', 'FORKLIFT', 'ELLE');

-- CreateEnum
CREATE TYPE "TransportScope" AS ENUM ('DOMESTIC', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('FIXED', 'OPEN_TO_OFFER');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('TRY', 'EUR', 'USD');

-- CreateEnum
CREATE TYPE "PaymentTerm" AS ENUM ('PESIN', 'VADELI_30', 'VADELI_60', 'KAPIDA');

-- CreateEnum
CREATE TYPE "LoadStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'MATCHING', 'OFFERED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'INVITED_ONLY');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GeocodeStatus" AS ENUM ('OK', 'FAILED', 'MANUAL_PIN');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('PENDING', 'OK', 'ROUTE_NOT_FOUND');

-- CreateEnum
CREATE TYPE "TruckPostingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RESERVED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchDirection" AS ENUM ('SYSTEM', 'LOAD_INITIATED', 'TRUCK_INITIATED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SUGGESTED', 'VIEWED', 'INTERESTED_BY_SHIPPER', 'INTERESTED_BY_CARRIER', 'MUTUAL', 'DISMISSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PartySide" AS ENUM ('SHIPPER', 'CARRIER');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('ASSIGNED', 'AT_PICKUP', 'LOADED', 'IN_TRANSIT', 'AT_DELIVERY', 'DELIVERED', 'POD_SUBMITTED', 'COMPLETED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "CommissionModel" AS ENUM ('SHIPPER_PAYS', 'CARRIER_PAYS', 'SPLIT');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('SHIPPER', 'CARRIER', 'PLATFORM');

-- CreateEnum
CREATE TYPE "ShipmentEventType" AS ENUM ('STATUS_CHANGED', 'DEPARTED_TO_PICKUP', 'NOTE', 'DOCUMENT_ADDED', 'DELAY_REPORTED', 'CANCELLED', 'DISPUTE_OPENED', 'DISPUTE_RESOLVED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ConversationContext" AS ENUM ('MATCH', 'SHIPMENT');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('TRANSPORT', 'COMMISSION', 'CANCELLATION_FEE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "RiskFlagType" AS ENUM ('DUPLICATE_TAX_NUMBER', 'DUPLICATE_PHONE', 'DUPLICATE_IBAN', 'CONTACT_LEAK', 'NO_SHOW_STREAK', 'LISTING_REVIEW', 'PRICE_ANOMALY');

-- CreateEnum
CREATE TYPE "RiskFlagStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('VERIFY_EMAIL', 'VERIFY_PHONE', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "IdempotencyState" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DISPATCHED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "locale" "Locale" NOT NULL DEFAULT 'tr',
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "phoneVerifiedAt" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "anonymizedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "taxOffice" TEXT NOT NULL,
    "taxNumber" TEXT NOT NULL,
    "mersisNo" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "country" CHAR(2) NOT NULL DEFAULT 'TR',
    "phone" TEXT,
    "email" CITEXT,
    "iban" TEXT,
    "type" "CompanyType" NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMPTZ(3),
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "listingsReviewedCount" INTEGER NOT NULL DEFAULT 0,
    "complianceValidUntil" TIMESTAMPTZ(3),
    "intlValidUntil" TIMESTAMPTZ(3),
    "homeLat" DOUBLE PRECISION,
    "homeLng" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMember" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "companyRole" "CompanyRole" NOT NULL,
    "invitedById" UUID,
    "acceptedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "ownerType" "DocumentOwnerType" NOT NULL,
    "ownerId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "number" TEXT,
    "issuedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" UUID NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "rejectionReason" TEXT,
    "supersedesId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequiredDocumentRule" (
    "id" UUID NOT NULL,
    "ownerType" "DocumentOwnerType" NOT NULL,
    "scope" "RequirementScope" NOT NULL,
    "anyOf" "DocumentType"[],
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequiredDocumentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockList" (
    "id" UUID NOT NULL,
    "blockerCompanyId" UUID NOT NULL,
    "blockedCompanyId" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskFlag" (
    "id" UUID NOT NULL,
    "type" "RiskFlagType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "companyId" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "status" "RiskFlagStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" UUID,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "carrierCompanyId" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "plateNormalized" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "euroNorm" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "complianceValidUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trailer" (
    "id" UUID NOT NULL,
    "carrierCompanyId" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "plateNormalized" TEXT NOT NULL,
    "trailerType" "TrailerType" NOT NULL,
    "isIntegratedBody" BOOLEAN NOT NULL DEFAULT false,
    "capacityKg" INTEGER NOT NULL,
    "volumeM3" DOUBLE PRECISION NOT NULL,
    "lengthCm" INTEGER NOT NULL,
    "widthCm" INTEGER NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "loadingMeters" DOUBLE PRECISION NOT NULL,
    "palletCapacity" INTEGER NOT NULL,
    "axleCount" INTEGER NOT NULL,
    "features" "TrailerFeature"[],
    "minTempC" DOUBLE PRECISION,
    "maxTempC" DOUBLE PRECISION,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "complianceValidUntil" TIMESTAMPTZ(3),
    "adrValidUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Trailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "carrierCompanyId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "licenseClasses" TEXT[],
    "srcTypes" TEXT[],
    "adrClasses" TEXT[],
    "hasPsikoteknik" BOOLEAN NOT NULL DEFAULT false,
    "passportNumber" TEXT,
    "passportValidUntil" TIMESTAMPTZ(3),
    "visaCountries" TEXT[],
    "homeBaseLat" DOUBLE PRECISION,
    "homeBaseLng" DOUBLE PRECISION,
    "homeBaseLocation" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN "homeBaseLat" IS NULL OR "homeBaseLng" IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint("homeBaseLng", "homeBaseLat"), 4326)::geography END) STORED,
    "status" "DriverStatus" NOT NULL DEFAULT 'ACTIVE',
    "complianceValidUntil" TIMESTAMPTZ(3),
    "adrValidUntil" TIMESTAMPTZ(3),
    "intlValidUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Load" (
    "id" UUID NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "shipperCompanyId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupCity" TEXT NOT NULL,
    "pickupDistrict" TEXT,
    "pickupCountry" CHAR(2) NOT NULL DEFAULT 'TR',
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "pickupLocation" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN "pickupLat" IS NULL OR "pickupLng" IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint("pickupLng", "pickupLat"), 4326)::geography END) STORED,
    "pickupWindowStart" TIMESTAMPTZ(3) NOT NULL,
    "pickupWindowEnd" TIMESTAMPTZ(3) NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryCity" TEXT NOT NULL,
    "deliveryDistrict" TEXT,
    "deliveryCountry" CHAR(2) NOT NULL DEFAULT 'TR',
    "deliveryLat" DOUBLE PRECISION,
    "deliveryLng" DOUBLE PRECISION,
    "deliveryLocation" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN "deliveryLat" IS NULL OR "deliveryLng" IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint("deliveryLng", "deliveryLat"), 4326)::geography END) STORED,
    "deliveryWindowStart" TIMESTAMPTZ(3) NOT NULL,
    "deliveryWindowEnd" TIMESTAMPTZ(3) NOT NULL,
    "cargoType" TEXT NOT NULL,
    "cargoDescription" TEXT,
    "weightKg" INTEGER NOT NULL,
    "volumeM3" DOUBLE PRECISION,
    "loadingMeters" DOUBLE PRECISION,
    "palletCount" INTEGER,
    "palletType" "PalletType",
    "isStackable" BOOLEAN NOT NULL DEFAULT false,
    "isFragile" BOOLEAN NOT NULL DEFAULT false,
    "declaredValue" DECIMAL(14,2),
    "maxPieceLengthCm" INTEGER,
    "maxPieceWidthCm" INTEGER,
    "maxPieceHeightCm" INTEGER,
    "requiredTrailerTypes" "TrailerType"[],
    "requiredFeatures" "TrailerFeature"[],
    "isAdr" BOOLEAN NOT NULL DEFAULT false,
    "adrClass" TEXT,
    "unNumber" TEXT,
    "packingGroup" TEXT,
    "requiresTempControl" BOOLEAN NOT NULL DEFAULT false,
    "minTempC" DOUBLE PRECISION,
    "maxTempC" DOUBLE PRECISION,
    "loadingMethod" "HandlingMethod",
    "unloadingMethod" "HandlingMethod",
    "transportScope" "TransportScope" NOT NULL DEFAULT 'DOMESTIC',
    "customsRequired" BOOLEAN NOT NULL DEFAULT false,
    "incoterm" TEXT,
    "pricingMode" "PricingMode" NOT NULL,
    "budgetMin" DECIMAL(14,2),
    "budgetMax" DECIMAL(14,2),
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "paymentTerm" "PaymentTerm" NOT NULL DEFAULT 'VADELI_30',
    "vatRate" DECIMAL(5,4) NOT NULL DEFAULT 0.20,
    "withholdingApplies" BOOLEAN NOT NULL DEFAULT false,
    "estimatedPriceMin" DECIMAL(14,2),
    "estimatedPriceMax" DECIMAL(14,2),
    "routeDistanceKm" DOUBLE PRECISION,
    "routeDurationMin" INTEGER,
    "routeStatus" "RouteStatus" NOT NULL DEFAULT 'PENDING',
    "geocodeStatus" "GeocodeStatus" NOT NULL DEFAULT 'OK',
    "status" "LoadStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "invitedCarrierCompanyIds" UUID[],
    "expiresAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Load_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadStop" (
    "id" UUID NOT NULL,
    "loadId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "StopType" NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "country" CHAR(2) NOT NULL DEFAULT 'TR',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "location" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN "lat" IS NULL OR "lng" IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography END) STORED,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "windowEnd" TIMESTAMPTZ(3) NOT NULL,
    "weightKg" INTEGER,
    "volumeM3" DOUBLE PRECISION,
    "loadingMeters" DOUBLE PRECISION,
    "palletCount" INTEGER,

    CONSTRAINT "LoadStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TruckPosting" (
    "id" UUID NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "carrierCompanyId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "trailerId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "availableFrom" TIMESTAMPTZ(3) NOT NULL,
    "availableUntil" TIMESTAMPTZ(3) NOT NULL,
    "originAddress" TEXT,
    "originCity" TEXT NOT NULL,
    "originDistrict" TEXT,
    "originCountry" CHAR(2) NOT NULL DEFAULT 'TR',
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "originLocation" geography(Point,4326) GENERATED ALWAYS AS (CASE WHEN "originLat" IS NULL OR "originLng" IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint("originLng", "originLat"), 4326)::geography END) STORED,
    "preferredDestinations" JSONB NOT NULL DEFAULT '[]',
    "preferredCities" TEXT[],
    "preferredCountries" TEXT[],
    "maxDeadheadKm" INTEGER NOT NULL,
    "maxRouteDeviationKm" INTEGER,
    "minPricePerKm" DECIMAL(10,2),
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "acceptsAdr" BOOLEAN NOT NULL DEFAULT false,
    "acceptsPartialLoad" BOOLEAN NOT NULL DEFAULT false,
    "acceptsInternational" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" "TruckPostingStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "pausedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TruckPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" UUID NOT NULL,
    "loadId" UUID NOT NULL,
    "truckPostingId" UUID NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "deadheadKm" DOUBLE PRECISION NOT NULL,
    "direction" "MatchDirection" NOT NULL DEFAULT 'SYSTEM',
    "status" "MatchStatus" NOT NULL DEFAULT 'SUGGESTED',
    "shipperInterestAt" TIMESTAMPTZ(3),
    "carrierInterestAt" TIMESTAMPTZ(3),
    "viewedByShipperAt" TIMESTAMPTZ(3),
    "viewedByCarrierAt" TIMESTAMPTZ(3),
    "dismissedBy" "PartySide",
    "dismissReason" TEXT,
    "matchingConfigId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "loadId" UUID NOT NULL,
    "truckPostingId" UUID NOT NULL,
    "offeredBy" "PartySide" NOT NULL,
    "offeredByCompanyId" UUID NOT NULL,
    "offeredByUserId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "validUntil" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "parentOfferId" UUID,
    "round" INTEGER NOT NULL DEFAULT 1,
    "aboveBudgetWarning" BOOLEAN NOT NULL DEFAULT false,
    "respondedAt" TIMESTAMPTZ(3),
    "respondedByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" UUID NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "loadId" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "acceptedOfferId" UUID NOT NULL,
    "truckPostingId" UUID NOT NULL,
    "shipperCompanyId" UUID NOT NULL,
    "carrierCompanyId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "trailerId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "agreedAmount" DECIMAL(14,2) NOT NULL,
    "commissionModel" "CommissionModel" NOT NULL,
    "commissionRate" DECIMAL(7,6) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "shipperCommissionAmount" DECIMAL(14,2) NOT NULL,
    "carrierCommissionAmount" DECIMAL(14,2) NOT NULL,
    "carrierPayout" DECIMAL(14,2) NOT NULL,
    "shipperTotal" DECIMAL(14,2) NOT NULL,
    "vatRate" DECIMAL(5,4) NOT NULL,
    "commissionVatRate" DECIMAL(5,4) NOT NULL,
    "withholdingApplies" BOOLEAN NOT NULL,
    "withholdingRatio" DECIMAL(5,4) NOT NULL,
    "withholdingThreshold" DECIMAL(14,2) NOT NULL,
    "pricingConfigId" UUID NOT NULL,
    "lockedFxRate" DECIMAL(18,8) NOT NULL,
    "lockedFxRateAt" TIMESTAMPTZ(3) NOT NULL,
    "plannedPickupAt" TIMESTAMPTZ(3) NOT NULL,
    "plannedDeliveryAt" TIMESTAMPTZ(3) NOT NULL,
    "assignmentEndAt" TIMESTAMPTZ(3) NOT NULL,
    "deadheadKm" DOUBLE PRECISION NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "statusChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledBy" "CancelledBy",
    "cancellationReason" TEXT,
    "cancellationFee" DECIMAL(14,2),
    "cancellationFeePayer" "PartySide",
    "deadheadCompensation" DECIMAL(14,2),
    "noShow" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMPTZ(3),
    "podSubmittedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "type" "ShipmentEventType" NOT NULL,
    "fromStatus" "ShipmentStatus",
    "toStatus" "ShipmentStatus",
    "actorUserId" UUID,
    "actorRole" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "note" TEXT,
    "payload" JSONB,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "openedByCompanyId" UUID NOT NULL,
    "openedByUserId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "previousStatus" "ShipmentStatus" NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "outcome" "ShipmentStatus",
    "faultParty" "PartySide",
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "raterCompanyId" UUID NOT NULL,
    "ratedCompanyId" UUID NOT NULL,
    "raterSide" "PartySide" NOT NULL,
    "raterUserId" UUID NOT NULL,
    "stars" INTEGER NOT NULL,
    "punctuality" INTEGER,
    "communication" INTEGER,
    "cargoCare" INTEGER,
    "documentation" INTEGER,
    "priceHonesty" INTEGER,
    "comment" TEXT,
    "visibleAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "contextType" "ConversationContext" NOT NULL,
    "matchId" UUID,
    "shipmentId" UUID,
    "shipperCompanyId" UUID NOT NULL,
    "carrierCompanyId" UUID NOT NULL,
    "lastMessageAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderUserId" UUID NOT NULL,
    "senderCompanyId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "bodyOriginal" TEXT,
    "contactMasked" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "dedupKey" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "shipmentId" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "issuerIsPlatform" BOOLEAN NOT NULL DEFAULT false,
    "issuerCompanyId" UUID,
    "recipientCompanyId" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "vatRate" DECIMAL(5,4) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL,
    "withholdingRatio" DECIMAL(5,4) NOT NULL,
    "withholdingAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "payableAmount" DECIMAL(14,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" UUID NOT NULL,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "commissionModel" "CommissionModel" NOT NULL,
    "commissionRate" DECIMAL(7,6) NOT NULL,
    "splitShipperShare" DECIMAL(5,4) NOT NULL DEFAULT 0.5,
    "minCommission" DECIMAL(14,2),
    "vatRate" DECIMAL(5,4) NOT NULL,
    "commissionVatRate" DECIMAL(5,4) NOT NULL,
    "withholdingRatio" DECIMAL(5,4) NOT NULL,
    "withholdingThreshold" DECIMAL(14,2) NOT NULL,
    "commissionOnCancellationFee" BOOLEAN NOT NULL DEFAULT true,
    "ratePerKmBands" JSONB NOT NULL,
    "multipliers" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingConfig" (
    "id" UUID NOT NULL,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "wProximity" DOUBLE PRECISION NOT NULL,
    "wRouteFit" DOUBLE PRECISION NOT NULL,
    "wPriceFit" DOUBLE PRECISION NOT NULL,
    "wReliability" DOUBLE PRECISION NOT NULL,
    "wTimeFit" DOUBLE PRECISION NOT NULL,
    "wEquipmentFit" DOUBLE PRECISION NOT NULL,
    "wHistory" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "topN" INTEGER NOT NULL,
    "roadFactor" DOUBLE PRECISION NOT NULL,
    "avgTruckSpeedKmh" DOUBLE PRECISION NOT NULL,
    "candidateLimit" INTEGER NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationPolicy" (
    "id" UUID NOT NULL,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "tiers" JSONB NOT NULL,
    "deadheadRatePerKm" DECIMAL(10,2) NOT NULL,
    "noShowGraceMinutes" INTEGER NOT NULL DEFAULT 120,
    "noShowSuspendStreak" INTEGER NOT NULL DEFAULT 3,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" UUID NOT NULL,
    "base" "Currency" NOT NULL,
    "quote" "Currency" NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryRule" (
    "countryCode" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "visaGroup" TEXT,
    "vatExemptInternational" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CountryRule_pkey" PRIMARY KEY ("countryCode")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedById" UUID,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "state" "IdempotencyState" NOT NULL DEFAULT 'IN_PROGRESS',
    "statusCode" INTEGER,
    "responseBody" JSONB,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceCounter" (
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReferenceCounter_pkey" PRIMARY KEY ("prefix","year")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyStats" (
    "companyId" UUID NOT NULL,
    "completedAsCarrier" INTEGER NOT NULL DEFAULT 0,
    "completedAsShipper" INTEGER NOT NULL DEFAULT 0,
    "carrierCancelled" INTEGER NOT NULL DEFAULT 0,
    "shipperCancelled" INTEGER NOT NULL DEFAULT 0,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveNoShows" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "lastNoShowAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CompanyStats_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "CompanyPairStats" (
    "shipperCompanyId" UUID NOT NULL,
    "carrierCompanyId" UUID NOT NULL,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "goodCount" INTEGER NOT NULL DEFAULT 0,
    "lastDisputeLostAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CompanyPairStats_pkey" PRIMARY KEY ("shipperCompanyId","carrierCompanyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "Company_taxNumber_idx" ON "Company"("taxNumber");

-- CreateIndex
CREATE INDEX "Company_phone_idx" ON "Company"("phone");

-- CreateIndex
CREATE INDEX "Company_iban_idx" ON "Company"("iban");

-- CreateIndex
CREATE INDEX "Company_type_verificationStatus_status_idx" ON "Company"("type", "verificationStatus", "status");

-- CreateIndex
CREATE INDEX "CompanyMember_companyId_idx" ON "CompanyMember"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMember_userId_companyId_key" ON "CompanyMember"("userId", "companyId");

-- CreateIndex
CREATE INDEX "Document_ownerType_ownerId_idx" ON "Document"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Document_companyId_idx" ON "Document"("companyId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_expiresAt_idx" ON "Document"("expiresAt");

-- CreateIndex
CREATE INDEX "Document_type_idx" ON "Document"("type");

-- CreateIndex
CREATE INDEX "RequiredDocumentRule_ownerType_scope_active_idx" ON "RequiredDocumentRule"("ownerType", "scope", "active");

-- CreateIndex
CREATE INDEX "BlockList_blockedCompanyId_idx" ON "BlockList"("blockedCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockList_blockerCompanyId_blockedCompanyId_key" ON "BlockList"("blockerCompanyId", "blockedCompanyId");

-- CreateIndex
CREATE INDEX "RiskFlag_status_type_idx" ON "RiskFlag"("status", "type");

-- CreateIndex
CREATE INDEX "RiskFlag_companyId_idx" ON "RiskFlag"("companyId");

-- CreateIndex
CREATE INDEX "RiskFlag_entityType_entityId_idx" ON "RiskFlag"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plateNormalized_key" ON "Vehicle"("plateNormalized");

-- CreateIndex
CREATE INDEX "Vehicle_carrierCompanyId_idx" ON "Vehicle"("carrierCompanyId");

-- CreateIndex
CREATE INDEX "Vehicle_status_idx" ON "Vehicle"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Trailer_plateNormalized_key" ON "Trailer"("plateNormalized");

-- CreateIndex
CREATE INDEX "Trailer_carrierCompanyId_idx" ON "Trailer"("carrierCompanyId");

-- CreateIndex
CREATE INDEX "Trailer_trailerType_idx" ON "Trailer"("trailerType");

-- CreateIndex
CREATE INDEX "Trailer_features_idx" ON "Trailer" USING GIN ("features");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");

-- CreateIndex
CREATE INDEX "Driver_carrierCompanyId_idx" ON "Driver"("carrierCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "Load_referenceNo_key" ON "Load"("referenceNo");

-- CreateIndex
CREATE INDEX "Load_shipperCompanyId_idx" ON "Load"("shipperCompanyId");

-- CreateIndex
CREATE INDEX "Load_status_pickupWindowStart_idx" ON "Load"("status", "pickupWindowStart");

-- CreateIndex
CREATE INDEX "Load_pickupCity_idx" ON "Load"("pickupCity");

-- CreateIndex
CREATE INDEX "Load_deliveryCity_idx" ON "Load"("deliveryCity");

-- CreateIndex
CREATE INDEX "Load_transportScope_idx" ON "Load"("transportScope");

-- CreateIndex
CREATE INDEX "Load_moderationStatus_idx" ON "Load"("moderationStatus");

-- CreateIndex
CREATE INDEX "Load_requiredTrailerTypes_idx" ON "Load" USING GIN ("requiredTrailerTypes");

-- CreateIndex
CREATE UNIQUE INDEX "LoadStop_loadId_sequence_key" ON "LoadStop"("loadId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "TruckPosting_referenceNo_key" ON "TruckPosting"("referenceNo");

-- CreateIndex
CREATE INDEX "TruckPosting_carrierCompanyId_idx" ON "TruckPosting"("carrierCompanyId");

-- CreateIndex
CREATE INDEX "TruckPosting_vehicleId_idx" ON "TruckPosting"("vehicleId");

-- CreateIndex
CREATE INDEX "TruckPosting_trailerId_idx" ON "TruckPosting"("trailerId");

-- CreateIndex
CREATE INDEX "TruckPosting_driverId_idx" ON "TruckPosting"("driverId");

-- CreateIndex
CREATE INDEX "TruckPosting_status_availableFrom_availableUntil_idx" ON "TruckPosting"("status", "availableFrom", "availableUntil");

-- CreateIndex
CREATE INDEX "TruckPosting_preferredCities_idx" ON "TruckPosting" USING GIN ("preferredCities");

-- CreateIndex
CREATE INDEX "Match_truckPostingId_idx" ON "Match"("truckPostingId");

-- CreateIndex
CREATE INDEX "Match_loadId_score_idx" ON "Match"("loadId", "score");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Match_loadId_truckPostingId_key" ON "Match"("loadId", "truckPostingId");

-- CreateIndex
CREATE INDEX "Offer_matchId_idx" ON "Offer"("matchId");

-- CreateIndex
CREATE INDEX "Offer_loadId_idx" ON "Offer"("loadId");

-- CreateIndex
CREATE INDEX "Offer_truckPostingId_idx" ON "Offer"("truckPostingId");

-- CreateIndex
CREATE INDEX "Offer_offeredByCompanyId_idx" ON "Offer"("offeredByCompanyId");

-- CreateIndex
CREATE INDEX "Offer_status_validUntil_idx" ON "Offer"("status", "validUntil");

-- CreateIndex
CREATE INDEX "Offer_parentOfferId_idx" ON "Offer"("parentOfferId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_referenceNo_key" ON "Shipment"("referenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_matchId_key" ON "Shipment"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_acceptedOfferId_key" ON "Shipment"("acceptedOfferId");

-- CreateIndex
CREATE INDEX "Shipment_loadId_idx" ON "Shipment"("loadId");

-- CreateIndex
CREATE INDEX "Shipment_truckPostingId_idx" ON "Shipment"("truckPostingId");

-- CreateIndex
CREATE INDEX "Shipment_shipperCompanyId_status_idx" ON "Shipment"("shipperCompanyId", "status");

-- CreateIndex
CREATE INDEX "Shipment_carrierCompanyId_status_idx" ON "Shipment"("carrierCompanyId", "status");

-- CreateIndex
CREATE INDEX "Shipment_vehicleId_idx" ON "Shipment"("vehicleId");

-- CreateIndex
CREATE INDEX "Shipment_trailerId_idx" ON "Shipment"("trailerId");

-- CreateIndex
CREATE INDEX "Shipment_driverId_idx" ON "Shipment"("driverId");

-- CreateIndex
CREATE INDEX "Shipment_status_plannedPickupAt_idx" ON "Shipment"("status", "plannedPickupAt");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "Dispute_shipmentId_idx" ON "Dispute"("shipmentId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Rating_ratedCompanyId_idx" ON "Rating"("ratedCompanyId");

-- CreateIndex
CREATE INDEX "Rating_raterCompanyId_idx" ON "Rating"("raterCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_shipmentId_raterCompanyId_key" ON "Rating"("shipmentId", "raterCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_matchId_key" ON "Conversation"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_shipmentId_key" ON "Conversation"("shipmentId");

-- CreateIndex
CREATE INDEX "Conversation_shipperCompanyId_idx" ON "Conversation"("shipperCompanyId");

-- CreateIndex
CREATE INDEX "Conversation_carrierCompanyId_idx" ON "Conversation"("carrierCompanyId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderUserId_idx" ON "Message"("senderUserId");

-- CreateIndex
CREATE INDEX "Message_flagged_idx" ON "Message"("flagged");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_dedupKey_idx" ON "Notification"("dedupKey");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_shipmentId_idx" ON "Invoice"("shipmentId");

-- CreateIndex
CREATE INDEX "Invoice_recipientCompanyId_idx" ON "Invoice"("recipientCompanyId");

-- CreateIndex
CREATE INDEX "Invoice_issuerCompanyId_idx" ON "Invoice"("issuerCompanyId");

-- CreateIndex
CREATE INDEX "PricingConfig_effectiveFrom_idx" ON "PricingConfig"("effectiveFrom");

-- CreateIndex
CREATE INDEX "MatchingConfig_effectiveFrom_idx" ON "MatchingConfig"("effectiveFrom");

-- CreateIndex
CREATE INDEX "CancellationPolicy_effectiveFrom_idx" ON "CancellationPolicy"("effectiveFrom");

-- CreateIndex
CREATE INDEX "ExchangeRate_base_quote_effectiveAt_idx" ON "ExchangeRate"("base", "quote", "effectiveAt");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "OtpChallenge_userId_purpose_idx" ON "OtpChallenge"("userId", "purpose");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_userId_key_key" ON "IdempotencyRecord"("userId", "key");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "CompanyPairStats_carrierCompanyId_idx" ON "CompanyPairStats"("carrierCompanyId");

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockList" ADD CONSTRAINT "BlockList_blockerCompanyId_fkey" FOREIGN KEY ("blockerCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockList" ADD CONSTRAINT "BlockList_blockedCompanyId_fkey" FOREIGN KEY ("blockedCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskFlag" ADD CONSTRAINT "RiskFlag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_carrierCompanyId_fkey" FOREIGN KEY ("carrierCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trailer" ADD CONSTRAINT "Trailer_carrierCompanyId_fkey" FOREIGN KEY ("carrierCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_carrierCompanyId_fkey" FOREIGN KEY ("carrierCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_shipperCompanyId_fkey" FOREIGN KEY ("shipperCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadStop" ADD CONSTRAINT "LoadStop_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckPosting" ADD CONSTRAINT "TruckPosting_carrierCompanyId_fkey" FOREIGN KEY ("carrierCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckPosting" ADD CONSTRAINT "TruckPosting_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckPosting" ADD CONSTRAINT "TruckPosting_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TruckPosting" ADD CONSTRAINT "TruckPosting_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_truckPostingId_fkey" FOREIGN KEY ("truckPostingId") REFERENCES "TruckPosting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_truckPostingId_fkey" FOREIGN KEY ("truckPostingId") REFERENCES "TruckPosting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_parentOfferId_fkey" FOREIGN KEY ("parentOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_acceptedOfferId_fkey" FOREIGN KEY ("acceptedOfferId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_truckPostingId_fkey" FOREIGN KEY ("truckPostingId") REFERENCES "TruckPosting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_shipperCompanyId_fkey" FOREIGN KEY ("shipperCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_carrierCompanyId_fkey" FOREIGN KEY ("carrierCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_trailerId_fkey" FOREIGN KEY ("trailerId") REFERENCES "Trailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_raterCompanyId_fkey" FOREIGN KEY ("raterCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_ratedCompanyId_fkey" FOREIGN KEY ("ratedCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyStats" ADD CONSTRAINT "CompanyStats_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

