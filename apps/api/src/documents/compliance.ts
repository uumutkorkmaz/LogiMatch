import type { DocumentOwnerType, DocumentType, RequirementScope } from '@logimatch/shared';

export interface Rule {
  ownerType: DocumentOwnerType;
  scope: RequirementScope;
  anyOf: DocumentType[];
}

export interface DocForCompliance {
  type: DocumentType;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  expiresAt: Date | null;
}

/** Süresiz belge (ör. imza sirküleri) için "çok uzak gelecek". */
export const NO_EXPIRY = new Date('9999-12-31T00:00:00Z');

/**
 * Bir kapsamın geçerlilik bitişi: her `anyOf` grubu için en geç biten geçerli belge;
 * gruplar arasında en erken biten. Bir grup karşılanmıyorsa null (ARCHITECTURE §7.3).
 */
export function scopeValidUntil(
  rules: Rule[],
  scope: RequirementScope,
  docs: DocForCompliance[],
  now: Date,
): Date | null {
  const groups = rules.filter((r) => r.scope === scope);
  if (groups.length === 0) return NO_EXPIRY;
  let min: Date | null = NO_EXPIRY;
  for (const g of groups) {
    const valid = docs
      .filter((d) => d.status === 'APPROVED' && g.anyOf.includes(d.type))
      .map((d) => d.expiresAt ?? NO_EXPIRY)
      .filter((e) => e.getTime() > now.getTime());
    if (valid.length === 0) return null;
    const best = new Date(Math.max(...valid.map((d) => d.getTime())));
    if (min && best.getTime() < min.getTime()) min = best;
  }
  return min;
}

const minDate = (...ds: (Date | null)[]): Date | null =>
  ds.some((d) => d === null) ? null : new Date(Math.min(...ds.map((d) => d!.getTime())));

export interface ComplianceResult {
  complianceValidUntil: Date | null;
  intlValidUntil?: Date | null;
  adrValidUntil?: Date | null;
}

/** Sahip tipine göre önbellek alanlarını hesaplar. */
export function computeCompliance(
  ownerType: DocumentOwnerType,
  rules: Rule[],
  docs: DocForCompliance[],
  now: Date,
  opts: { trailerType?: string } = {},
): ComplianceResult {
  const own = rules.filter((r) => r.ownerType === ownerType);
  const domestic = scopeValidUntil(own, 'DOMESTIC', docs, now);
  switch (ownerType) {
    case 'COMPANY':
      return {
        complianceValidUntil: domestic,
        intlValidUntil: minDate(domestic, scopeValidUntil(own, 'INTERNATIONAL', docs, now)),
      };
    case 'DRIVER':
      return {
        complianceValidUntil: domestic,
        intlValidUntil: minDate(domestic, scopeValidUntil(own, 'INTERNATIONAL', docs, now)),
        adrValidUntil: minDate(domestic, scopeValidUntil(own, 'ADR', docs, now)),
      };
    case 'TRAILER': {
      const atp =
        opts.trailerType === 'FRIGO_ATP'
          ? scopeValidUntil(own, 'TEMP_CONTROLLED', docs, now)
          : null;
      const base = opts.trailerType === 'FRIGO_ATP' ? minDate(domestic, atp) : domestic;
      return {
        complianceValidUntil: base,
        adrValidUntil: minDate(base, scopeValidUntil(own, 'ADR', docs, now)),
      };
    }
    case 'VEHICLE':
      // Uluslararası (CMR sigortası) kısıtı şirketin intl belgesine ek olarak burada tutulmaz;
      // araç için tek alan var: yurt içi zorunlular.
      return { complianceValidUntil: domestic };
    default:
      return { complianceValidUntil: domestic };
  }
}

/** Varsayılan kural seti (DOMAIN §3.1); seed bunu yazar, admin config'ten değiştirir. */
export const DEFAULT_RULES: (Rule & { description: string })[] = [
  {
    ownerType: 'COMPANY',
    scope: 'DOMESTIC',
    anyOf: ['TAX_CERTIFICATE'],
    description: 'Vergi levhası',
  },
  {
    ownerType: 'COMPANY',
    scope: 'DOMESTIC',
    anyOf: ['SIGNATURE_CIRCULAR'],
    description: 'İmza sirküleri',
  },
  {
    ownerType: 'COMPANY',
    scope: 'DOMESTIC',
    anyOf: ['ACTIVITY_CERTIFICATE'],
    description: 'Faaliyet belgesi',
  },
  {
    ownerType: 'COMPANY',
    scope: 'DOMESTIC',
    anyOf: ['K1', 'L1', 'L2', 'C2', 'C3', 'R1', 'R2'],
    description: 'Taşımacılık yetki belgesi (K2/K3 kabul edilmez)',
  },
  {
    ownerType: 'COMPANY',
    scope: 'DOMESTIC',
    anyOf: ['CARRIER_LIABILITY'],
    description: 'Taşımacı mali sorumluluk sigortası',
  },
  {
    ownerType: 'COMPANY',
    scope: 'INTERNATIONAL',
    anyOf: ['C2', 'C3', 'L2', 'R1'],
    description: 'Uluslararası yetki belgesi',
  },
  { ownerType: 'VEHICLE', scope: 'DOMESTIC', anyOf: ['VEHICLE_LICENSE'], description: 'Ruhsat' },
  { ownerType: 'VEHICLE', scope: 'DOMESTIC', anyOf: ['INSPECTION'], description: 'Muayene' },
  {
    ownerType: 'VEHICLE',
    scope: 'INTERNATIONAL',
    anyOf: ['CMR_INSURANCE'],
    description: 'CMR sigortası',
  },
  {
    ownerType: 'TRAILER',
    scope: 'DOMESTIC',
    anyOf: ['VEHICLE_LICENSE'],
    description: 'Dorse ruhsatı',
  },
  {
    ownerType: 'TRAILER',
    scope: 'DOMESTIC',
    anyOf: ['INSPECTION'],
    description: 'Dorse muayenesi',
  },
  {
    ownerType: 'TRAILER',
    scope: 'TEMP_CONTROLLED',
    anyOf: ['ATP_CERTIFICATE'],
    description: 'ATP sertifikası (FRIGO_ATP)',
  },
  {
    ownerType: 'TRAILER',
    scope: 'ADR',
    anyOf: ['ADR_CERTIFICATE'],
    description: 'ADR uygunluk belgesi',
  },
  {
    ownerType: 'DRIVER',
    scope: 'DOMESTIC',
    anyOf: ['DRIVING_LICENSE'],
    description: 'Sürücü belgesi',
  },
  { ownerType: 'DRIVER', scope: 'DOMESTIC', anyOf: ['PSIKOTEKNIK'], description: 'Psikoteknik' },
  {
    ownerType: 'DRIVER',
    scope: 'DOMESTIC',
    anyOf: ['SRC3', 'SRC4'],
    description: 'SRC (eşya taşımacılığı)',
  },
  {
    ownerType: 'DRIVER',
    scope: 'INTERNATIONAL',
    anyOf: ['SRC3'],
    description: 'SRC3 (uluslararası)',
  },
  { ownerType: 'DRIVER', scope: 'INTERNATIONAL', anyOf: ['PASSPORT'], description: 'Pasaport' },
  {
    ownerType: 'DRIVER',
    scope: 'ADR',
    anyOf: ['ADR_CERTIFICATE', 'SRC5'],
    description: 'ADR sürücü sertifikası',
  },
];
