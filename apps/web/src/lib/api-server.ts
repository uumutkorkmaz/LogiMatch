import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, toProblem } from './problem';
import { ACCESS_COOKIE, apiBaseUrl, COMPANY_COOKIE } from './session';

/**
 * Server Component'lerden API çağrısı. Token cookie'den okunur; middleware süresi dolan
 * access token'ı önceden yeniler. 401 → giriş sayfası.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  const company = store.get(COMPANY_COOKIE)?.value;
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(company ? { 'X-Company-Id': company } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) redirect('/login');
  if (!res.ok) throw new ApiError(await toProblem(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** 404/403'ü null'a çevirir (sayfa kendi boş durumunu gösterir). */
export async function apiOrNull<T>(path: string): Promise<T | null> {
  try {
    return await api<T>(path);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) return null;
    throw err;
  }
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}
