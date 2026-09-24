import { z } from 'zod';
import { phoneSchema } from '../validators/tr-identifiers';

export const passwordSchema = z
  .string()
  .min(8, 'En az 8 karakter')
  .max(128)
  .refine((v) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(v) && /\d/.test(v), {
    message: 'Harf ve rakam içermeli',
  });

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema.optional(),
  /** Kendi kendine kayıt yalnızca shipper/carrier; şoför firma tarafından eklenir. */
  role: z.enum(['SHIPPER_USER', 'CARRIER_USER']),
  locale: z.enum(['tr', 'en']).default('tr'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });
export const logoutSchema = z.object({ refreshToken: z.string().min(10).optional() });

export const otpCodeSchema = z.string().regex(/^\d{6}$/, '6 haneli kod');
export const verifyCodeSchema = z.object({ code: otpCodeSchema });
export const requestCodeSchema = z.object({ resend: z.boolean().optional() });

export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: otpCodeSchema,
  newPassword: passwordSchema,
});

export const updateMeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: phoneSchema,
    locale: z.enum(['tr', 'en']),
  })
  .partial();

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}
