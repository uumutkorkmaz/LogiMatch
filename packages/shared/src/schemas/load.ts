import { z } from 'zod';
import {
  CURRENCIES,
  HANDLING_METHODS,
  LOAD_STATUSES,
  PALLET_TYPES,
  PAYMENT_TERMS,
  PRICING_MODES,
  STOP_TYPES,
  TRAILER_FEATURES,
  TRAILER_TYPES,
  TRANSPORT_SCOPES,
  VISIBILITIES,
} from '../enums';
import {
  amountSchema,
  bboxSchema,
  booleanQuery,
  dateSchema,
  locationInputSchema,
  paginationQuerySchema,
  uuidSchema,
} from './common';
import { ADR_CLASSES } from './fleet';

export const INCOTERMS = [
  'EXW',
  'FCA',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
] as const;

export const windowedLocationSchema = locationInputSchema.extend({
  windowStart: dateSchema,
  windowEnd: dateSchema,
});
export type WindowedLocationInput = z.infer<typeof windowedLocationSchema>;

export const loadStopInputSchema = windowedLocationSchema.extend({
  type: z.enum(STOP_TYPES),
  weightKg: z.number().int().positive().optional(),
  volumeM3: z.number().positive().optional(),
  loadingMeters: z.number().positive().optional(),
  palletCount: z.number().int().positive().optional(),
});
export type LoadStopInput = z.infer<typeof loadStopInputSchema>;

export const loadFieldsSchema = z.object({
  pickup: windowedLocationSchema,
  delivery: windowedLocationSchema,
  /** Ara duraklar (ilk yükleme ve son teslim hariç), sırasıyla. */
  stops: z.array(loadStopInputSchema).max(8).default([]),

  cargoType: z.string().trim().min(2).max(80),
  cargoDescription: z.string().trim().max(1000).optional(),
  weightKg: z.number().int().positive().max(100_000),
  volumeM3: z.number().positive().max(200).optional(),
  loadingMeters: z.number().positive().max(25).optional(),
  palletCount: z.number().int().positive().max(80).optional(),
  palletType: z.enum(PALLET_TYPES).optional(),
  isStackable: z.boolean().default(false),
  isFragile: z.boolean().default(false),
  declaredValue: amountSchema.optional(),
  maxPieceLengthCm: z.number().int().positive().max(3000).optional(),
  maxPieceWidthCm: z.number().int().positive().max(500).optional(),
  maxPieceHeightCm: z.number().int().positive().max(500).optional(),

  requiredTrailerTypes: z.array(z.enum(TRAILER_TYPES)).min(1, 'En az bir dorse tipi seçin'),
  requiredFeatures: z.array(z.enum(TRAILER_FEATURES)).default([]),

  isAdr: z.boolean().default(false),
  adrClass: z.enum(ADR_CLASSES).optional(),
  unNumber: z
    .string()
    .regex(/^\d{4}$/, 'UN numarası 4 hane')
    .optional(),
  packingGroup: z.enum(['I', 'II', 'III']).optional(),

  requiresTempControl: z.boolean().default(false),
  minTempC: z.number().min(-40).max(40).optional(),
  maxTempC: z.number().min(-40).max(40).optional(),

  loadingMethod: z.enum(HANDLING_METHODS).optional(),
  unloadingMethod: z.enum(HANDLING_METHODS).optional(),

  transportScope: z.enum(TRANSPORT_SCOPES).default('DOMESTIC'),
  customsRequired: z.boolean().default(false),
  incoterm: z.enum(INCOTERMS).optional(),

  pricingMode: z.enum(PRICING_MODES),
  budgetMin: amountSchema.optional(),
  budgetMax: amountSchema.optional(),
  currency: z.enum(CURRENCIES).default('TRY'),
  paymentTerm: z.enum(PAYMENT_TERMS).default('VADELI_30'),
  withholdingApplies: z.boolean().default(false),

  expiresAt: dateSchema.optional(),
  visibility: z.enum(VISIBILITIES).default('PUBLIC'),
  invitedCarrierCompanyIds: z.array(uuidSchema).max(50).default([]),
});
export type LoadFieldsInput = z.infer<typeof loadFieldsSchema>;

