import DecimalJs from 'decimal.js';
import type { Currency } from '../enums';

/** Proje genelinde tek Decimal yapılandırması: yüksek hassasiyet, ROUND_HALF_UP. */
export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Decimal = DecimalJs;
export type DecimalInput = DecimalJs.Value | { toString(): string };

export function toDecimal(value: DecimalInput): DecimalJs {
  if (value instanceof DecimalJs) return new Decimal(value.toString());
  if (typeof value === 'number' || typeof value === 'string') return new Decimal(value);
  return new Decimal(value.toString());
}

/** 2 haneye ROUND_HALF_UP (#27). */
export function round2(value: DecimalInput): DecimalJs {
  return toDecimal(value).toDecimalPlaces(2, DecimalJs.ROUND_HALF_UP);
}

export class CurrencyMismatchError extends Error {
  constructor(a: Currency, b: Currency) {
    super(`Currency mismatch: ${a} vs ${b}`);
    this.name = 'CurrencyMismatchError';
  }
}

/**
 * Para değeri. Her işlem sonucu 2 haneye yuvarlanır; bu yüzden toplamlar her zaman
 * yuvarlanmış kalemlerin toplamıdır (drift yok). Farklı para birimleri karışamaz.
 */
export class Money {
  private constructor(
    readonly amount: DecimalJs,
    readonly currency: Currency,
  ) {}

  static of(value: DecimalInput, currency: Currency): Money {
    return new Money(round2(value), currency);
  }

  static zero(currency: Currency): Money {
    return new Money(new Decimal(0), currency);
  }

  static sum(items: readonly Money[], currency: Currency): Money {
    return items.reduce((acc, m) => acc.add(m), Money.zero(currency));
  }

  private assertSame(other: Money): void {
    if (other.currency !== this.currency) throw new CurrencyMismatchError(this.currency, other.currency);
  }

  add(other: Money): Money {
    this.assertSame(other);
    return Money.of(this.amount.plus(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSame(other);
    return Money.of(this.amount.minus(other.amount), this.currency);
  }

  /** Oran/çarpan uygular ve sonucu yuvarlar (ör. komisyon, KDV). */
  multiply(factor: DecimalInput): Money {
    return Money.of(this.amount.times(toDecimal(factor)), this.currency);
  }

  /** `rate` = 1 birim bu para biriminin hedefteki karşılığı. */
  convert(rate: DecimalInput, target: Currency): Money {
    if (target === this.currency) return this;
    return Money.of(this.amount.times(toDecimal(rate)), target);
  }

  max(other: Money): Money {
    this.assertSame(other);
    return this.gte(other) ? this : other;
  }

  compare(other: Money): number {
    this.assertSame(other);
    return this.amount.comparedTo(other.amount);
  }

  eq(other: Money): boolean {
    return this.compare(other) === 0;
  }
  gt(other: Money): boolean {
    return this.compare(other) > 0;
  }
  gte(other: Money): boolean {
    return this.compare(other) >= 0;
  }
  lt(other: Money): boolean {
    return this.compare(other) < 0;
  }

  isZero(): boolean {
    return this.amount.isZero();
  }
  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  /** "1234.50" — API ve DB'ye her zaman string olarak gider. */
  toString(): string {
    return this.amount.toFixed(2);
  }

  toJSON(): { amount: string; currency: Currency } {
    return { amount: this.toString(), currency: this.currency };
  }
}
