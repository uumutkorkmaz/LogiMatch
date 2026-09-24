import { Money } from '@logimatch/shared';
import { Decimal as DecimalJs } from 'decimal.js';

/**
 * API yanıt serileştirmesi: Prisma.Decimal → "123.45" string, Date → ISO,
 * `passwordHash` gibi gizli alanlar asla dışarı çıkmaz.
 */
const HIDDEN = new Set(['passwordHash', 'tokenHash', 'codeHash', 'bodyOriginal', 'passportNumber']);

function isDecimal(v: unknown): v is { toFixed: (n?: number) => string; d: unknown } {
  return (
    v instanceof DecimalJs ||
    (typeof v === 'object' && v !== null && 'toFixed' in v && 'd' in v && 'e' in v && 's' in v)
  );
}

export function toJson(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Money) return value.toString();
  if (isDecimal(value)) return (value as unknown as DecimalJs).toString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (HIDDEN.has(k)) continue;
      out[k] = toJson(v);
    }
    return out;
  }
  return value;
}
