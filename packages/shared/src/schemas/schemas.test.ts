import { describe, expect, it } from 'vitest';
import { amountSchema, bboxSchema } from './common';
import { createLoadSchema } from './load';
import { createTruckPostingSchema } from './truck-posting';
import { createTrailerSchema } from './fleet';
import { registerSchema } from './auth';

const baseLoad = {
  pickup: {
    address: 'Tuzla OSB',
    city: 'İstanbul',
    windowStart: '2026-10-01T06:00:00Z',
    windowEnd: '2026-10-01T12:00:00Z',
  },
  delivery: {
    address: 'Ostim OSB',
    city: 'Ankara',
    windowStart: '2026-10-02T06:00:00Z',
    windowEnd: '2026-10-02T15:00:00Z',
  },
  cargoType: 'Paletli gıda',
  weightKg: 18000,
  requiredTrailerTypes: ['TENTELI'],
  pricingMode: 'OPEN_TO_OFFER',
  budgetMin: '20000',
  budgetMax: '26000',
};

describe('createLoadSchema', () => {
  it('accepts a valid domestic load and applies defaults', () => {
    const v = createLoadSchema.parse(baseLoad);
    expect(v.pickup.country).toBe('TR');
    expect(v.currency).toBe('TRY');
    expect(v.transportScope).toBe('DOMESTIC');
    expect(v.pickup.windowStart).toBeInstanceOf(Date);
  });

  it.each([
    [{ isAdr: true }, 'adrClass'],
    [{ requiresTempControl: true }, 'minTempC'],
    [{ pricingMode: 'FIXED', budgetMax: undefined }, 'budgetMax'],
    [{ budgetMin: '30000' }, 'budgetMin'],
    [{ transportScope: 'INTERNATIONAL' }, 'transportScope'],
    [
      {
        delivery: {
          ...baseLoad.delivery,
          windowStart: '2026-09-01T00:00:00Z',
          windowEnd: '2026-09-02T00:00:00Z',
        },
      },
      'delivery',
    ],
    [{ visibility: 'INVITED_ONLY' }, 'invitedCarrierCompanyIds'],
  ])('rejects %j', (patch, path) => {
    const r = createLoadSchema.safeParse({ ...baseLoad, ...patch });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0])).toContain(path);
  });

  it('requires DE→TR loads to be INTERNATIONAL', () => {
    const r = createLoadSchema.safeParse({
      ...baseLoad,
      pickup: { ...baseLoad.pickup, city: 'München', country: 'de' },
    });
    expect(r.success).toBe(false);
  });
});

describe('small schemas', () => {
  it('amount accepts comma decimals and rejects floats beyond 2 places', () => {
    expect(amountSchema.parse('1250,5')).toBe('1250.5');
    expect(amountSchema.parse(100)).toBe('100');
    expect(amountSchema.safeParse('1.234').success).toBe(false);
    expect(amountSchema.safeParse('0').success).toBe(false);
  });

  it('bbox parses', () => {
    expect(bboxSchema.parse('26,36,45,42')).toEqual({
      minLng: 26,
      minLat: 36,
      maxLng: 45,
      maxLat: 42,
    });
    expect(bboxSchema.safeParse('1,2,3').success).toBe(false);
  });

  it('truck posting window must be ordered', () => {
    const r = createTruckPostingSchema.safeParse({
      vehicleId: '0190a000-0000-7000-8000-000000000001',
      trailerId: '0190a000-0000-7000-8000-000000000002',
      driverId: '0190a000-0000-7000-8000-000000000003',
      availableFrom: '2026-10-02T00:00:00Z',
      availableUntil: '2026-10-01T00:00:00Z',
      origin: { address: 'Merkez', city: 'Bursa' },
      maxDeadheadKm: 200,
    });
    expect(r.success).toBe(false);
  });

  it('reefer trailer needs a temperature range', () => {
    const base = {
      plate: '34 ABC 123',
      trailerType: 'FRIGORIFIK',
      capacityKg: 24000,
      volumeM3: 86,
      lengthCm: 1360,
      widthCm: 246,
      heightCm: 260,
      loadingMeters: 13.6,
      palletCapacity: 33,
      axleCount: 3,
      features: ['TEMP_CONTROLLED'],
    };
    expect(createTrailerSchema.safeParse(base).success).toBe(false);
    expect(createTrailerSchema.safeParse({ ...base, minTempC: -25, maxTempC: 12 }).success).toBe(
      true,
    );
  });

  it('password must mix letters and digits; admin cannot self-register', () => {
    const ok = {
      email: 'A@B.com',
      password: 'Demo1234!',
      fullName: 'Ali Veli',
      role: 'SHIPPER_USER',
    };
    expect(registerSchema.parse(ok).email).toBe('a@b.com');
    expect(registerSchema.safeParse({ ...ok, password: 'abcdefgh' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, role: 'ADMIN' }).success).toBe(false);
  });
});
