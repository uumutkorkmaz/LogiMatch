import type { Page } from '@logimatch/shared';

export interface PageQuery {
  cursor?: string;
  limit: number;
}

/**
 * Cursor tabanlı sayfalama. Kimlikler UUID v7 (zaman sıralı) olduğundan `orderBy: { id: 'desc' }`
 * ile kararlı sıralama sağlanır; cursor = son öğenin id'si.
 */
export async function paginate<T extends { id: string }>(
  q: PageQuery,
  fetch: (args: { take: number; skip?: number; cursor?: { id: string } }) => Promise<T[]>,
): Promise<Page<T>> {
  const rows = await fetch({
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export function mapPage<T, U>(page: Page<T>, fn: (t: T) => U): Page<U> {
  return { items: page.items.map(fn), nextCursor: page.nextCursor };
}
