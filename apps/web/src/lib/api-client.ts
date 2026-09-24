'use client';

import { ApiError, toProblem } from './problem';

/**
 * Tarayıcıdan API çağrısı: aynı origin'deki BFF proxy'si (/api/proxy/...) üzerinden.
 * Proxy cookie'deki token'ı ekler ve gerekirse yeniler.
 */
export async function clientApi<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api/proxy${path}`, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError({ status: 401, code: 'UNAUTHORIZED' });
  }
  if (!res.ok) throw new ApiError(await toProblem(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const post = <T>(path: string, json?: unknown, headers?: Record<string, string>) =>
  clientApi<T>(path, { method: 'POST', json: json ?? {}, headers });
export const patch = <T>(path: string, json: unknown) =>
  clientApi<T>(path, { method: 'PATCH', json });
export const del = <T>(path: string) => clientApi<T>(path, { method: 'DELETE' });

/** Hata mesajını kullanıcıya gösterilecek metne çevirir. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const fields = err.problem.errors?.map((e) => `${e.path}: ${e.message}`).join(' · ');
    return fields ? `${err.message} — ${fields}` : err.message;
  }
  return err instanceof Error ? err.message : 'Beklenmeyen hata';
}
