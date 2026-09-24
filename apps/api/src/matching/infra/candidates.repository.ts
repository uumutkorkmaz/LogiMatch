import { Injectable } from '@nestjs/common';
import { type Currency, Decimal, type LatLng } from '@logimatch/shared';
import { type Db, InjectDb, Prisma } from '../../infra/prisma';
import type {
  MatchCandidate,
  MatchLoad,
  MatchingParams,
  PreferredDestination,
} from '../domain/types';

/** Ön-eleme için global üst yarıçap: GIST index kullanılabilsin (satır bazlı yarıçap ayrıca uygulanır). */
const MAX_DEADHEAD_KM = 1500;
const DAY = 86_400_000;

interface CandidateRow {
  id: string;
  carrierCompanyId: string;
  status: MatchCandidate['posting']['status'];
  pausedAt: Date | null;
  availableFrom: Date;
  availableUntil: Date;
  originLat: number;
  originLng: number;
  preferredDestinations: PreferredDestination[];
  maxDeadheadKm: number;
  maxRouteDeviationKm: number | null;
  minPricePerKm: string | null;
  currency: Currency;
  acceptsAdr: boolean;
  acceptsPartialLoad: boolean;
  acceptsInternational: boolean;
  trailerType: MatchCandidate['trailer']['trailerType'];
  capacityKg: number;
  volumeM3: number;
  loadingMeters: number;
  palletCapacity: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  features: MatchCandidate['trailer']['features'];
  minTempC: number | null;
  maxTempC: number | null;
  trailerStatus: MatchCandidate['trailer']['status'];
  trailerCompliance: Date | null;
  trailerAdr: Date | null;
  vehicleStatus: MatchCandidate['vehicle']['status'];
  vehicleCompliance: Date | null;
  driverStatus: MatchCandidate['driver']['status'];
  adrClasses: string[];
  visaCountries: string[];
  homeBaseLat: number | null;
  homeBaseLng: number | null;
  driverCompliance: Date | null;
  driverAdr: Date | null;
  driverIntl: Date | null;
  companyStatus: MatchCandidate['carrier']['status'];
  verificationStatus: MatchCandidate['carrier']['verificationStatus'];
  companyCompliance: Date | null;
  companyIntl: Date | null;
  homeLat: number | null;
  homeLng: number | null;
  ratingCount: number;
  ratingSum: number;
  completed: number;
  carrierCancelled: number;
  noShow: number;
}

const CANDIDATE_SELECT = Prisma.sql`
  SELECT p.id, p."carrierCompanyId", p.status, p."pausedAt", p."availableFrom", p."availableUntil",
    p."originLat", p."originLng", p."preferredDestinations", p."maxDeadheadKm", p."maxRouteDeviationKm",
    p."minPricePerKm"::text AS "minPricePerKm", p.currency, p."acceptsAdr", p."acceptsPartialLoad", p."acceptsInternational",
    t."trailerType", t."capacityKg", t."volumeM3", t."loadingMeters", t."palletCapacity", t."lengthCm", t."widthCm", t."heightCm",
    t.features::text[] AS features, t."minTempC", t."maxTempC", t.status AS "trailerStatus",
    t."complianceValidUntil" AS "trailerCompliance", t."adrValidUntil" AS "trailerAdr",
    v.status AS "vehicleStatus", v."complianceValidUntil" AS "vehicleCompliance",
    d.status AS "driverStatus", d."adrClasses", d."visaCountries", d."homeBaseLat", d."homeBaseLng",
    d."complianceValidUntil" AS "driverCompliance", d."adrValidUntil" AS "driverAdr", d."intlValidUntil" AS "driverIntl",
    c.status AS "companyStatus", c."verificationStatus", c."complianceValidUntil" AS "companyCompliance",
    c."intlValidUntil" AS "companyIntl", c."homeLat", c."homeLng",
    COALESCE(s."ratingCount", 0)::int AS "ratingCount", COALESCE(s."ratingSum", 0)::int AS "ratingSum",
    COALESCE(s."completedAsCarrier", 0)::int AS completed, COALESCE(s."carrierCancelled", 0)::int AS "carrierCancelled",
    COALESCE(s."noShowCount", 0)::int AS "noShow"
  FROM "TruckPosting" p
  JOIN "Trailer" t ON t.id = p."trailerId"
  JOIN "Vehicle" v ON v.id = p."vehicleId"
  JOIN "Driver" d ON d.id = p."driverId"
  JOIN "Company" c ON c.id = p."carrierCompanyId"
  LEFT JOIN "CompanyStats" s ON s."companyId" = c.id`;

