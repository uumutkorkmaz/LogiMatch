import type { CancelledBy, Decimal, ShipmentStatus } from '@logimatch/shared';
import { Money } from '@logimatch/shared';

export interface CancellationTier {
  label: string;
  /** pickup'a kalan saat alt sınırı (dahil), null = sınırsız */
  minHours?: number | null;
  /** üst sınır (hariç) */
  maxHours?: number | null;
  /** Sevkiyat AT_PICKUP durumundayken uygulanan kademe */
  atPickup?: boolean;
  feeRatio: number;
  deadheadCompensation?: boolean;
}

export interface CancellationPolicyValues {
  tiers: CancellationTier[];
  /** Shipment para biriminde boş km birim ücreti */
  deadheadRatePerKm: Decimal;
  noShowGraceMinutes: number;
  noShowSuspendStreak: number;
}

export interface CancellationInput {
  policy: Pick<CancellationPolicyValues, 'tiers' | 'deadheadRatePerKm'>;
  agreed: Money;
  pickupStart: Date;
  at: Date;
  status: ShipmentStatus;
  cancelledBy: CancelledBy;
  /** Carrier "yola çıktım" (DEPARTED_TO_PICKUP) olayı girmiş mi */
  departedToPickup: boolean;
  deadheadKm: number;
  forceMajeure: boolean;
  commissionRate: Decimal;
  commissionOnFee: boolean;
}

export interface CancellationResult {
  tier: string;
  hoursBeforePickup: number;
  feeRatio: number;
  fee: Money;
  deadheadCompensation: Money;
  total: Money;
  payer: 'SHIPPER' | 'CARRIER' | null;
  payee: 'SHIPPER' | 'CARRIER' | null;
  platformCut: Money;
  payeeNet: Money;
}

/** DOMAIN §10 — kademeli iptal cezası + shipper iptalinde boş km tazminatı (#8, #10). */
export function computeCancellation(i: CancellationInput): CancellationResult {
  const cur = i.agreed.currency;
  const zero = Money.zero(cur);
  const hours = (i.pickupStart.getTime() - i.at.getTime()) / 3_600_000;
  const none = (label: string): CancellationResult => ({
    tier: label,
    hoursBeforePickup: hours,
    feeRatio: 0,
    fee: zero,
    deadheadCompensation: zero,
    total: zero,
    payer: null,
    payee: null,
    platformCut: zero,
    payeeNet: zero,
  });

  if (i.forceMajeure) return none('FORCE_MAJEURE');
  if (i.cancelledBy === 'PLATFORM') return none('PLATFORM');

  const tier =
    i.status === 'AT_PICKUP'
      ? i.policy.tiers.find((t) => t.atPickup)
      : i.policy.tiers.find(
          (t) =>
            !t.atPickup &&
            (t.minHours == null || hours >= t.minHours) &&
            (t.maxHours == null || hours < t.maxHours),
        );
  if (!tier) return none('NO_TIER');

  const fee = i.agreed.multiply(tier.feeRatio);
  const shipperCancels = i.cancelledBy === 'SHIPPER';
  const deadheadDue =
    shipperCancels && (tier.deadheadCompensation === true || (hours < 24 && i.departedToPickup));
  const deadheadCompensation = deadheadDue
    ? Money.of(i.policy.deadheadRatePerKm, cur).multiply(i.deadheadKm)
    : zero;
  const total = fee.add(deadheadCompensation);
  const platformCut =
    i.commissionOnFee && !total.isZero() ? total.multiply(i.commissionRate) : zero;

  return {
    tier: tier.label,
    hoursBeforePickup: hours,
    feeRatio: tier.feeRatio,
    fee,
    deadheadCompensation,
    total,
    payer: total.isZero() ? null : shipperCancels ? 'SHIPPER' : 'CARRIER',
    payee: total.isZero() ? null : shipperCancels ? 'CARRIER' : 'SHIPPER',
    platformCut,
    payeeNet: total.subtract(platformCut),
  };
}

export const DEFAULT_CANCELLATION_TIERS: CancellationTier[] = [
  { label: 'GT_48H', minHours: 48, maxHours: null, feeRatio: 0 },
  { label: 'H24_48', minHours: 24, maxHours: 48, feeRatio: 0.1 },
  { label: 'LT_24H', minHours: null, maxHours: 24, feeRatio: 0.25 },
  { label: 'AT_PICKUP', atPickup: true, feeRatio: 0.5, deadheadCompensation: true },
];
