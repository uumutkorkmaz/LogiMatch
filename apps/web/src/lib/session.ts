// BFF oturumu (ARCHITECTURE §6): token'lar yalnızca httpOnly cookie'de; tarayıcı JS'i görmez.

export const ACCESS_COOKIE = 'lm_at';
export const REFRESH_COOKIE = 'lm_rt';
export const COMPANY_COOKIE = 'lm_company';

/** Sunucu tarafı API adresi (docker ağında iç adres), yoksa public adres. */
export function apiBaseUrl(): string {
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:4000/api/v1'
  ).replace(/\/$/, '');
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface CookieWriter {
  set(name: string, value: string, opts: Record<string, unknown>): void;
  delete(name: string): void;
}

const secure = () => process.env.COOKIE_SECURE === 'true';

export function writeTokens(cookies: CookieWriter, t: TokenPair): void {
  const base = { httpOnly: true, sameSite: 'lax', secure: secure(), path: '/' };
  cookies.set(ACCESS_COOKIE, t.accessToken, { ...base, expires: new Date(t.accessTokenExpiresAt) });
  cookies.set(REFRESH_COOKIE, t.refreshToken, {
    ...base,
    expires: new Date(t.refreshTokenExpiresAt),
  });
}

export function clearTokens(cookies: CookieWriter): void {
  cookies.delete(ACCESS_COOKIE);
  cookies.delete(REFRESH_COOKIE);
}

export interface TokenClaims {
  sub: string;
  role: 'SHIPPER_USER' | 'CARRIER_USER' | 'DRIVER' | 'ADMIN' | 'OPS';
  exp: number;
}

/** Yalnızca yönlendirme için JWT payload'ı okunur (doğrulama API'de). */
export function decodeClaims(token: string | undefined): TokenClaims | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as TokenClaims;
  } catch {
    return null;
  }
}

export function homeFor(role: TokenClaims['role'] | undefined): string {
  if (role === 'ADMIN' || role === 'OPS') return '/admin';
  if (role === 'CARRIER_USER' || role === 'DRIVER') return '/carrier';
  return '/dashboard';
}
