// Harici sağlayıcı arayüzleri (ARCHITECTURE §9). MVP'de mock'lar bağlı; gerçek sağlayıcılar
// aynı token'la değiştirilebilir.
import type { LatLng } from '@logimatch/shared';

export interface GeocodeQuery {
  address: string;
  city: string;
  district?: string;
  country: string;
}
export interface GeocodeResult extends LatLng {
  precision: 'ADDRESS' | 'DISTRICT' | 'CITY';
}
export interface IGeocodingProvider {
  /** Bulunamazsa null (#20: ilan DRAFT'ta kalır, pin istenir). */
  geocode(q: GeocodeQuery): Promise<GeocodeResult | null>;
}

/** OSRM `route` servisiyle uyumlu çıktı. */
export interface RouteResult {
  distanceM: number;
  durationS: number;
  legs: { distanceM: number; durationS: number }[];
}
export class RouteNotFoundError extends Error {
  readonly code = 'ROUTE_NOT_FOUND';
  constructor(message = 'Karayolu rotası bulunamadı') {
    super(message);
  }
}
export interface IRoutingProvider {
  /** Noktalar sırasıyla; rota yoksa RouteNotFoundError (#21). */
  route(points: LatLng[]): Promise<RouteResult>;
}

export interface ISmsProvider {
  send(to: string, text: string): Promise<{ id: string }>;
}

export interface PaymentIntent {
  id: string;
  status: 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED';
}
export interface IPaymentProvider {
  authorize(amount: string, currency: string, reference: string): Promise<PaymentIntent>;
  capture(intentId: string): Promise<PaymentIntent>;
}

export interface TaxIdVerification {
  valid: boolean;
  registeredName?: string;
  taxOffice?: string;
  reason?: string;
}
export interface ITaxIdVerifier {
  verify(taxNumber: string, taxOffice?: string): Promise<TaxIdVerification>;
}

export interface StoredFile {
  key: string;
  sizeBytes: number;
  checksumSha256: string;
}
export interface IFileStorage {
  put(key: string, data: Buffer, mimeType: string): Promise<StoredFile>;
  get(key: string): Promise<Buffer>;
  /** Süreli, imzalı indirme URL'i; belgeler asla public değildir. */
  signedUrl(key: string, ttlSec?: number): string;
  verifySignature(key: string, exp: number, sig: string): boolean;
}

export const GEOCODING = Symbol('IGeocodingProvider');
export const ROUTING = Symbol('IRoutingProvider');
export const SMS = Symbol('ISmsProvider');
export const PAYMENT = Symbol('IPaymentProvider');
export const TAX_ID = Symbol('ITaxIdVerifier');
export const FILE_STORAGE = Symbol('IFileStorage');
