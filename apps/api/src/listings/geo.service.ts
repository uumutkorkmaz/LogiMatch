import { Inject, Injectable } from '@nestjs/common';
import type { LatLng, LocationInput } from '@logimatch/shared';
import {
  GEOCODING,
  type IGeocodingProvider,
  type IRoutingProvider,
  ROUTING,
  RouteNotFoundError,
} from '../integrations/ports';

export interface ResolvedLocation {
  lat: number | null;
  lng: number | null;
  source: 'PIN' | 'GEOCODED' | 'FAILED';
}

@Injectable()
export class GeoService {
  constructor(
    @Inject(GEOCODING) private readonly geocoder: IGeocodingProvider,
    @Inject(ROUTING) private readonly routing: IRoutingProvider,
  ) {}

  /** Kullanıcı pini varsa onu kullanır; yoksa geocode eder; bulunamazsa FAILED (#20). */
  async resolve(loc: LocationInput): Promise<ResolvedLocation> {
    if (loc.lat != null && loc.lng != null) return { lat: loc.lat, lng: loc.lng, source: 'PIN' };
    const r = await this.geocoder.geocode({
      address: loc.address,
      city: loc.city,
      district: loc.district,
      country: loc.country,
    });
    return r
      ? { lat: r.lat, lng: r.lng, source: 'GEOCODED' }
      : { lat: null, lng: null, source: 'FAILED' };
  }

  /** Rota (tüm duraklar üzerinden, #22). Bulunamazsa null (#21). */
  async route(points: LatLng[]): Promise<{ distanceKm: number; durationMin: number } | null> {
    try {
      const r = await this.routing.route(points);
      return {
        distanceKm: Math.round(r.distanceM / 100) / 10,
        durationMin: Math.round(r.durationS / 60),
      };
    } catch (err) {
      if (err instanceof RouteNotFoundError) return null;
      throw err;
    }
  }
}
