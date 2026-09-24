import { Decimal, Money } from '@logimatch/shared';

export interface InvoiceCalc {
  subtotal: Money;
  vatRate: Decimal;
  vatAmount: Money;
  /** Uygulanan tevkifat oranı (uygulanmadıysa 0). */
  withholdingRatio: Decimal;
  withholdingAmount: Money;
  /** subtotal + KDV */
  total: Money;
  /** Alıcının satıcıya ödeyeceği: total − tevkifat (tevkifat vergi dairesine gider). */
  payable: Money;
}

export interface TransportInvoiceInput {
  subtotal: Money;
  vatRate: Decimal;
  /** Uluslararası taşıma KDV istisnası (#25). */
  vatExempt: boolean;
  withholdingApplies: boolean;
  withholdingRatio: Decimal;
  /** Aynı para biriminde tevkifat alt sınırı (KDV dahil). */
  withholdingThreshold: Money;
}

/** Navlun faturası (carrier → shipper), DOMAIN §7.3. */
export function transportInvoice(i: TransportInvoiceInput): InvoiceCalc {
  const vatRate = i.vatExempt ? new Decimal(0) : i.vatRate;
  const vatAmount = i.subtotal.multiply(vatRate);
  const total = i.subtotal.add(vatAmount);
  const applies =
    i.withholdingApplies &&
    !i.vatExempt &&
    !vatAmount.isZero() &&
    total.gte(i.withholdingThreshold);
  const ratio = applies ? i.withholdingRatio : new Decimal(0);
  // Tevkifat hesaplanan KDV üzerinden (#25).
  const withholdingAmount = vatAmount.multiply(ratio);
  return {
    subtotal: i.subtotal,
    vatRate,
    vatAmount,
    withholdingRatio: ratio,
    withholdingAmount,
    total,
    payable: total.subtract(withholdingAmount),
  };
}

/** Komisyon / ceza faturası: KDV var, tevkifat yok. */
export function simpleInvoice(subtotal: Money, vatRate: Decimal): InvoiceCalc {
  const vatAmount = subtotal.multiply(vatRate);
  const total = subtotal.add(vatAmount);
  return {
    subtotal,
    vatRate,
    vatAmount,
    withholdingRatio: new Decimal(0),
    withholdingAmount: Money.zero(subtotal.currency),
    total,
    payable: total,
  };
}
