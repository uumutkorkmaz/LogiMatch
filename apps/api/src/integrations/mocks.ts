import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import {
  Distance,
  findCity,
  findDistrict,
  isValidTaxNumber,
  type LatLng,
  placeKey,
} from '@logimatch/shared';
import {
  type GeocodeQuery,
  type GeocodeResult,
  type IFileStorage,
  type IGeocodingProvider,
  type IPaymentProvider,
  type IRoutingProvider,
  type ISmsProvider,
  type ITaxIdVerifier,
  type PaymentIntent,
  RouteNotFoundError,
  type RouteResult,
  type StoredFile,
  type TaxIdVerification,
} from './ports';

/** Deterministik küçük sapma: aynı adres hep aynı noktaya düşsün. */
function jitter(seed: string, spread: number): { dLat: number; dLng: number } {
  const h = createHash('sha256').update(seed).digest();
  return {
    dLat: ((h.readUInt16BE(0) / 65535) * 2 - 1) * spread,
    dLng: ((h.readUInt16BE(2) / 65535) * 2 - 1) * spread,
  };
}

export class MockGeocodingProvider implements IGeocodingProvider {
  async geocode(q: GeocodeQuery): Promise<GeocodeResult | null> {
    await Promise.resolve();
    const city = findCity(q.city, q.country);
    if (!city) return null;
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    if (q.district && q.country === 'TR') {
      const d = findDistrict(city.name, q.district);
      if (d) {
        const j = jitter(`${placeKey(q.address)}|${placeKey(q.district)}`, 0.01);
        return { lat: round(d.lat + j.dLat), lng: round(d.lng + j.dLng), precision: 'DISTRICT' };
      }
    }
    const j = jitter(`${placeKey(q.address)}|${placeKey(city.name)}`, 0.04);
    return { lat: round(city.lat + j.dLat), lng: round(city.lng + j.dLng), precision: 'CITY' };
  }
}

/**
 * OSRM uyumlu mock: bacak başına büyük daire × 1.25 yol katsayısı, 65 km/s tır ortalaması.
 * Tek bacak 3500 km'yi aşarsa (ör. denizaşırı) rota yok sayılır.
 */
export class MockRoutingProvider implements IRoutingProvider {
  constructor(
    private readonly roadFactor = 1.25,
    private readonly speedKmh = 65,
  ) {}

  async route(points: LatLng[]): Promise<RouteResult> {
    await Promise.resolve();
    if (points.length < 2) throw new RouteNotFoundError('En az iki nokta gerekli');
    const legs = points.slice(1).map((p, i) => {
      const km = Distance.between(points[i]!, p).km * this.roadFactor;
      if (km > 3500) throw new RouteNotFoundError();
      return {
        distanceM: Math.round(km * 1000),
        durationS: Math.round((km / this.speedKmh) * 3600),
      };
    });
    return {
      distanceM: legs.reduce((a, l) => a + l.distanceM, 0),
      durationS: legs.reduce((a, l) => a + l.durationS, 0),
      legs,
    };
  }
}

/** Gerçek OSRM sunucusu (ROUTING_PROVIDER=osrm, OSRM_BASE_URL). */
export class OsrmRoutingProvider implements IRoutingProvider {
  constructor(private readonly baseUrl: string) {}

  async route(points: LatLng[]): Promise<RouteResult> {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const res = await fetch(`${this.baseUrl}/route/v1/driving/${coords}?overview=false`);
    const body = (await res.json()) as {
      code: string;
      routes?: {
        distance: number;
        duration: number;
        legs: { distance: number; duration: number }[];
      }[];
    };
    const r = body.routes?.[0];
    if (body.code !== 'Ok' || !r) throw new RouteNotFoundError();
    return {
      distanceM: r.distance,
      durationS: r.duration,
      legs: r.legs.map((l) => ({ distanceM: l.distance, durationS: l.duration })),
    };
  }
}

export class MockSmsProvider implements ISmsProvider {
  private readonly logger = new Logger('MockSms');
  async send(to: string, text: string): Promise<{ id: string }> {
    await Promise.resolve();
    this.logger.log({ to, text }, 'SMS (mock)');
    return { id: randomUUID() };
  }
}

export class MockPaymentProvider implements IPaymentProvider {
  async authorize(): Promise<PaymentIntent> {
    await Promise.resolve();
    return { id: randomUUID(), status: 'PENDING' };
  }
  async capture(intentId: string): Promise<PaymentIntent> {
    await Promise.resolve();
    return { id: intentId, status: 'PENDING' };
  }
}

/** Checksum + sabit ret listesi. Gerçek: GİB / e-Devlet sorgusu. */
export class MockTaxIdVerifier implements ITaxIdVerifier {
  static readonly DENYLIST = new Set(['1111111111', '0000000000']);
  async verify(taxNumber: string, taxOffice?: string): Promise<TaxIdVerification> {
    await Promise.resolve();
    if (!isValidTaxNumber(taxNumber)) return { valid: false, reason: 'CHECKSUM' };
    if (MockTaxIdVerifier.DENYLIST.has(taxNumber))
      return { valid: false, reason: 'NOT_REGISTERED' };
    return { valid: true, taxOffice };
  }
}

export class LocalFileStorage implements IFileStorage {
  private readonly root: string;
  constructor(
    rootDir: string,
    private readonly publicBaseUrl: string,
    private readonly secret: string,
  ) {
    this.root = resolve(rootDir);
  }

  private pathFor(key: string): string {
    const p = normalize(join(this.root, key));
    if (!p.startsWith(this.root)) throw new Error('Invalid storage key');
    return p;
  }

  async put(key: string, data: Buffer, _mimeType?: string): Promise<StoredFile> {
    const p = this.pathFor(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    return {
      key,
      sizeBytes: data.length,
      checksumSha256: createHash('sha256').update(data).digest('hex'),
    };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  private sign(key: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`${key}|${exp}`).digest('base64url');
  }

  signedUrl(key: string, ttlSec = 600): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const q = new URLSearchParams({ key, exp: String(exp), sig: this.sign(key, exp) });
    return `${this.publicBaseUrl}/api/v1/files?${q.toString()}`;
  }

  verifySignature(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
    const expected = Buffer.from(this.sign(key, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}
