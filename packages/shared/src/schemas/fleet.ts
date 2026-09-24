import { z } from 'zod';
import {
  ASSET_STATUSES,
  DRIVER_STATUSES,
  TRAILER_FEATURES,
  TRAILER_TYPES,
  VEHICLE_TYPES,
} from '../enums';
import { phoneSchema, trPlateSchema } from '../validators/tr-identifiers';
import { dateSchema, latLngSchema } from './common';

const currentYear = new Date().getUTCFullYear();

export const createVehicleSchema = z.object({
  plate: trPlateSchema,
  type: z.enum(VEHICLE_TYPES),
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z
    .number()
    .int()
    .min(1980)
    .max(currentYear + 1),
  euroNorm: z.string().trim().max(10).optional(),
});
export const updateVehicleSchema = createVehicleSchema
  .omit({ plate: true })
  .partial()
  .extend({ status: z.enum(ASSET_STATUSES).optional() });

const trailerBase = z.object({
  plate: trPlateSchema,
  trailerType: z.enum(TRAILER_TYPES),
  isIntegratedBody: z.boolean().default(false),
  capacityKg: z.number().int().positive().max(100_000),
  volumeM3: z.number().positive().max(200),
  lengthCm: z.number().int().positive().max(3000),
  widthCm: z.number().int().positive().max(400),
  heightCm: z.number().int().positive().max(500),
  loadingMeters: z.number().positive().max(25),
  palletCapacity: z.number().int().min(0).max(80),
  axleCount: z.number().int().min(1).max(12),
  features: z.array(z.enum(TRAILER_FEATURES)).default([]),
  minTempC: z.number().min(-40).max(40).optional(),
  maxTempC: z.number().min(-40).max(40).optional(),
});

const tempRefine = <T extends { features?: string[]; minTempC?: number; maxTempC?: number }>(
  v: T,
  ctx: z.RefinementCtx,
) => {
  if (v.features?.includes('TEMP_CONTROLLED')) {
    if (v.minTempC === undefined || v.maxTempC === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minTempC'],
        message: 'Soğutmalı dorsede sıcaklık aralığı zorunlu',
      });
    } else if (v.minTempC > v.maxTempC) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minTempC'], message: 'min > max' });
    }
  }
};

export const createTrailerSchema = trailerBase.superRefine(tempRefine);
export const updateTrailerSchema = trailerBase
  .omit({ plate: true })
  .partial()
  .extend({ status: z.enum(ASSET_STATUSES).optional() })
  .superRefine(tempRefine);

export const ADR_CLASSES = [
  '1',
  '2',
  '3',
  '4.1',
  '4.2',
  '4.3',
  '5.1',
  '5.2',
  '6.1',
  '6.2',
  '7',
  '8',
  '9',
] as const;

export const createDriverSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema.optional(),
  /** Şoföre giriş hesabı açılacaksa e-posta. */
  userEmail: z.string().trim().toLowerCase().email().optional(),
  licenseClasses: z.array(z.string().trim().min(1).max(4)).default([]),
  srcTypes: z.array(z.enum(['SRC1', 'SRC2', 'SRC3', 'SRC4', 'SRC5'])).default([]),
  adrClasses: z.array(z.enum(ADR_CLASSES)).default([]),
  hasPsikoteknik: z.boolean().default(false),
  passportNumber: z.string().trim().max(20).optional(),
  passportValidUntil: dateSchema.optional(),
  visaCountries: z.array(z.string().trim().toUpperCase().min(2).max(10)).default([]),
  homeBase: latLngSchema.optional(),
});
export const updateDriverSchema = createDriverSchema
  .omit({ userEmail: true })
  .partial()
  .extend({ status: z.enum(DRIVER_STATUSES).optional() });
