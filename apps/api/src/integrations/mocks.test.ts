import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LocalFileStorage,
  MockGeocodingProvider,
  MockRoutingProvider,
  MockTaxIdVerifier,
} from './mocks';
import { RouteNotFoundError } from './ports';

describe('MockGeocodingProvider', () => {
  const geo = new MockGeocodingProvider();

  it('geocodes known districts precisely and deterministically', async () => {
    const a = await geo.geocode({
      address: 'Tersane Cd. 5',
      city: 'İstanbul',
      district: 'Tuzla',
      country: 'TR',
    });
    const b = await geo.geocode({
      address: 'Tersane Cd. 5',
      city: 'istanbul',
      district: 'tuzla',
      country: 'TR',
    });
    expect(a?.precision).toBe('DISTRICT');
    expect(a).toEqual(b);
    expect(Math.abs(a!.lat - 40.82)).toBeLessThan(0.02);
  });

  it('falls back to city center and fails for unknown cities (#20)', async () => {
    expect((await geo.geocode({ address: 'x', city: 'Ankara', country: 'TR' }))?.precision).toBe(
      'CITY',
    );
    expect(await geo.geocode({ address: 'x', city: 'Atlantis', country: 'TR' })).toBeNull();
  });
});

describe('MockRoutingProvider', () => {
  const routing = new MockRoutingProvider();

  it('sums legs with road factor', async () => {
    const r = await routing.route([
      { lat: 41.01, lng: 28.98 },
      { lat: 39.93, lng: 32.86 },
      { lat: 38.42, lng: 27.14 },
    ]);
    expect(r.legs).toHaveLength(2);
    expect(r.distanceM).toBe(r.legs[0]!.distanceM + r.legs[1]!.distanceM);
    expect(r.distanceM / 1000).toBeGreaterThan(900);
  });

  it('throws ROUTE_NOT_FOUND for impossible legs (#21)', async () => {
    await expect(
      routing.route([
        { lat: 41, lng: 29 },
        { lat: 40.7, lng: -74 },
      ]),
    ).rejects.toBeInstanceOf(RouteNotFoundError);
  });
});

describe('MockTaxIdVerifier', () => {
  it('checks checksum and denylist', async () => {
    const v = new MockTaxIdVerifier();
    expect((await v.verify('1234567890')).valid).toBe(true);
    expect((await v.verify('1234567891')).reason).toBe('CHECKSUM');
  });
});

describe('LocalFileStorage', () => {
  it('stores files and signs URLs that expire', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lm-'));
    const s = new LocalFileStorage(dir, 'http://api', 'secret-secret-secret');
    const stored = await s.put('docs/a.txt', Buffer.from('hello'), 'text/plain');
    expect(stored.sizeBytes).toBe(5);
    expect((await s.get('docs/a.txt')).toString()).toBe('hello');
    const url = new URL(s.signedUrl('docs/a.txt', 60));
    const exp = Number(url.searchParams.get('exp'));
    expect(s.verifySignature('docs/a.txt', exp, url.searchParams.get('sig')!)).toBe(true);
    expect(s.verifySignature('docs/b.txt', exp, url.searchParams.get('sig')!)).toBe(false);
    expect(s.verifySignature('docs/a.txt', 1, url.searchParams.get('sig')!)).toBe(false);
    await expect(s.put('../escape.txt', Buffer.from('x'), 'text/plain')).rejects.toThrow();
  });
});
