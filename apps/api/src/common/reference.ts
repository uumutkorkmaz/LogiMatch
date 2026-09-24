import type { DbOrTx } from '../infra/prisma';

export type ReferencePrefix = 'LD' | 'TP' | 'SH' | 'INV';

/** İstanbul yılı (UTC+3) — 31 Aralık 22:00 UTC sonrası yeni yıl sayılır. */
function istanbulYear(now: Date): number {
  return new Date(now.getTime() + 3 * 3_600_000).getUTCFullYear();
}

/** `LD-2026-000123` — yıl bazlı sayaç, transaction içinde atomik artar. */
export async function nextReference(
  tx: DbOrTx,
  prefix: ReferencePrefix,
  now = new Date(),
): Promise<string> {
  const year = istanbulYear(now);
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "ReferenceCounter"(prefix, year, value) VALUES (${prefix}, ${year}, 1)
    ON CONFLICT (prefix, year) DO UPDATE SET value = "ReferenceCounter".value + 1
    RETURNING value`;
  return `${prefix}-${year}-${String(rows[0]!.value).padStart(6, '0')}`;
}
