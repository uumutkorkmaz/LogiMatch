import { z } from 'zod';
import { PAGINATION_DEFAULT_LIMIT, PAGINATION_MAX_LIMIT } from '../constants';
import { CURRENCIES } from '../enums';

export const uuidSchema = z.string().uuid();

/** ISO tarih (UTC veya offset'li) → Date. */
export const dateSchema = z.coerce.date({ invalid_type_error: 'Geçersiz tarih' });

/** Para: API'de string taşınır ("12500.50"); en fazla 2 ondalık, pozitif. */
export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), { message: 'Geçersiz tutar' })
  .refine((v) => Number(v) > 0, { message: 'Tutar sıfırdan büyük olmalı' });

export const currencySchema = z.enum(CURRENCIES);

export const countryCodeSchema = z
  .string()
  .length(2)
  .transform((v) => v.toUpperCase());

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const locationInputSchema = z.object({
  address: z.string().trim().min(3).max(300),
  city: z.string().trim().min(2).max(80),
  district: z.string().trim().max(80).optional(),
  country: countryCodeSchema.default('TR'),
  /** Kullanıcı haritadan pin koyduysa dolu gelir; yoksa geocode edilir (#20). */
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type LocationInput = z.infer<typeof locationInputSchema>;

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
});

const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');
export const booleanQuery = boolish.optional();

/** "minLng,minLat,maxLng,maxLat" */
export const bboxSchema = z
  .string()
  .transform((v, ctx) => {
    const parts = v.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox = minLng,minLat,maxLng,maxLat' });
      return z.NEVER;
    }
    const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
    return { minLng, minLat, maxLng, maxLat };
  });

export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
