import { Distance, distanceToSegment, OPEN_LOAD_STATUSES } from '@logimatch/shared';
import type {
  Derived,
  HardFilterCode,
  HardFilterResult,
  MatchCandidate,
  MatchContext,
  MatchLoad,
  MatchingParams,
} from './types';

const HOUR = 3_600_000;
/** EUR paleti 1,2×0,8 m; IND 1,2×1,0 m → aynı dorseye ~%80'i sığar (ASSUMPTIONS). */
const IND_PALLET_FACTOR = 0.8;

/** 4,5 saat sürüşe 45 dk mola (AB 561/2006 basitleştirilmiş). */
export function drivingHoursWithBreaks(km: number, speedKmh: number): number {
  const driving = km / speedKmh;
  return driving + Math.floor(driving / 4.5) * 0.75;
}

export function loadDistanceKm(load: MatchLoad, roadFactor: number): number {
  if (load.routeDistanceKm && load.routeDistanceKm > 0) return load.routeDistanceKm;
  const pts = load.stops.length >= 2 ? load.stops : [load.pickup, load.delivery];
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += Distance.between(pts[i - 1]!, pts[i]!).km;
  return km * roadFactor;
}

export function deriveValues(
  load: MatchLoad,
  c: MatchCandidate,
  ctx: MatchContext,
  params: MatchingParams,
): Derived {
  const deadheadKm = Distance.between(c.posting.origin, load.pickup).km * params.roadFactor;
  const start = Math.max(c.posting.availableFrom.getTime(), ctx.now.getTime());
  const eta = new Date(start + drivingHoursWithBreaks(deadheadKm, params.avgTruckSpeedKmh) * HOUR);
  const earliest = new Date(Math.max(eta.getTime(), load.pickupWindowStart.getTime()));
  return {
    deadheadKm,
    etaToPickup: eta,
    earliestArrival: earliest,
    loadDistanceKm: loadDistanceKm(load, params.roadFactor),
  };
}

/** Çok duraklı yükte araçtaki en yüksek anlık miktar (#22). */
export function peakCargo(load: MatchLoad): {
  weightKg: number;
  volumeM3: number | null;
  loadingMeters: number | null;
  palletCount: number | null;
} {
  const hasStopQty = load.stops.some((s) => s.weightKg != null);
  if (!hasStopQty) {
    return {
      weightKg: load.weightKg,
      volumeM3: load.volumeM3 ?? null,
      loadingMeters: load.loadingMeters ?? null,
      palletCount: load.palletCount ?? null,
    };
  }
  const cur = { w: 0, v: 0, l: 0, p: 0 };
  const peak = { w: 0, v: 0, l: 0, p: 0 };
  for (const s of load.stops) {
    const sign = s.type === 'PICKUP' ? 1 : -1;
    cur.w += sign * (s.weightKg ?? 0);
    cur.v += sign * (s.volumeM3 ?? 0);
    cur.l += sign * (s.loadingMeters ?? 0);
    cur.p += sign * (s.palletCount ?? 0);
    peak.w = Math.max(peak.w, cur.w);
    peak.v = Math.max(peak.v, cur.v);
    peak.l = Math.max(peak.l, cur.l);
    peak.p = Math.max(peak.p, cur.p);
  }
  return {
    weightKg: Math.max(peak.w, 1),
    volumeM3: load.volumeM3 == null ? null : peak.v || load.volumeM3,
    loadingMeters: load.loadingMeters == null ? null : peak.l || load.loadingMeters,
    palletCount: load.palletCount == null ? null : peak.p || load.palletCount,
  };
}

function fitsDimensions(load: MatchLoad, t: MatchCandidate['trailer']): boolean {
  const L = load.maxPieceLengthCm;
  const W = load.maxPieceWidthCm;
  const H = load.maxPieceHeightCm;
  if (H != null && H > t.heightCm) return false;
  if (L == null && W == null) return true;
  const l = L ?? 0;
  const w = W ?? 0;
  // Parça 90° döndürülebilir.
  return (l <= t.lengthCm && w <= t.widthCm) || (w <= t.lengthCm && l <= t.widthCm);
}

const validUntil = (d: Date | null | undefined, mustExceed: Date) =>
  !!d && d.getTime() > mustExceed.getTime();

/** Yurt dışı uçların ülke kodları (TR hariç). */
export function foreignCountries(load: MatchLoad): string[] {
  return [...new Set([load.pickupCountry, load.deliveryCountry].filter((c) => c !== 'TR'))];
}

/**
 * DOMAIN §6.2 — hepsi geçmeli. Her başarısızlık kodlanır (debug + "neden eşleşmedi").
 */