type LoadRow = Prisma.LoadGetPayload<{ include: { stops: true; shipperCompany: true } }>;

@Injectable()
export class CandidatesRepository {
  constructor(@InjectDb() private readonly db: Db) {}

  // ── Yük ─────────────────────────────────────────────────────────────
  toMatchLoad(l: LoadRow): MatchLoad {
    const d = (v: Prisma.Decimal | null) => (v == null ? null : new Decimal(v.toString()));
    const stops = [...l.stops].sort((a, b) => a.sequence - b.sequence);
    return {
      id: l.id,
      shipperCompanyId: l.shipperCompanyId,
      status: l.status,
      moderationStatus: l.moderationStatus,
      shipper: {
        status: l.shipperCompany.status,
        verificationStatus: l.shipperCompany.verificationStatus,
      },
      pickup: { lat: l.pickupLat ?? 0, lng: l.pickupLng ?? 0 },
      delivery: { lat: l.deliveryLat ?? 0, lng: l.deliveryLng ?? 0 },
      pickupCountry: l.pickupCountry,
      deliveryCountry: l.deliveryCountry,
      deliveryCity: l.deliveryCity,
      pickupWindowStart: l.pickupWindowStart,
      pickupWindowEnd: l.pickupWindowEnd,
      deliveryWindowEnd: l.deliveryWindowEnd,
      stops:
        stops.length > 2
          ? stops.map((s) => ({
              type: s.type,
              lat: s.lat ?? 0,
              lng: s.lng ?? 0,
              weightKg: s.weightKg,
              volumeM3: s.volumeM3,
              loadingMeters: s.loadingMeters,
              palletCount: s.palletCount,
            }))
          : [],
      weightKg: l.weightKg,
      volumeM3: l.volumeM3,
      loadingMeters: l.loadingMeters,
      palletCount: l.palletCount,
      palletType: l.palletType,
      maxPieceLengthCm: l.maxPieceLengthCm,
      maxPieceWidthCm: l.maxPieceWidthCm,
      maxPieceHeightCm: l.maxPieceHeightCm,
      requiredTrailerTypes: l.requiredTrailerTypes,
      requiredFeatures: l.requiredFeatures,
      isAdr: l.isAdr,
      adrClass: l.adrClass,
      requiresTempControl: l.requiresTempControl,
      minTempC: l.minTempC,
      maxTempC: l.maxTempC,
      transportScope: l.transportScope,
      pricingMode: l.pricingMode,
      budgetMin: d(l.budgetMin),
      budgetMax: d(l.budgetMax),
      estimatedPriceMin: d(l.estimatedPriceMin),
      estimatedPriceMax: d(l.estimatedPriceMax),
      currency: l.currency,
      routeDistanceKm: l.routeDistanceKm,
      visibility: l.visibility,
      invitedCarrierCompanyIds: l.invitedCarrierCompanyIds,
    };
  }

  async loadById(id: string): Promise<MatchLoad | null> {
    const l = await this.db.load.findUnique({
      where: { id },
      include: { stops: true, shipperCompany: true },
    });
    return l ? this.toMatchLoad(l) : null;
  }

  async loadsByIds(ids: string[]): Promise<MatchLoad[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.load.findMany({
      where: { id: { in: ids } },
      include: { stops: true, shipperCompany: true },
    });
    return rows.map((l) => this.toMatchLoad(l));
  }

  /** Araç için aday yükler: PostGIS yarıçapı + ucuz filtreler (kalan her şey JS'te). */
  async loadsNearPosting(c: MatchCandidate, params: MatchingParams): Promise<MatchLoad[]> {
    const radiusM = (c.posting.maxDeadheadKm * 1000) / params.roadFactor;
    const peakCapacity = c.trailer.capacityKg;
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT l.id FROM "Load" l
      WHERE l.status IN ('PUBLISHED', 'MATCHING', 'OFFERED') AND l."deletedAt" IS NULL
        AND l."moderationStatus" IN ('NOT_REQUIRED', 'APPROVED')
        AND l."pickupLocation" IS NOT NULL
        AND ST_DWithin(l."pickupLocation", ST_SetSRID(ST_MakePoint(${c.posting.origin.lng}, ${c.posting.origin.lat}), 4326)::geography, ${radiusM})
        AND ${c.trailer.trailerType}::"TrailerType" = ANY(l."requiredTrailerTypes")
        AND l."weightKg" <= ${peakCapacity}
        AND l."pickupWindowStart" < ${c.posting.availableUntil} AND l."pickupWindowEnd" > ${c.posting.availableFrom}
        AND l."shipperCompanyId" <> ${c.posting.carrierCompanyId}::uuid
      ORDER BY ST_Distance(l."pickupLocation", ST_SetSRID(ST_MakePoint(${c.posting.origin.lng}, ${c.posting.origin.lat}), 4326)::geography)
      LIMIT ${params.candidateLimit}`;
    return this.loadsByIds(rows.map((r) => r.id));
  }

  // ── Araç ────────────────────────────────────────────────────────────
  /** Yük için aday araçlar (ARCHITECTURE §7.2). */
  async candidatesForLoad(load: MatchLoad, params: MatchingParams): Promise<MatchCandidate[]> {
    const pickup = Prisma.sql`ST_SetSRID(ST_MakePoint(${load.pickup.lng}, ${load.pickup.lat}), 4326)::geography`;
    const rows = await this.db.$queryRaw<CandidateRow[]>`
      ${CANDIDATE_SELECT}
      WHERE p.status = 'ACTIVE' AND p."deletedAt" IS NULL AND p."pausedAt" IS NULL
        AND ST_DWithin(p."originLocation", ${pickup}, ${(MAX_DEADHEAD_KM * 1000) / params.roadFactor})
        AND ST_DWithin(p."originLocation", ${pickup}, p."maxDeadheadKm" * 1000.0 / ${params.roadFactor})
        AND t."trailerType"::text = ANY(${load.requiredTrailerTypes}::text[])
        AND t."capacityKg" >= ${load.weightKg}
        AND p."availableFrom" < ${load.pickupWindowEnd} AND p."availableUntil" > ${load.pickupWindowStart}
        AND p."carrierCompanyId" <> ${load.shipperCompanyId}::uuid
      ORDER BY ST_Distance(p."originLocation", ${pickup})
      LIMIT ${params.candidateLimit}`;
    return this.hydrate(rows, [load.shipperCompanyId]);
  }

  async candidatesByPostingIds(ids: string[], shipperCompanyId: string): Promise<MatchCandidate[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.$queryRaw<CandidateRow[]>`
      ${CANDIDATE_SELECT} WHERE p.id = ANY(${ids}::uuid[])`;
    return this.hydrate(rows, [shipperCompanyId]);
  }

  async candidateByPostingId(id: string): Promise<MatchCandidate | null> {
    const rows = await this.db.$queryRaw<
      CandidateRow[]
    >`${CANDIDATE_SELECT} WHERE p.id = ${id}::uuid`;
    const [c] = await this.hydrate(rows, []);
    return c ?? null;
  }

  /**
   * Bir aracın farklı yük verenlerle ilişkisi (geçmiş + kara liste) yüke göre değişir.
   * `forShipper` ile adayın pair/blocked alanları o yük verene göre doldurulur.
   */
  async withShipperContext(
    c: MatchCandidate,
    shipperIds: string[],
  ): Promise<Map<string, Pick<MatchCandidate, 'pair' | 'blocked'>>> {
    const [pairs, blocks] = await Promise.all([
      this.db.companyPairStats.findMany({
        where: {
          carrierCompanyId: c.posting.carrierCompanyId,
          shipperCompanyId: { in: shipperIds },
        },
      }),
      this.db.blockList.findMany({
        where: {
          OR: [
            { blockerCompanyId: c.posting.carrierCompanyId, blockedCompanyId: { in: shipperIds } },
            { blockedCompanyId: c.posting.carrierCompanyId, blockerCompanyId: { in: shipperIds } },
          ],
        },
      }),
    ]);
    const blocked = new Set(blocks.flatMap((b) => [b.blockerCompanyId, b.blockedCompanyId]));
    return new Map(
      shipperIds.map((sid) => {
        const p = pairs.find((x) => x.shipperCompanyId === sid);
        return [
          sid,
          {
            pair: { goodCount: p?.goodCount ?? 0, lastDisputeLostAt: p?.lastDisputeLostAt ?? null },
            blocked: blocked.has(sid),
          },
        ];
      }),
    );
  }

  /** Satırları domain nesnesine çevirir; istatistik/kara liste toplu sorgularla (N+1 yok). */
  private async hydrate(rows: CandidateRow[], shipperIds: string[]): Promise<MatchCandidate[]> {
    if (rows.length === 0) return [];
    const carrierIds = [...new Set(rows.map((r) => r.carrierCompanyId))];
    const since = new Date(Date.now() - 90 * DAY);
    const shipperId = shipperIds[0];
    const [recent, pairs, blocks] = await Promise.all([
      this.db.$queryRaw<{ carrierCompanyId: string; noShow90: number; cancel90: number }[]>`
        SELECT "carrierCompanyId",
          COUNT(*) FILTER (WHERE "noShow")::int AS "noShow90",
          COUNT(*) FILTER (WHERE "cancelledBy" = 'CARRIER' AND NOT "noShow")::int AS "cancel90"
        FROM "Shipment"
        WHERE "carrierCompanyId" = ANY(${carrierIds}::uuid[]) AND "cancelledAt" > ${since}
        GROUP BY 1`,
      shipperId
        ? this.db.companyPairStats.findMany({
            where: { shipperCompanyId: shipperId, carrierCompanyId: { in: carrierIds } },
          })
        : Promise.resolve([]),
      shipperId
        ? this.db.blockList.findMany({
            where: {
              OR: [
                { blockerCompanyId: shipperId, blockedCompanyId: { in: carrierIds } },
                { blockedCompanyId: shipperId, blockerCompanyId: { in: carrierIds } },
              ],
            },
          })
        : Promise.resolve([]),
    ]);
    const blocked = new Set(blocks.flatMap((b) => [b.blockerCompanyId, b.blockedCompanyId]));
    const home = (lat: number | null, lng: number | null): LatLng | null =>
      lat != null && lng != null ? { lat, lng } : null;

    return rows.map((r) => {
      const rc = recent.find((x) => x.carrierCompanyId === r.carrierCompanyId);
      const pair = pairs.find((x) => x.carrierCompanyId === r.carrierCompanyId);
      return {
        posting: {
          id: r.id,
          carrierCompanyId: r.carrierCompanyId,
          status: r.status,
          pausedAt: r.pausedAt,
          availableFrom: r.availableFrom,
          availableUntil: r.availableUntil,
          origin: { lat: r.originLat, lng: r.originLng },
          preferredDestinations: r.preferredDestinations ?? [],
          maxDeadheadKm: r.maxDeadheadKm,
          maxRouteDeviationKm: r.maxRouteDeviationKm,
          minPricePerKm: r.minPricePerKm == null ? null : new Decimal(r.minPricePerKm),
          currency: r.currency,
          acceptsAdr: r.acceptsAdr,
          acceptsPartialLoad: r.acceptsPartialLoad,
          acceptsInternational: r.acceptsInternational,
        },
        trailer: {
          trailerType: r.trailerType,
          capacityKg: r.capacityKg,
          volumeM3: r.volumeM3,
          loadingMeters: r.loadingMeters,
          palletCapacity: r.palletCapacity,
          lengthCm: r.lengthCm,
          widthCm: r.widthCm,
          heightCm: r.heightCm,
          features: r.features,
          minTempC: r.minTempC,
          maxTempC: r.maxTempC,
          status: r.trailerStatus,
          complianceValidUntil: r.trailerCompliance,
          adrValidUntil: r.trailerAdr,
        },
        vehicle: { status: r.vehicleStatus, complianceValidUntil: r.vehicleCompliance },
        driver: {
          status: r.driverStatus,
          adrClasses: r.adrClasses,
          visaCountries: r.visaCountries,
          homeBase: home(r.homeBaseLat, r.homeBaseLng),
          complianceValidUntil: r.driverCompliance,
          adrValidUntil: r.driverAdr,
          intlValidUntil: r.driverIntl,
        },
        carrier: {
          id: r.carrierCompanyId,
          status: r.companyStatus,
          verificationStatus: r.verificationStatus,
          complianceValidUntil: r.companyCompliance,
          intlValidUntil: r.companyIntl,
          home: home(r.homeLat, r.homeLng),
        },
        stats: {
          ratingCount: r.ratingCount,
          ratingAvg: r.ratingCount > 0 ? r.ratingSum / r.ratingCount : 0,
          completed: r.completed,
          carrierCancelled: r.carrierCancelled,
          noShow: r.noShow,
          noShow90: rc?.noShow90 ?? 0,
          carrierCancel90: rc?.cancel90 ?? 0,
        },
        pair: {
          goodCount: pair?.goodCount ?? 0,
          lastDisputeLostAt: pair?.lastDisputeLostAt ?? null,
        },
        blocked: blocked.has(r.carrierCompanyId),
      };
    });
  }
}
