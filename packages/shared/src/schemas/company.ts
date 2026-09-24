import { z } from 'zod';
import { COMPANY_ROLES, COMPANY_TYPES, DOCUMENT_TYPES } from '../enums';
import { phoneSchema, taxNumberSchema, trIbanSchema } from '../validators/tr-identifiers';
import { dateSchema } from './common';

export const createCompanySchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  tradeName: z.string().trim().max(200).optional(),
  taxOffice: z.string().trim().min(2).max(100),
  taxNumber: taxNumberSchema,
  mersisNo: z
    .string()
    .regex(/^\d{16}$/, 'MERSİS no 16 hane')
    .optional(),
  address: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(80),
  district: z.string().trim().max(80).optional(),
  phone: phoneSchema.optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  iban: trIbanSchema.optional(),
  type: z.enum(COMPANY_TYPES),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema.omit({ taxNumber: true }).partial();

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(120).optional(),
  companyRole: z.enum(COMPANY_ROLES),
});

export const documentMetaSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  number: z.string().trim().max(100).optional(),
  issuedAt: dateSchema.optional(),
  expiresAt: dateSchema.optional(),
});
export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;

export const blockCompanySchema = z.object({ reason: z.string().trim().max(500).optional() });
