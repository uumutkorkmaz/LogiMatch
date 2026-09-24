import { Decimal, Money } from '@logimatch/shared';
import { describe, expect, it } from 'vitest';
import { computeCancellation, DEFAULT_CANCELLATION_TIERS } from './cancellation';
import { computeCommission } from './commission';
import { DEFAULT_BANDS, estimatePriceRange } from './estimate';
import { computeSettlement, type LockedTerms } from './settlement';
import { simpleInvoice, transportInvoice } from './tax';

const TRY = (v: string | number) => Money.of(v, 'TRY');
const d = (v: string | number) => new Decimal(v);

describe('computeCommission (DOMAIN §7.2)', () => {
  const G = TRY('50000');
  const base = { commissionRate: d('0.10'), splitShipperShare: d('0.5') };

  it('CARRIER_PAYS: shipper pays G, carrier gets G − C', () => {
    const c = computeCommission(G, { ...base, commissionModel: 'CARRIER_PAYS' });
    expect(c.total.toString()).toBe('5000.00');
    expect(c.shipperTotal.toString()).toBe('50000.00');
    expect(c.carrierPayout.toString()).toBe('45000.00');
  });

  it('SHIPPER_PAYS: shipper pays G + C, carrier gets G', () => {
    const c = computeCommission(G, { ...base, commissionModel: 'SHIPPER_PAYS' });
    expect(c.shipperTotal.toString()).toBe('55000.00');
    expect(c.carrierPayout.toString()).toBe('50000.00');
  });

  it('SPLIT keeps parts summing to the total even with odd cents', () => {
    const c = computeCommission(TRY('33333.33'), { ...base, commissionModel: 'SPLIT' });
    expect(c.total.toString()).toBe('3333.33');
    expect(c.shipperPart.add(c.carrierPart).eq(c.total)).toBe(true);
    expect(c.shipperPart.toString()).toBe('1666.67');
    expect(c.carrierPart.toString()).toBe('1666.66');
  });

  it('applies minimum commission but never exceeds the agreed amount', () => {
    const small = computeCommission(
      TRY('1000'),
      { ...base, commissionModel: 'CARRIER_PAYS' },
      TRY('250'),
    );
    expect(small.total.toString()).toBe('250.00');
    const tiny = computeCommission(
      TRY('100'),
      { ...base, commissionModel: 'CARRIER_PAYS' },
      TRY('250'),
    );
    expect(tiny.total.toString()).toBe('100.00');
    expect(tiny.carrierPayout.isZero()).toBe(true);
  });
});

describe('transportInvoice — VAT and tevkifat (DOMAIN §7.3, #25)', () => {
  const common = {
    vatRate: d('0.20'),
    withholdingRatio: d('0.2'),
    withholdingThreshold: TRY('12000'),
  };

  it('matches the worked example in DOMAIN §7.3', () => {
    const inv = transportInvoice({
      ...common,
      subtotal: TRY('50000'),
      vatExempt: false,
      withholdingApplies: true,
    });
    expect(inv.vatAmount.toString()).toBe('10000.00');
    expect(inv.withholdingAmount.toString()).toBe('2000.00');
    expect(inv.total.toString()).toBe('60000.00');
    expect(inv.payable.toString()).toBe('58000.00');
  });

  it('no withholding under the threshold (VAT-inclusive)', () => {
    const inv = transportInvoice({
      ...common,
      subtotal: TRY('9999.99'),
      vatExempt: false,
      withholdingApplies: true,
    });
    expect(inv.total.toString()).toBe('11999.99');
    expect(inv.withholdingAmount.isZero()).toBe(true);
    expect(inv.withholdingRatio.isZero()).toBe(true);
  });

  it('threshold is inclusive', () => {
    const inv = transportInvoice({
      ...common,
      subtotal: TRY('10000'),
      vatExempt: false,
      withholdingApplies: true,
    });
    expect(inv.withholdingAmount.toString()).toBe('400.00');
  });

  it('international transport is VAT-exempt and has no withholding', () => {
    const inv = transportInvoice({
      ...common,
      subtotal: Money.of('3200', 'EUR'),
      withholdingThreshold: Money.of('300', 'EUR'),
      vatExempt: true,
      withholdingApplies: true,
    });
    expect(inv.vatAmount.isZero()).toBe(true);
    expect(inv.withholdingAmount.isZero()).toBe(true);
    expect(inv.payable.toString()).toBe('3200.00');
  });

  it('rounds VAT HALF_UP and total equals sum of rounded lines (#27)', () => {
    const inv = transportInvoice({
      ...common,
      subtotal: TRY('12345.67'),
      vatExempt: false,
      withholdingApplies: true,
    });
    expect(inv.vatAmount.toString()).toBe('2469.13'); // 2469.134
    expect(inv.withholdingAmount.toString()).toBe('493.83'); // 493.826
    expect(inv.total.eq(inv.subtotal.add(inv.vatAmount))).toBe(true);
    expect(inv.payable.eq(inv.total.subtract(inv.withholdingAmount))).toBe(true);
  });

  it('commission invoice has VAT but no withholding', () => {
    const inv = simpleInvoice(TRY('5000'), d('0.20'));
    expect(inv.total.toString()).toBe('6000.00');
    expect(inv.withholdingAmount.isZero()).toBe(true);
  });
});

