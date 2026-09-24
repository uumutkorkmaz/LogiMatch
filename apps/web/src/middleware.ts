import { type NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  apiBaseUrl,
  clearTokens,
  decodeClaims,
  homeFor,
  REFRESH_COOKIE,
  type TokenPair,
  writeTokens,
} from '@/lib/session';

const PROTECTED = ['/dashboard', '/carrier', '/admin', '/onboarding', '/account'];

/**
 * - Korumalı sayfalarda access token yoksa/bitmek üzereyse refresh token ile yeniler.
 * - Oturum yoksa /login'e yönlendirir.
 * - Rol bazlı panel yönlendirmesi (gerçek yetki kontrolü her zaman API'de).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return NextResponse.next();

  let access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  let claims = decodeClaims(access);
  const expiringSoon = !claims || claims.exp * 1000 - Date.now() < 30_000;
  let refreshed: TokenPair | null = null;

  if (expiringSoon && refresh) {
    const r = await fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
      cache: 'no-store',
    }).catch(() => null);
    if (r?.ok) {
      refreshed = (await r.json()) as TokenPair;
      access = refreshed.accessToken;
      claims = decodeClaims(access);
    }
  }

  if (!claims || claims.exp * 1000 < Date.now()) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname);
    const res = NextResponse.redirect(url);
    clearTokens(res.cookies);
    return res;
  }

  // Admin paneli yalnızca ADMIN/OPS; diğer paneller personel için de açık (destek).
  if (pathname.startsWith('/admin') && claims.role !== 'ADMIN' && claims.role !== 'OPS') {
    return NextResponse.redirect(new URL(homeFor(claims.role), req.url));
  }

  // Yenilenen token'ı aynı istekte Server Component'ler de görsün.
  const headers = new Headers(req.headers);
  if (refreshed) {
    const cookie = req.cookies
      .getAll()
      .filter((c) => c.name !== ACCESS_COOKIE && c.name !== REFRESH_COOKIE)
      .map((c) => `${c.name}=${c.value}`)
      .concat([
        `${ACCESS_COOKIE}=${refreshed.accessToken}`,
        `${REFRESH_COOKIE}=${refreshed.refreshToken}`,
      ])
      .join('; ');
    headers.set('cookie', cookie);
  }
  const res = NextResponse.next({ request: { headers } });
  if (refreshed) writeTokens(res.cookies, refreshed);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
