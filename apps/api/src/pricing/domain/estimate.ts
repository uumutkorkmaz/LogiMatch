import type { TrailerType } from '@logimatch/shared';
import { Money } from '@logimatch/shared';

export interface EstimateBands {
  /** TRY/km bandı, dorse tipine göre */
  perKm: Partial<Record<TrailerType, { min: number; max: number }>>;
  multipliers: {
    adr: number;
    tempControl: number;
    international: number;
    /** Kısa mesafede minimum sefer bedeli (TRY) */
    minTripTry: number;
    /** Bu tonajın altı "hafif yük" sayılır ve indirim uygulanır */
    lightLoadKg: number;
    lightLoadFactor: number;
  };
}

export interface EstimateInput {
  distanceKm: number;
  trailerType: TrailerType;
  weightKg: number;
  isAdr: boolean;
  requiresTempControl: boolean;
  international: boolean;
}

const FALLBACK_BAND = { min: 55, max: 70 };

/** Önerilen fiyat aralığı (TRY, KDV hariç) — DOMAIN §7.5. 10 TL'ye yuvarlanır. */
export function estimatePriceRange(
  i: EstimateInput,
  bands: EstimateBands,
): { min: Money; max: Money } {
  const band = bands.perKm[i.trailerType] ?? FALLBACK_BAND;
  const m = bands.multipliers;
  let factor = 1;
  if (i.isAdr) factor *= m.adr;
  if (i.requiresTempControl) factor *= m.tempControl;
  if (i.international) factor *= m.international;
  if (i.weightKg < m.lightLoadKg) factor *= m.lightLoadFactor;
  const roundTo10 = (n: number) => Math.round(n / 10) * 10;
  const lo = Math.max(m.minTripTry, band.min * i.distanceKm * factor);
  const hi = Math.max(m.minTripTry * 1.2, band.max * i.distanceKm * factor);
  return { min: Money.of(roundTo10(lo), 'TRY'), max: Money.of(roundTo10(hi), 'TRY') };
}

export const DEFAULT_BANDS: EstimateBands = {
  perKm: {
    TENTELI: { min: 55, max: 70 },
    KAPALI_KASA: { min: 57, max: 72 },
    FRIGORIFIK: { min: 66, max: 84 },
    FRIGO_ATP: { min: 70, max: 88 },
    ACIK_PLATFORM: { min: 56, max: 72 },
    LOWBED: { min: 95, max: 140 },
    DAMPERLI: { min: 50, max: 65 },
    SILOBAS: { min: 60, max: 78 },
    TANKER: { min: 68, max: 88 },
    KONTEYNER_SASI: { min: 52, max: 68 },
    KIRKAYAK: { min: 48, max: 62 },
    JUMBO: { min: 60, max: 76 },
    MEGA: { min: 60, max: 76 },
    HAYVAN_NAKLIYE: { min: 62, max: 80 },
    OTO_TASIYICI: { min: 70, max: 92 },
    VINCLI: { min: 80, max: 110 },
  },
  multipliers: {
    adr: 1.25,
    tempControl: 1.1,
    international: 1.15,
    minTripTry: 8000,
    lightLoadKg: 8000,
    lightLoadFactor: 0.8,
  },
};
