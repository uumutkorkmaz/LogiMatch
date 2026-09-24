import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import {
  apiBaseUrl,
  clearTokens,
  COMPANY_COOKIE,
  decodeClaims,
  homeFor,
  REFRESH_COOKIE,
  type TokenPair,
  writeTokens,
} from '@/lib/session';

/** POST /api/auth/{login|register|logout|company} — token'ları httpOnly cookie'ye yazar. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const store = await cookies();

  if (action === 'logout') {
    const rt = store.get(REFRESH_COOKIE)?.value;
    if (rt) {
      await fetch(`${apiBaseUrl()}/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      }).catch(() => undefined);
    }
    const res = NextResponse.json({ ok: true });
    clearTokens(res.cookies);
    res.cookies.delete(COMPANY_COOKIE);
    return res;
  }

  if (action === 'company') {
    // Aktif firma seçimi (BOTH / çoklu üyelik).
    const { companyId } = (await req.json()) as { companyId: string };
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COMPANY_COOKIE, companyId, { httpOnly: true, sameSite: 'lax', path: '/' });
    return res;
  }

  if (action !== 'login' && action !== 'register') {
    return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  }

  const upstream = await fetch(`${apiBaseUrl()}/auth/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
    },
    body: await req.text(),
    cache: 'no-store',
  });
  const body = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
  if (!upstream.ok) return NextResponse.json(body, { status: upstream.status });

  const tokens = (action === 'login' ? body : body.tokens) as TokenPair;
  const role = decodeClaims(tokens.accessToken)?.role;
  const res = NextResponse.json({
    ok: true,
    role,
    home: action === 'register' ? '/onboarding' : homeFor(role),
    devCode: body.devCode,
  });
  writeTokens(res.cookies, tokens);
  return res;
}