export function evaluateHardFilters(
  load: MatchLoad,
  c: MatchCandidate,
  ctx: MatchContext,
  params: MatchingParams,
): HardFilterResult {
  const f: HardFilterCode[] = [];
  const d = deriveValues(load, c, ctx, params);
  const t = c.trailer;
  const p = c.posting;
  const deliveryEnd = load.deliveryWindowEnd;

  // 1. Dorse tipi + özellikler
  if (
    !load.requiredTrailerTypes.includes(t.trailerType) ||
    !load.requiredFeatures.every((x) => t.features.includes(x))
  ) {
    f.push('TRAILER_TYPE');
  }

  // 2. Kapasite (kümülatif, çok duraklı) + boyut
  const peak = peakCargo(load);
  const palletCap =
    load.palletType === 'IND' ? Math.floor(t.palletCapacity * IND_PALLET_FACTOR) : t.palletCapacity;
  if (
    peak.weightKg > t.capacityKg ||
    (peak.volumeM3 != null && peak.volumeM3 > t.volumeM3) ||
    (peak.loadingMeters != null && peak.loadingMeters > t.loadingMeters) ||
    (peak.palletCount != null && peak.palletCount > palletCap) ||
    !fitsDimensions(load, t)
  ) {
    f.push('CAPACITY');
  }

  // 3. Zaman: müsaitlik ∩ yükleme penceresi ≠ ∅ ve araç pencere kapanmadan ulaşabilmeli
  const overlaps =
    p.availableFrom.getTime() < load.pickupWindowEnd.getTime() &&
    load.pickupWindowStart.getTime() < p.availableUntil.getTime();
  if (
    !overlaps ||
    d.earliestArrival.getTime() >= load.pickupWindowEnd.getTime() ||
    d.earliestArrival.getTime() >= p.availableUntil.getTime()
  ) {
    f.push('TIME_WINDOW');
  }

  // 4. ADR
  if (load.isAdr) {
    const ok =
      p.acceptsAdr &&
      t.features.includes('ADR') &&
      !!load.adrClass &&
      c.driver.adrClasses.includes(load.adrClass) &&
      validUntil(c.driver.adrValidUntil, deliveryEnd) &&
      validUntil(t.adrValidUntil, deliveryEnd);
    if (!ok) f.push('ADR');
  }

  // 5. Sıcaklık
  if (load.requiresTempControl) {
    const ok =
      t.features.includes('TEMP_CONTROLLED') &&
      t.minTempC != null &&
      t.maxTempC != null &&
      load.minTempC != null &&
      load.maxTempC != null &&
      t.minTempC <= load.minTempC &&
      t.maxTempC >= load.maxTempC;
    if (!ok) f.push('TEMPERATURE');
  }

  // 6. Belgeler: teslimden sonra da geçerli olmalı (#7)
  if (
    !validUntil(c.carrier.complianceValidUntil, deliveryEnd) ||
    !validUntil(c.vehicle.complianceValidUntil, deliveryEnd) ||
    !validUntil(t.complianceValidUntil, deliveryEnd) ||
    !validUntil(c.driver.complianceValidUntil, deliveryEnd)
  ) {
    f.push('DOCUMENTS');
  }

  // 7. Uluslararası
  if (load.transportScope === 'INTERNATIONAL') {
    const visaOk = foreignCountries(load).every((cc) => {
      const group = ctx.visaGroups[cc];
      if (group === undefined) return c.driver.visaCountries.includes(cc);
      return (
        group === null ||
        c.driver.visaCountries.includes(group) ||
        c.driver.visaCountries.includes(cc)
      );
    });
    const ok =
      p.acceptsInternational &&
      validUntil(c.carrier.intlValidUntil, deliveryEnd) &&
      validUntil(c.driver.intlValidUntil, deliveryEnd) &&
      visaOk;
    if (!ok) f.push('INTERNATIONAL');
  }

  // 8. Durumlar
  const moderationOk =
    load.moderationStatus === 'NOT_REQUIRED' || load.moderationStatus === 'APPROVED';
  if (
    !OPEN_LOAD_STATUSES.includes(load.status) ||
    !moderationOk ||
    p.status !== 'ACTIVE' ||
    p.pausedAt != null ||
    load.shipper.status !== 'ACTIVE' ||
    load.shipper.verificationStatus !== 'VERIFIED' ||
    c.carrier.status !== 'ACTIVE' ||
    c.carrier.verificationStatus !== 'VERIFIED' ||
    c.vehicle.status !== 'ACTIVE' ||
    t.status !== 'ACTIVE' ||
    c.driver.status !== 'ACTIVE'
  ) {
    f.push('STATUS');
  }

  // 9. Kara liste + davetli ilan
  if (
    c.blocked ||
    (load.visibility === 'INVITED_ONLY' && !load.invitedCarrierCompanyIds.includes(c.carrier.id))
  ) {
    f.push('BLOCKED');
  }

  // 10. Boş km
  if (d.deadheadKm > p.maxDeadheadKm) f.push('DEADHEAD');

  // 11. Kendi yüküne kendi aracı (#14)
  if (load.shipperCompanyId === p.carrierCompanyId) f.push('SELF_DEALING');

  // 12. Koridor sapması
  if (p.maxRouteDeviationKm != null) {
    const prefs = p.preferredDestinations.filter(
      (x): x is typeof x & { lat: number; lng: number } => x.lat != null && x.lng != null,
    );
    if (prefs.length > 0) {
      const nearest = prefs.reduce((best, x) =>
        Distance.between(x, load.delivery).km < Distance.between(best, load.delivery).km ? x : best,
      );
      const deviationKm =
        distanceToSegment(load.delivery, p.origin, nearest).km * params.roadFactor;
      if (deviationKm > p.maxRouteDeviationKm) f.push('ROUTE_DEVIATION');
    }
  }

  return { pass: f.length === 0, failures: f, derived: d };
}
