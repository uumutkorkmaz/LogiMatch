import type { CommissionModel, Currency, Decimal } from '@logimatch/shared';
import { Money } from '@logimatch/shared';
import { type InvoiceCalc, simpleInvoice, transportInvoice } from './tax';

/** Kabul anında Shipment'a kilitlenen mali şartlar (#26). */
export interface LockedTerms {
  currency: Currency;
  agreed: Money;
  commissionModel: CommissionModel;
  commissionRate: Decimal;
  shipperCommission: Money;
  carrierCommission: Money;
  vatRate: Decimal;
  commissionVatRate: Decimal;
  vatExempt: boolean;
  withholdingApplies: boolean;
  withholdingRatio: Decimal;
  withholdingThreshold: Money;
}

export interface CancellationTerms {
  fee: Money;
  payer: 'SHIPPER' | 'CARRIER';
  platformCut: Money;
}

export interface Settlement {
  currency: Currency;
  kind: 'DELIVERED' | 'CANCELLED';
  /** Navlun faturası carrier → shipper (iptalde yok). */
  transport: InvoiceCalc | null;
  /** Platform komisyon faturaları. */
  commission: { payer: 'SHIPPER' | 'CARRIER'; invoice: InvoiceCalc }[];
  /** İptal ceza faturası (payer → karşı taraf). */
  cancellation: { payer: 'SHIPPER' | 'CARRIER'; invoice: InvoiceCalc; platformCut: Money } | null;
  shipper: { toCarrier: Money; toTaxOffice: Money; toPlatform: Money; total: Money };
  carrier: { fromShipper: Money; toPlatform: Money; net: Money };
}

/**
 * Acente modeli (ASSUMPTIONS ✅): navlun faturası carrier → shipper, komisyon faturası
 * platform → ödeyen taraf. Tüm kalemler yuvarlanmış tutarlardan toplanır (#27).
 */
export function computeSettlement(
  t: LockedTerms,
  cancelled?: CancellationTerms | null,
): Settlement {
  const cur = t.currency;
  const zero = Money.zero(cur);

  if (cancelled) {
    const inv = simpleInvoice(cancelled.fee, t.vatRate);
    const commission = cancelled.platformCut.isZero()
      ? []
      : [
          {
            payer: cancelled.payer === 'SHIPPER' ? ('CARRIER' as const) : ('SHIPPER' as const),
            invoice: simpleInvoice(cancelled.platformCut, t.commissionVatRate),
          },
        ];
    const shipperPays = cancelled.payer === 'SHIPPER' ? inv.payable : zero;
    const carrierPays = cancelled.payer === 'CARRIER' ? inv.payable : zero;
    const cutFor = (side: 'SHIPPER' | 'CARRIER') =>
      commission.find((c) => c.payer === side)?.invoice.payable ?? zero;
    return {
      currency: cur,
      kind: 'CANCELLED',
      transport: null,
      commission,
      cancellation: { payer: cancelled.payer, invoice: inv, platformCut: cancelled.platformCut },
      shipper: {
        toCarrier: shipperPays,
        toTaxOffice: zero,
        toPlatform: cutFor('SHIPPER'),
        total: shipperPays.add(cutFor('SHIPPER')),
      },
      carrier: {
        fromShipper: shipperPays.subtract(carrierPays),
        toPlatform: cutFor('CARRIER'),
        net: shipperPays.subtract(carrierPays).subtract(cutFor('CARRIER')),
      },
    };
  }

  const transport = transportInvoice({
    subtotal: t.agreed,
    vatRate: t.vatRate,
    vatExempt: t.vatExempt,
    withholdingApplies: t.withholdingApplies,
    withholdingRatio: t.withholdingRatio,
    withholdingThreshold: t.withholdingThreshold,
  });
  const commission: Settlement['commission'] = [];
  if (!t.shipperCommission.isZero())
    commission.push({
      payer: 'SHIPPER',
      invoice: simpleInvoice(t.shipperCommission, t.commissionVatRate),
    });
  if (!t.carrierCommission.isZero())
    commission.push({
      payer: 'CARRIER',
      invoice: simpleInvoice(t.carrierCommission, t.commissionVatRate),
    });
  const shipperToPlatform = commission.find((c) => c.payer === 'SHIPPER')?.invoice.payable ?? zero;
  const carrierToPlatform = commission.find((c) => c.payer === 'CARRIER')?.invoice.payable ?? zero;

  return {
    currency: cur,
    kind: 'DELIVERED',
    transport,
    commission,
    cancellation: null,
    shipper: {
      toCarrier: transport.payable,
      toTaxOffice: transport.withholdingAmount,
      toPlatform: shipperToPlatform,
      total: transport.payable.add(transport.withholdingAmount).add(shipperToPlatform),
    },
    carrier: {
      fromShipper: transport.payable,
      toPlatform: carrierToPlatform,
      net: transport.payable.subtract(carrierToPlatform),
    },
  };
}
