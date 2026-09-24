import { describe, expect, it } from 'vitest';
import { findCity, findDistrict, placeKey, TR_PROVINCES } from './gazetteer';

describe('gazetteer', () => {
  it('has all 81 provinces with unique plate codes', () => {
    expect(TR_PROVINCES).toHaveLength(81);
    expect(new Set(TR_PROVINCES.map((p) => p.plateCode)).size).toBe(81);
  });

  it('normalizes Turkish and foreign spellings', () => {
    expect(placeKey('İSTANBUL')).toBe('istanbul');
    expect(placeKey('Şanlıurfa')).toBe('sanliurfa');
    expect(placeKey('Timișoara')).toBe('timisoara');
  });

  it('finds cities by name, alias and country', () => {
    expect(findCity('istanbul')?.plateCode).toBe('34');
    expect(findCity('Izmit')?.name).toBe('Kocaeli');
    expect(findCity('Munich', 'DE')?.name).toBe('Münih');
    expect(findCity('Sofia', 'bg')?.country).toBe('BG');
    expect(findCity('Sofia', 'TR')).toBeUndefined();
    expect(findCity('Atlantis')).toBeUndefined();
  });

  it('finds industrial districts', () => {
    expect(findDistrict('İstanbul', 'tuzla')).toEqual({ lat: 40.82, lng: 29.3 });
    expect(findDistrict('Ankara', 'Nowhere')).toBeUndefined();
  });
});
