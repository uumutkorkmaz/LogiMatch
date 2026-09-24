export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

export class Distance {
  private constructor(readonly meters: number) {}

  static meters(m: number): Distance {
    if (!Number.isFinite(m) || m < 0) throw new RangeError('Distance must be a non-negative number');
    return new Distance(m);
  }

  static km(km: number): Distance {
    return Distance.meters(km * 1000);
  }

  /** Büyük daire mesafesi. */
  static between(a: LatLng, b: LatLng): Distance {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return new Distance(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
  }

  get km(): number {
    return this.meters / 1000;
  }

  times(factor: number): Distance {
    return Distance.meters(this.meters * factor);
  }

  plus(other: Distance): Distance {
    return new Distance(this.meters + other.meters);
  }

  /** Görüntüleme/kayıt için 1 ondalık km. */
  roundedKm(): number {
    return Math.round(this.km * 10) / 10;
  }
}

/** Nokta ile [a, b] doğru parçası arasındaki yaklaşık en kısa mesafe (eşdikdörtgen projeksiyon). */
export function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): Distance {
  const refLat = ((a.lat + b.lat + p.lat) / 3) * (Math.PI / 180);
  const kx = 111.32 * Math.cos(refLat);
  const ky = 110.574;
  const ax = a.lng * kx,
    ay = a.lat * ky;
  const bx = b.lng * kx,
    by = b.lat * ky;
  const px = p.lng * kx,
    py = p.lat * ky;
  const dx = bx - ax,
    dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx,
    cy = ay + t * dy;
  return Distance.km(Math.hypot(px - cx, py - cy));
}
