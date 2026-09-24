import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  apiBaseUrl,
  clearTokens,
  COMPANY_COOKIE,
  REFRESH_COOKIE,
  type TokenPair,
  writeTokens,
} from '@/lib/session';

/**
 * BFF proxy: tarayıcı istekleri buradan API'ye gider. Bearer token cookie'den eklenir;
 * 401'de refresh token ile bir kez yenilenip istek tekrarlanır. Multipart dahil gövde aynen iletilir.
 */
async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const store = await cookies();
  const target = `${apiBaseUrl()}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();

  const send = (token?: string) => {
    const headers = new Headers();
    for (const h of ['content-type', 'accept', 'idempotency-key', 'accept-language']) {
      const v = req.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (token) headers.set('authorization', `Bearer ${token}`);
    const company = store.get(COMPANY_COOKIE)?.value;
    if (company) headers.set('x-company-id', company);
    const fwd = req.headers.get('x-forwarded-for');
    if (fwd) headers.set('x-forwarded-for', fwd);
    return fetch(target, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
    });
  };

  let res = await send(store.get(ACCESS_COOKIE)?.value);
  let refreshed: TokenPair | null = null;
  const rt = store.get(REFRESH_COOKIE)?.value;
  if (res.status === 401 && rt) {
    const r = await fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
      cache: 'no-store',
    });
    if (r.ok) {
      refreshed = (await r.json()) as TokenPair;
      res = await send(refreshed.accessToken);
    }
  }

  const out = new NextResponse(res.status === 204 ? null : await res.arrayBuffer(), {
    status: res.status,
  });
  for (const h of ['content-type', 'content-disposition', 'x-request-id', 'idempotent-replayed']) {
    const v = res.headers.get(h);
    if (v) out.headers.set(h, v);
  }
  if (refreshed) writeTokens(out.cookies, refreshed);
  else if (res.status === 401) clearTokens(out.cookies);
  return out;
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };
