import { describe, expect, it } from 'vitest';
import { Distance, distanceToSegment } from './distance';
import { CurrencyMismatchError, Money, round2 } from './money';
import { TimeWindow } from './time-window';

describe('Money', () => {
  it('rounds HALF_UP to 2 decimals on construction', () => {
    expect(Money.of('10.005', 'TRY').toString()).toBe('10.01');
    expect(Money.of('10.004', 'TRY').toString()).toBe('10.00');
    expect(Money.of('-10.005', 'TRY').toString()).toBe('-10.01');
    expect(round2('2.675').toFixed(2)).toBe('2.68'); // float'ta 2.67 olurdu
  });

  it('never drifts: 0.1 + 0.2 === 0.3', () => {
    expect(Money.of('0.1', 'TRY').add(Money.of('0.2', 'TRY')).toString()).toBe('0.30');
  });

  it('multiplies with rounding (commission, VAT)', () => {
    const g = Money.of('33333.33', 'TRY');
    expect(g.multiply('0.10').toString()).toBe('3333.33');
    expect(g.multiply('0.20').toString()).toBe('6666.67');
  });

  it('sum equals sum of rounded items', () => {
    const items = ['0.335', '0.335', '0.335'].map((v) => Money.of(v, 'EUR'));
    expect(Money.sum(items, 'EUR').toString()).toBe('1.02');
  });

  it('refuses mixed currencies', () => {
    expect(() => Money.of(1, 'TRY').add(Money.of(1, 'EUR'))).toThrow(CurrencyMismatchError);
  });

  it('converts with a rate', () => {
    expect(Money.of('100', 'EUR').convert('36.1234', 'TRY').toString()).toBe('3612.34');
    const same = Money.of('5', 'TRY');
    expect(same.convert('2', 'TRY')).toBe(same);
  });

  it('compares and serializes', () => {
    const a = Money.of(5, 'USD');
    const b = Money.of(7, 'USD');
    expect(a.lt(b) && b.gt(a) && b.gte(b) && a.eq(Money.of('5.00', 'USD'))).toBe(true);
    expect(a.max(b)).toBe(b);
    expect(Money.zero('USD').isZero()).toBe(true);
    expect(Money.of(-1, 'USD').isNegative()).toBe(true);
    expect(JSON.parse(JSON.stringify(a))).toEqual({ amount: '5.00', currency: 'USD' });
  });
});

describe('TimeWindow [start, end)', () => {
  const w = TimeWindow.of('2026-10-01T08:00:00Z', '2026-10-01T12:00:00Z');

  it('is half-open', () => {
    expect(w.contains(new Date('2026-10-01T08:00:00Z'))).toBe(true);
    expect(w.contains(new Date('2026-10-01T12:00:00Z'))).toBe(false);
  });

  it('adjacent windows do not overlap', () => {
    const next = TimeWindow.of('2026-10-01T12:00:00Z', '2026-10-01T13:00:00Z');
    expect(w.overlaps(next)).toBe(false);
    expect(w.intersection(next)).toBeNull();
  });

  it('computes intersection and duration', () => {
    const other = TimeWindow.of('2026-10-01T10:00:00Z', '2026-10-02T00:00:00Z');
    const i = w.intersection(other)!;
    expect(i.toJSON()).toEqual({
      start: '2026-10-01T10:00:00.000Z',
      end: '2026-10-01T12:00:00.000Z',
    });
    expect(i.durationHours).toBe(2);
  });

  it('rejects empty or inverted windows', () => {
    expect(() => TimeWindow.of('2026-10-01T08:00:00Z', '2026-10-01T08:00:00Z')).toThrow();
    expect(() => TimeWindow.of('x', '2026-10-01T08:00:00Z')).toThrow();
  });
});

describe('Distance', () => {
  const istanbul = { lat: 41.0082, lng: 28.9784 };
  const ankara = { lat: 39.9334, lng: 32.8597 };

  it('haversine Istanbul–Ankara ≈ 350 km', () => {
    const d = Distance.between(istanbul, ankara);
    expect(d.km).toBeGreaterThan(345);
    expect(d.km).toBeLessThan(355);
    expect(d.times(1.25).km).toBeCloseTo(d.km * 1.25);
    expect(Distance.km(1.26).roundedKm()).toBe(1.3);
  });

  it('segment distance is 0 on the line and grows off it', () => {
    const mid = { lat: (istanbul.lat + ankara.lat) / 2, lng: (istanbul.lng + ankara.lng) / 2 };
    expect(distanceToSegment(mid, istanbul, ankara).km).toBeLessThan(1);
    const izmir = { lat: 38.4237, lng: 27.1428 };
    expect(distanceToSegment(izmir, istanbul, ankara).km).toBeGreaterThan(250);
    expect(distanceToSegment(izmir, istanbul, istanbul).km).toBeCloseTo(
      Distance.between(izmir, istanbul).km,
      -1,
    );
  });

  it('rejects negative distances', () => {
    expect(() => Distance.meters(-1)).toThrow();
    expect(Distance.km(1).plus(Distance.km(2)).km).toBe(3);
  });
});
