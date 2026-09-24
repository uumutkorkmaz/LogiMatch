import { z } from 'zod';

const digitsOf = (value: string): number[] => [...value].map(Number);

/** Vergi Kimlik Numarası (10 hane) — GİB kontrol basamağı algoritması. */
export function isValidVkn(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const d = digitsOf(value);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (d[i]! + 9 - i) % 10;
    let v = (tmp * 2 ** (9 - i)) % 9;
    if (tmp !== 0 && v === 0) v = 9;
    sum += v;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}

/** T.C. Kimlik Numarası (11 hane) — şahıs firmalarında vergi no olarak kullanılır. */
export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = digitsOf(value);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d[9] === d10 && d[10] === d11;
}

/** VKN (tüzel kişi) veya TCKN (şahıs firması / öz mal sahibi). */
export function isValidTaxNumber(value: string): boolean {
  return isValidVkn(value) || isValidTckn(value);
}

/**
 * TR plaka: il kodu (01-81) + 1-3 harf + 2-4 rakam.
 *  - 1 harf  -> 4 rakam   (34 A 1234)
 *  - 2 harf  -> 3-4 rakam (34 AB 123 / 34 AB 1234)
 *  - 3 harf  -> 2-3 rakam (34 ABC 12 / 34 ABC 123)
 * Türkçe karakterler (Ç, Ğ, İ, Ö, Ş, Ü) plakada kullanılmaz.
 */
const PLATE_RE = /^(0[1-9]|[1-7]\d|8[01])([A-Z]{1,3})(\d{2,4})$/;

export function normalizePlate(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidTrPlate(value: string): boolean {
  const m = PLATE_RE.exec(normalizePlate(value));
  if (!m) return false;
  const letters = m[2]!.length;
  const digits = m[3]!.length;
  if (letters === 1) return digits === 4;
  if (letters === 2) return digits === 3 || digits === 4;
  return digits === 2 || digits === 3;
}

/** Kanonik gösterim: "34 ABC 123". Geçersizse null. */
export function formatTrPlate(value: string): string | null {
  if (!isValidTrPlate(value)) return null;
  const m = PLATE_RE.exec(normalizePlate(value))!;
  return `${m[1]} ${m[2]} ${m[3]}`;
}

export const taxNumberSchema = z
  .string()
  .trim()
  .refine(isValidTaxNumber, { message: 'Geçersiz VKN/TCKN' });

export const trPlateSchema = z
  .string()
  .refine(isValidTrPlate, { message: 'Geçersiz plaka' })
  .transform((v) => formatTrPlate(v)!);

/** TR IBAN: "TR" + 2 kontrol + 22 hane = 26 karakter, ISO 13616 mod-97 kontrolü. */
export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function isValidTrIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^TR\d{24}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

export const trIbanSchema = z
  .string()
  .transform(normalizeIban)
  .refine(isValidTrIban, { message: 'Geçersiz IBAN' });

/** Telefonu E.164'e çevirir; TR numaralarında 0 / 90 öneklerini tolere eder. */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, '');
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  const d = digits.replace(/^\+/, '');
  if (/^90[2-5]\d{9}$/.test(d)) return `+${d}`;
  if (/^0[2-5]\d{9}$/.test(d)) return `+9${d}`;
  if (/^[2-5]\d{9}$/.test(d)) return `+90${d}`;
  return null;
}

export const phoneSchema = z
  .string()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Geçersiz telefon' });
      return z.NEVER;
    }
    return n;
  });