/** Çapraz alan kuralları — create'te ve PATCH sonrası birleşmiş halde uygulanır. */
export function loadCrossFieldIssues(v: LoadFieldsInput): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const t = (d: Date) => d.getTime();
  if (t(v.pickup.windowStart) >= t(v.pickup.windowEnd))
    issues.push({ path: 'pickup.windowEnd', message: 'Pencere sonu başlangıçtan sonra olmalı' });
  if (t(v.delivery.windowStart) >= t(v.delivery.windowEnd))
    issues.push({ path: 'delivery.windowEnd', message: 'Pencere sonu başlangıçtan sonra olmalı' });
  if (t(v.delivery.windowEnd) <= t(v.pickup.windowStart))
    issues.push({ path: 'delivery.windowEnd', message: 'Teslim, yüklemeden sonra olmalı' });
  if (v.isAdr && (!v.adrClass || !v.unNumber))
    issues.push({ path: 'adrClass', message: 'ADR yükte sınıf ve UN numarası zorunlu' });
  if (v.requiresTempControl) {
    if (v.minTempC === undefined || v.maxTempC === undefined)
      issues.push({ path: 'minTempC', message: 'Sıcaklık aralığı zorunlu' });
    else if (v.minTempC > v.maxTempC) issues.push({ path: 'minTempC', message: 'min > max' });
  }
  if (v.pricingMode === 'FIXED' && !v.budgetMax)
    issues.push({ path: 'budgetMax', message: 'Sabit fiyatlı ilanda fiyat zorunlu' });
  if (v.budgetMin && v.budgetMax && Number(v.budgetMin) > Number(v.budgetMax))
    issues.push({ path: 'budgetMin', message: 'Alt bütçe üst bütçeden büyük olamaz' });
  if (v.transportScope === 'DOMESTIC' && (v.pickup.country !== 'TR' || v.delivery.country !== 'TR'))
    issues.push({ path: 'transportScope', message: 'Yurt dışı uçlu yük INTERNATIONAL olmalı' });
  if (v.transportScope === 'INTERNATIONAL' && v.pickup.country === v.delivery.country)
    issues.push({ path: 'transportScope', message: 'Uluslararası yükte ülkeler farklı olmalı' });
  if (v.visibility === 'INVITED_ONLY' && v.invitedCarrierCompanyIds.length === 0)
    issues.push({ path: 'invitedCarrierCompanyIds', message: 'Davetli taşıyıcı seçin' });
  for (const [i, s] of v.stops.entries()) {
    if (t(s.windowStart) >= t(s.windowEnd))
      issues.push({ path: `stops.${i}.windowEnd`, message: 'Pencere sonu başlangıçtan sonra olmalı' });
  }
  return issues;
}

export const createLoadSchema = loadFieldsSchema.superRefine((v, ctx) => {
  for (const i of loadCrossFieldIssues(v)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: i.path.split('.'), message: i.message });
  }
});
export type CreateLoadInput = z.infer<typeof createLoadSchema>;

export const updateLoadSchema = loadFieldsSchema.partial();
export type UpdateLoadInput = z.infer<typeof updateLoadSchema>;

export const loadQuerySchema = paginationQuerySchema.extend({
  status: z.enum(LOAD_STATUSES).optional(),
  mine: booleanQuery,
  pickupCity: z.string().trim().optional(),
  deliveryCity: z.string().trim().optional(),
  trailerType: z.enum(TRAILER_TYPES).optional(),
  minWeightKg: z.coerce.number().int().min(0).optional(),
  maxWeightKg: z.coerce.number().int().min(0).optional(),
  isAdr: booleanQuery,
  transportScope: z.enum(TRANSPORT_SCOPES).optional(),
  pickupFrom: dateSchema.optional(),
  pickupTo: dateSchema.optional(),
  bbox: bboxSchema.optional(),
});
export type LoadQuery = z.infer<typeof loadQuerySchema>;

/** Harita pini ile geocoding düzeltmesi (#20). */
export const pinLocationSchema = z.object({
  target: z.enum(['pickup', 'delivery']),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
