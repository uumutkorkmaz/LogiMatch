import { z } from 'zod';
import { OFFER_STATUSES, SHIPMENT_STATUSES, TRAILER_TYPES, TRANSPORT_SCOPES } from '../enums';
import {
  amountSchema,
  currencySchema,
  dateSchema,
  latLngSchema,
  paginationQuerySchema,
  uuidSchema,
} from './common';

// ── Eşleşme ───────────────────────────────────────────────────────────
export const interestSchema = z.object({ interested: z.boolean() });
export const dismissSchema = z.object({ reason: z.string().trim().min(2).max(300) });

/** Panodan manuel eşleşme: shipper bir posting'e / carrier bir Load'a ilgi gösterir. */
export const manualMatchSchema = z.object({ loadId: uuidSchema, truckPostingId: uuidSchema });

export const matchQuerySchema = paginationQuerySchema.extend({
  status: z.string().optional(),
});

// ── Teklif ───────────────────────────────────────────────────────────
export const createOfferSchema = z.object({
  amount: amountSchema,
  /** Varsayılan 24 saat; en geç pickupWindowStart. */
  validUntil: dateSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const offerQuerySchema = paginationQuerySchema.extend({
  direction: z.enum(['incoming', 'outgoing', 'all']).default('all'),
  status: z.enum(OFFER_STATUSES).optional(),
  matchId: uuidSchema.optional(),
});

// ── Sevkiyat ─────────────────────────────────────────────────────────
export const shipmentStatusUpdateSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  location: latLngSchema.optional(),
  note: z.string().trim().max(1000).optional(),
});

export const shipmentEventSchema = z.object({
  type: z.enum(['DEPARTED_TO_PICKUP', 'NOTE', 'DELAY_REPORTED']),
  note: z.string().trim().max(1000).optional(),
  location: latLngSchema.optional(),
});

export const cancelShipmentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  /** Shipper: araç gelmedi (#9). */
  noShow: z.boolean().default(false),
  /** Yalnızca ops: mücbir sebep, ceza sıfırlanır. */
  forceMajeure: z.boolean().default(false),
});

export const disputeSchema = z.object({ reason: z.string().trim().min(10).max(2000) });

export const resolveDisputeSchema = z.object({
  outcome: z.enum(['COMPLETED', 'CANCELLED']),
  faultParty: z.enum(['SHIPPER', 'CARRIER']).optional(),
  resolution: z.string().trim().min(5).max(2000),
});

export const shipmentQuerySchema = paginationQuerySchema.extend({
  status: z.enum(SHIPMENT_STATUSES).optional(),
  active: z.coerce.boolean().optional(),
});

// ── Değerlendirme ────────────────────────────────────────────────────
const dim = z.number().int().min(1).max(5).optional();
export const ratingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  punctuality: dim,
  communication: dim,
  cargoCare: dim,
  documentation: dim,
  priceHonesty: dim,
  comment: z.string().trim().max(1000).optional(),
});
export type RatingInput = z.infer<typeof ratingSchema>;

// ── Mesaj ────────────────────────────────────────────────────────────
export const sendMessageSchema = z.object({ body: z.string().trim().min(1).max(2000) });

// ── Fiyat ────────────────────────────────────────────────────────────
const point = z.union([
  latLngSchema,
  z.object({ city: z.string().trim().min(2), country: z.string().length(2).default('TR') }),
]);

export const pricingEstimateSchema = z.object({
  origin: point,
  destination: point,
  stops: z.array(latLngSchema).max(8).default([]),
  trailerType: z.enum(TRAILER_TYPES),
  weightKg: z.number().int().positive().max(100_000),
  isAdr: z.boolean().default(false),
  requiresTempControl: z.boolean().default(false),
  transportScope: z.enum(TRANSPORT_SCOPES).default('DOMESTIC'),
  currency: currencySchema.default('TRY'),
  /** Verilirse komisyon/KDV/tevkifat önizlemesi bu tutar üzerinden, yoksa öneri ortasından. */
  amount: amountSchema.optional(),
  withholdingApplies: z.boolean().default(false),
});
export type PricingEstimateInput = z.infer<typeof pricingEstimateSchema>;

// ── Bildirim ─────────────────────────────────────────────────────────
export const notificationQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});