describe('computeSettlement', () => {
  const terms: LockedTerms = {
    currency: 'TRY',
    agreed: TRY('50000'),
    commissionModel: 'CARRIER_PAYS',
    commissionRate: d('0.10'),
    shipperCommission: TRY('0'),
    carrierCommission: TRY('5000'),
    vatRate: d('0.20'),
    commissionVatRate: d('0.20'),
    vatExempt: false,
    withholdingApplies: true,
    withholdingRatio: d('0.2'),
    withholdingThreshold: TRY('12000'),
  };

  it('delivered: reproduces DOMAIN §7.3 cash flows', () => {
    const s = computeSettlement(terms);
    expect(s.shipper.toCarrier.toString()).toBe('58000.00');
    expect(s.shipper.toTaxOffice.toString()).toBe('2000.00');
    expect(s.shipper.toPlatform.isZero()).toBe(true);
    expect(s.shipper.total.toString()).toBe('60000.00');
    expect(s.commission).toHaveLength(1);
    expect(s.carrier.toPlatform.toString()).toBe('6000.00');
    expect(s.carrier.net.toString()).toBe('52000.00');
  });

  it('SPLIT produces one commission invoice per side', () => {
    const s = computeSettlement({
      ...terms,
      commissionModel: 'SPLIT',
      shipperCommission: TRY('2500'),
      carrierCommission: TRY('2500'),
    });
    expect(s.commission.map((c) => c.payer)).toEqual(['SHIPPER', 'CARRIER']);
    expect(s.shipper.toPlatform.toString()).toBe('3000.00');
  });

  it('cancelled by shipper: fee invoice to carrier and platform cut billed to carrier', () => {
    const s = computeSettlement(terms, {
      fee: TRY('12500'),
      payer: 'SHIPPER',
      platformCut: TRY('1250'),
    });
    expect(s.kind).toBe('CANCELLED');
    expect(s.transport).toBeNull();
    expect(s.cancellation!.invoice.total.toString()).toBe('15000.00');
    expect(s.shipper.toCarrier.toString()).toBe('15000.00');
    expect(s.commission[0]!.payer).toBe('CARRIER');
    expect(s.carrier.net.toString()).toBe('13500.00');
  });

  it('cancelled by carrier: carrier pays the shipper', () => {
    const s = computeSettlement(terms, {
      fee: TRY('1000'),
      payer: 'CARRIER',
      platformCut: TRY('0'),
    });
    expect(s.shipper.toCarrier.isZero()).toBe(true);
    expect(s.carrier.net.toString()).toBe('-1200.00');
    expect(s.commission).toHaveLength(0);
  });
});

