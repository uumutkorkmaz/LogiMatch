import type { CommissionModel, Decimal } from '@logimatch/shared';
import { Money } from '@logimatch/shared';

export interface PricingConfigValues {
  commissionModel: CommissionModel;
  commissionRate: Decimal;
  /** SPLIT modelinde komisyonun shipper'a düşen payı (0..1). */
  splitShipperShare: Decimal;
  /** TRY cinsinden taban komisyon (null = yok). */
  minCommission: Decimal | null;
  vatRate: Decimal;
  commissionVatRate: Decimal;
  withholdingRatio: Decimal;
  withholdingThresholdTry: Decimal;
  commissionOnCancellationFee: boolean;
}

export interface CommissionBreakdown {
  model: CommissionModel;
  rate: Decimal;
  total: Money;
  shipperPart: Money;
  carrierPart: Money;
  /** Carrier'a kalan (KDV hariç) — DOMAIN §7.2 `carrierPayout`. */
  carrierPayout: Money;
  /** Shipper'ın ödediği (KDV hariç): navlun + shipper'a düşen komisyon. */
  shipperTotal: Money;
}

/**
 * DOMAIN §7.2 — G = agreedAmount, C = round(G · r) (min komisyon uygulanır).
 *  CARRIER_PAYS: shipper G öder, carrier G − C alır.
 *  SHIPPER_PAYS: shipper G + C öder, carrier G alır.
 *  SPLIT(s):     shipper G + round(C·s), carrier G − (C − round(C·s)).
 */
export function computeCommission(
  agreed: Money,
  cfg: Pick<PricingConfigValues, 'commissionModel' | 'commissionRate' | 'splitShipperShare'>,
  minCommission?: Money | null,
): CommissionBreakdown {
  let total = agreed.multiply(cfg.commissionRate);
  if (minCommission && minCommission.gt(total)) total = minCommission;
  if (total.gt(agreed)) total = agreed;

  let shipperPart: Money;
  switch (cfg.commissionModel) {
    case 'CARRIER_PAYS':
      shipperPart = Money.zero(agreed.currency);
      break;
    case 'SHIPPER_PAYS':
      shipperPart = total;
      break;
    case 'SPLIT':
      shipperPart = total.multiply(cfg.splitShipperShare);
      break;
  }
  // Kalan kuruş carrier'a yazılır: shipperPart + carrierPart === total (drift yok).
  const carrierPart = total.subtract(shipperPart);
  return {
    model: cfg.commissionModel,
    rate: cfg.commissionRate,
    total,
    shipperPart,
    carrierPart,
    carrierPayout: agreed.subtract(carrierPart),
    shipperTotal: agreed.add(shipperPart),
  };
}
