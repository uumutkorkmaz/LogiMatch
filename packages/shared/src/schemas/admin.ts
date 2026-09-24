import { z } from 'zod';
import { COMPANY_STATUSES, VERIFICATION_STATUSES } from '../enums';
import { dateSchema, paginationQuerySchema, uuidSchema } from './common';

export const rejectDocumentSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const approveDocumentSchema = z.object({
  /** Ops belge üzerindeki tarihi düzeltebilir. */
  expiresAt: dateSchema.optional(),
});

export const setCompanyStatusSchema = z.object({
  status: z.enum(COMPANY_STATUSES).default('SUSPENDED'),
  reason: z.string().trim().min(3).max(500),
});

export const setCompanyVerificationSchema = z.object({
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

export const moderateLoadSchema = z.object({
  approve: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export const resolveRiskFlagSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  resolution: z.string().trim().min(3).max(1000),
});

export const recomputeMatchesSchema = z.object({
  loadIds: z.array(uuidSchema).max(500).optional(),
  truckPostingIds: z.array(uuidSchema).max(500).optional(),
  allOpen: z.boolean().default(false),
});

export const adminListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
});

export const metricsQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});
