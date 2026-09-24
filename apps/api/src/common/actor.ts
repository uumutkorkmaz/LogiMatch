import type {
  CompanyRole,
  CompanyStatus,
  CompanyType,
  UserRole,
  UserStatus,
  VerificationStatus,
} from '@logimatch/shared';
import { forbidden } from './errors';

export interface Membership {
  companyId: string;
  companyRole: CompanyRole;
  companyType: CompanyType;
  companyStatus: CompanyStatus;
  verificationStatus: VerificationStatus;
}

/** İsteği yapan kimlik: platform rolü + firma üyelikleri. Guard tarafından doldurulur. */
export interface AuthActor {
  userId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  memberships: Membership[];
  /** X-Company-Id başlığıyla seçilen ya da ilk üyelik. */
  activeCompanyId: string | null;
  isStaff: boolean;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export const STAFF_ROLES: readonly UserRole[] = ['ADMIN', 'OPS'];

export function membershipOf(actor: AuthActor, companyId: string): Membership | undefined {
  return actor.memberships.find((m) => m.companyId === companyId);
}

export function isMemberOf(actor: AuthActor, companyId: string): boolean {
  return !!membershipOf(actor, companyId);
}

/** DOMAIN §2 firma içi rol tablosu. */
export const COMPANY_PERMISSIONS = {
  'company:manage': ['OWNER'],
  'listing:write': ['OWNER', 'MANAGER', 'DISPATCHER'],
  'offer:write': ['OWNER', 'MANAGER', 'DISPATCHER'],
  'shipment:cancel': ['OWNER', 'MANAGER'],
  'shipment:operate': ['OWNER', 'MANAGER', 'DISPATCHER'],
  'finance:read': ['OWNER', 'MANAGER', 'ACCOUNTANT'],
  'fleet:write': ['OWNER', 'MANAGER', 'DISPATCHER'],
  'member:read': ['OWNER', 'MANAGER', 'DISPATCHER', 'ACCOUNTANT'],
} as const satisfies Record<string, readonly CompanyRole[]>;

export type CompanyPermission = keyof typeof COMPANY_PERMISSIONS;

export function hasCompanyPermission(
  actor: AuthActor,
  companyId: string,
  permission: CompanyPermission,
): boolean {
  const m = membershipOf(actor, companyId);
  return !!m && (COMPANY_PERMISSIONS[permission] as readonly string[]).includes(m.companyRole);
}

/** Staff her firmada yetkilidir; diğerleri üyelik ve rol ister. */
export function assertCompanyPermission(
  actor: AuthActor,
  companyId: string,
  permission: CompanyPermission,
): void {
  if (actor.isStaff) return;
  if (!hasCompanyPermission(actor, companyId, permission)) {
    throw forbidden(
      'COMPANY_PERMISSION_DENIED',
      `Bu işlem için firmada '${permission}' yetkisi gerekli`,
    );
  }
}

/** Aktif firmayı döner; yoksa veya tipi uymuyorsa 403. */
export function requireActiveCompany(
  actor: AuthActor,
  opts: { kind?: 'SHIPPER' | 'CARRIER'; permission?: CompanyPermission } = {},
): Membership {
  const m = actor.activeCompanyId ? membershipOf(actor, actor.activeCompanyId) : undefined;
  if (!m) throw forbidden('COMPANY_REQUIRED', 'Önce bir firma oluşturun veya bir firmaya katılın');
  if (opts.kind && m.companyType !== opts.kind && m.companyType !== 'BOTH') {
    throw forbidden(
      'COMPANY_TYPE_MISMATCH',
      opts.kind === 'SHIPPER'
        ? 'Bu işlem yük veren firmalar içindir'
        : 'Bu işlem taşıyıcı firmalar içindir',
    );
  }
  if (opts.permission) assertCompanyPermission(actor, m.companyId, opts.permission);
  return m;
}

/** İlan yayınlama ve eşleştirme için: firma doğrulanmış ve aktif olmalı. */
export function assertCompanyOperational(m: Membership): void {
  if (m.companyStatus !== 'ACTIVE') {
    throw forbidden('COMPANY_NOT_ACTIVE', 'Firma askıda veya incelemede');
  }
  if (m.verificationStatus !== 'VERIFIED') {
    throw forbidden('COMPANY_NOT_VERIFIED', 'Firma doğrulanmadan ilan yayınlanamaz');
  }
}