describe('computeCancellation (#8, #10)', () => {
  const pickupStart = new Date('2026-10-10T08:00:00Z');
  const at = (hoursBefore: number) => new Date(pickupStart.getTime() - hoursBefore * 3_600_000);
  const base = {
    policy: { tiers: DEFAULT_CANCELLATION_TIERS, deadheadRatePerKm: d('20') },
    agreed: TRY('40000'),
    pickupStart,
    status: 'ASSIGNED' as const,
    cancelledBy: 'SHIPPER' as const,
    departedToPickup: false,
    deadheadKm: 120,
    forceMajeure: false,
    commissionRate: d('0.10'),
    commissionOnFee: true,
  };

  it.each([
    [72, 'GT_48H', '0.00'],
    [48, 'GT_48H', '0.00'],
    [47.9, 'H24_48', '4000.00'],
    [24, 'H24_48', '4000.00'],
    [23.9, 'LT_24H', '10000.00'],
    [-5, 'LT_24H', '10000.00'],
  ])('%s h before pickup → %s, fee %s', (h, tier, fee) => {
    const r = computeCancellation({ ...base, at: at(h) });
    expect(r.tier).toBe(tier);
    expect(r.fee.toString()).toBe(fee);
  });

  it('at pickup: 50% + deadhead compensation, platform takes its cut', () => {
    const r = computeCancellation({ ...base, at: at(1), status: 'AT_PICKUP' });
    expect(r.fee.toString()).toBe('20000.00');
    expect(r.deadheadCompensation.toString()).toBe('2400.00');
    expect(r.total.toString()).toBe('22400.00');
    expect(r.platformCut.toString()).toBe('2240.00');
    expect(r.payeeNet.toString()).toBe('20160.00');
    expect(r).toMatchObject({ payer: 'SHIPPER', payee: 'CARRIER' });
  });

  it('shipper cancelling < 24h after the carrier departed pays deadhead (#10)', () => {
    const r = computeCancellation({ ...base, at: at(5), departedToPickup: true });
    expect(r.deadheadCompensation.toString()).toBe('2400.00');
  });

  it('carrier cancellation: carrier pays, no deadhead compensation', () => {
    const r = computeCancellation({
      ...base,
      at: at(10),
      cancelledBy: 'CARRIER',
      departedToPickup: true,
    });
    expect(r).toMatchObject({ payer: 'CARRIER', payee: 'SHIPPER' });
    expect(r.deadheadCompensation.isZero()).toBe(true);
  });

  it('force majeure and platform cancellations are free', () => {
    expect(computeCancellation({ ...base, at: at(1), forceMajeure: true }).total.isZero()).toBe(
      true,
    );
    expect(computeCancellation({ ...base, at: at(1), cancelledBy: 'PLATFORM' }).payer).toBeNull();
  });

  it('free tier has no payer and no platform cut', () => {
    const r = computeCancellation({ ...base, at: at(100) });
    expect(r.payer).toBeNull();
    expect(r.platformCut.isZero()).toBe(true);
  });

  it('returns NO_TIER when the policy does not cover the situation', () => {
    const r = computeCancellation({ ...base, policy: { ...base.policy, tiers: [] }, at: at(1) });
    expect(r.tier).toBe('NO_TIER');
  });
});

describe('estimatePriceRange', () => {
  const base = {
    distanceKm: 450,
    trailerType: 'TENTELI' as const,
    weightKg: 20000,
    isAdr: false,
    requiresTempControl: false,
    international: false,
  };

  it('uses the trailer band per km', () => {
    const r = estimatePriceRange(base, DEFAULT_BANDS);
    expect(r.min.toString()).toBe('24750.00');
    expect(r.max.toString()).toBe('31500.00');
  });

  it('applies ADR, reefer, international and light-load multipliers', () => {
    const adr = estimatePriceRange({ ...base, isAdr: true }, DEFAULT_BANDS);
    expect(adr.min.toString()).toBe('30940.00');
    const light = estimatePriceRange({ ...base, weightKg: 3000 }, DEFAULT_BANDS);
    expect(light.min.toString()).toBe('19800.00');
    const all = estimatePriceRange(
      { ...base, isAdr: true, requiresTempControl: true, international: true },
      DEFAULT_BANDS,
    );
    expect(all.min.gt(adr.min)).toBe(true);
  });

  it('enforces a minimum trip price on short hauls and falls back for unknown bands', () => {
    const short = estimatePriceRange({ ...base, distanceKm: 20 }, DEFAULT_BANDS);
    expect(short.min.toString()).toBe('8000.00');
    expect(short.max.toString()).toBe('9600.00');
    const noBand = estimatePriceRange(base, { ...DEFAULT_BANDS, perKm: {} });
    expect(noBand.min.toString()).toBe('24750.00');
  });
});
