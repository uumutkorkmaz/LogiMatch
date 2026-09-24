import { describe, expect, it } from 'vitest';
import {
  formatTrPlate,
  isValidTckn,
  isValidTrPlate,
  isValidVkn,
  taxNumberSchema,
  trPlateSchema,
} from './tr-identifiers';

describe('isValidVkn', () => {
  it('accepts a checksum-valid VKN', () => {
    expect(isValidVkn('1234567890')).toBe(true);
  });

  it('rejects wrong check digit, wrong length and non-digits', () => {
    expect(isValidVkn('1234567891')).toBe(false);
    expect(isValidVkn('123456789')).toBe(false);
    expect(isValidVkn('12345678A0')).toBe(false);
  });
});

describe('isValidTckn', () => {
  it('accepts a checksum-valid TCKN', () => {
    expect(isValidTckn('10000000146')).toBe(true);
  });

  it('rejects leading zero and bad checksums', () => {
    expect(isValidTckn('00000000146')).toBe(false);
    expect(isValidTckn('10000000147')).toBe(false);
    expect(isValidTckn('10000000156')).toBe(false);
  });
});

describe('TR plate', () => {
  it.each(['34 A 1234', '34 AB 123', '34 AB 1234', '06 ABC 12', '06abc123', '81-KL-4455'])(
    'accepts %s',
    (plate) => expect(isValidTrPlate(plate)).toBe(true),
  );

  it.each(['00 AB 123', '82 AB 123', '34 A 123', '34 ABC 1234', '34 ABCD 12', '34 ÇA 123'])(
    'rejects %s',
    (plate) => expect(isValidTrPlate(plate)).toBe(false),
  );

  it('formats canonically', () => {
    expect(formatTrPlate('34abc123')).toBe('34 ABC 123');
    expect(formatTrPlate('nope')).toBeNull();
  });
});

describe('zod schemas', () => {
  it('transforms plates and validates tax numbers', () => {
    expect(trPlateSchema.parse('35xy4455')).toBe('35 XY 4455');
    expect(taxNumberSchema.safeParse('1234567891').success).toBe(false);
  });
});

describe('IBAN and phone', () => {
  it('validates TR IBAN checksum', async () => {
    const { isValidTrIban } = await import('./tr-identifiers');
    expect(isValidTrIban('TR33 0006 1005 1978 6457 8413 26')).toBe(true);
    expect(isValidTrIban('TR34 0006 1005 1978 6457 8413 26')).toBe(false);
    expect(isValidTrIban('DE89370400440532013000')).toBe(false);
  });

  it('normalizes phones to E.164', async () => {
    const { normalizePhone } = await import('./tr-identifiers');
    expect(normalizePhone('0532 123 45 67')).toBe('+905321234567');
    expect(normalizePhone('+90 (532) 123-45-67')).toBe('+905321234567');
    expect(normalizePhone('5321234567')).toBe('+905321234567');
    expect(normalizePhone('+491512345678')).toBe('+491512345678');
    expect(normalizePhone('12345')).toBeNull();
  });
});
