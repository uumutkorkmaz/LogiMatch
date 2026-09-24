import { z } from 'zod';
import { CURRENCIES, TRAILER_TYPES, TRUCK_POSTING_STATUSES } from '../enums';
import {
  amountSchema,
  bboxSchema,
  countryCodeSchema,
  dateSchema,
  locationInputSchema,
  paginationQuerySchema,
  uuidSchema,
  booleanQuery,
} from './common';

export const preferredDestinationSchema = z.object({
  country: countryCodeSchema,
  city: z.string().trim().min(2).max(80).optional(),
});
export type PreferredDestinationInput = z.infer<typeof preferredDestinationSchema>;

export const truckPostingFieldsSchema = z.object({
  vehicleId: uuidSchema,
  trailerId: uuidSchema,
  driverId: uuidSchema,
  availableFrom: dateSchema,
  availableUntil: dateSchema,
  origin: locationInputSchema,
  preferredDestinations: z.array(preferredDestinationSchema).max(10).default([]),
  maxDeadheadKm: z.number().int().min(0).max(1500),
  maxRouteDeviationKm: z.number().int().min(0).max(500).optional(),
  /** Load para birimine çevrilerek karşılaştırılır. */
  minPricePerKm: amountSchema.optional(),
  currency: z.enum(CURRENCIES).default('TRY'),
  acceptsAdr: z.boolean().default(false),
  acceptsPartialLoad: z.boolean().default(false),
  acceptsInternational: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
});

export const createTruckPostingSchema = truckPostingFieldsSchema.superRefine((v, ctx) => {
  if (v.availableFrom.getTime() >= v.availableUntil.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['availableUntil'],
      message: 'Müsaitlik sonu başlangıçtan sonra olmalı',
    });
  }
});
export type CreateTruckPostingInput = z.infer<typeof createTruckPostingSchema>;

export const updateTruckPostingSchema = truckPostingFieldsSchema.partial();
export type UpdateTruckPostingInput = z.infer<typeof updateTruckPostingSchema>;

export const truckPostingQuerySchema = paginationQuerySchema.extend({
  status: z.enum(TRUCK_POSTING_STATUSES).optional(),
  mine: booleanQuery,
  originCity: z.string().trim().optional(),
  destinationCity: z.string().trim().optional(),
  trailerType: z.enum(TRAILER_TYPES).optional(),
  availableFrom: dateSchema.optional(),
  availableTo: dateSchema.optional(),
  minCapacityKg: z.coerce.number().int().min(0).optional(),
  acceptsAdr: booleanQuery,
  bbox: bboxSchema.optional(),
});
export type TruckPostingQuery = z.infer<typeof truckPostingQuerySchema>;
