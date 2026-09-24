import { describe, expect, it } from 'vitest';
import { resolveLocale } from '@/i18n/config';
import {
  formatDateTime,
  formatKm,
  formatMoney,
  fromLocalInput,
  place,
  scoreTone,
  toLocalInput,
} from './format';

describe('formatDateTime', () => {
  it('renders UTC timestamps in Europe/Istanbul (UTC+3)', () => {
    expect(formatDateTime('2026-03-01T21:30:00Z', 'en-GB')).toContain('00:30');
    expect(formatDateTime('2026-03-01T21:30:00Z', 'en-GB')).toContain('2 Mar 2026');
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('formatMoney', () => {
  it('formats TRY with two decimals', () => {
    expect(formatMoney('12500.5', 'TRY')).toMatch(/12\.500,50/);
    expect(formatMoney(null)).toBe('—');
  });
});

describe('datetime-local round trip in Istanbul time', () => {
  it('converts both ways', () => {
    expect(toLocalInput('2026-10-01T05:00:00.000Z')).toBe('2026-10-01T08:00');
    expect(fromLocalInput('2026-10-01T08:00')).toBe('2026-10-01T05:00:00.000Z');
  });
});

describe('misc', () => {
  it('formats places, km and score tones', () => {
    expect(place('İstanbul', 'Tuzla')).toBe('İstanbul (Tuzla)');
    expect(place('Sofya', null, 'BG')).toBe('Sofya, BG');
    expect(formatKm(1250.4)).toMatch(/1\.250 km/);
    expect(scoreTone(80)).toBe('success');
    expect(scoreTone(60)).toBe('info');
    expect(scoreTone(45)).toBe('warning');
  });

  it('resolveLocale falls back to tr', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('de')).toBe('tr');
  });
});
