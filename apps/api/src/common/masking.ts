// Disintermediation önlemi (DOMAIN §3, ARCHITECTURE §6): anlaşma (Shipment) olana kadar karşı
// tarafın kimliği ve iletişim bilgileri gizlenir; yalnızca güven sinyalleri gösterilir.

export interface MaskedCompany {
  id: string;
  masked: true;
  alias: string;
  city: string;
  verified: boolean;
  rating: number | null;
  ratingCount: number;
  completedShipments: number;
  memberSinceYear: number;
}

export interface CompanyForMask {
  id: string;
  city: string;
  verificationStatus: string;
  createdAt: Date;
  type: string;
  stats?: {
    ratingCount: number;
    ratingSum: number;
    completedAsCarrier: number;
    completedAsShipper: number;
  } | null;
}

export function maskCompany(c: CompanyForMask, side: 'SHIPPER' | 'CARRIER'): MaskedCompany {
  const s = c.stats;
  return {
    id: c.id,
    masked: true,
    alias: `${side === 'CARRIER' ? 'Taşıyıcı' : 'Yük Veren'} #${c.id.replace(/-/g, '').slice(-4).toUpperCase()}`,
    city: c.city,
    verified: c.verificationStatus === 'VERIFIED',
    rating: s && s.ratingCount > 0 ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10 : null,
    ratingCount: s?.ratingCount ?? 0,
    completedShipments:
      side === 'CARRIER' ? (s?.completedAsCarrier ?? 0) : (s?.completedAsShipper ?? 0),
    memberSinceYear: c.createdAt.getUTCFullYear(),
  };
}

/** Plaka: il kodu görünür, gerisi gizli ("34 *** ***"). */
export function maskPlate(plate: string): string {
  const [il] = plate.split(' ');
  return `${il ?? '**'} *** ***`;
}

/** Adres: yalnızca ilçe/il; koordinat ~1 km'ye yuvarlanır. */
export function coarseLocation(lat: number | null, lng: number | null) {
  const r = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
  return { lat: r(lat), lng: r(lng) };
}
