import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.string().default('postgresql://logimatch:logimatch@localhost:5432/logimatch'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(32).default('dev-access-secret-change-me-0000000000'),
  JWT_ACCESS_TTL_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  RATE_LIMIT_AUTH: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_SEARCH: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WRITE: z.coerce.number().int().positive().default(30),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().positive().default(24),

  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  STORAGE_MAX_FILE_MB: z.coerce.number().positive().default(10),
  STORAGE_SIGNING_SECRET: z.string().min(16).default('dev-storage-signing-secret-000'),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('LogiMatch <no-reply@logimatch.test>'),

  /** bullmq: gerçek kuyruk. inline: outbox olayları aynı süreçte hemen çalışır (test). */
  QUEUE_DRIVER: z.enum(['bullmq', 'inline']).default('bullmq'),
  /** API süreci worker işlerini de çalıştırsın mı (tek süreçli dev/deploy). */
  WORKER_IN_API: bool.default(true),
  WORKER_CONCURRENCY_MATCHING: z.coerce.number().int().positive().default(4),
  WORKER_CONCURRENCY_NOTIFICATIONS: z.coerce.number().int().positive().default(8),
  OUTBOX_POLL_MS: z.coerce.number().int().positive().default(1000),

  /** Geliştirme kolaylığı: OTP kodlarını API yanıtında döndür (asla production'da değil). */
  EXPOSE_DEV_CODES: bool.default(false),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (env.JWT_ACCESS_SECRET.startsWith('dev-')) throw new Error('JWT_ACCESS_SECRET must be set');
    if (env.STORAGE_SIGNING_SECRET.startsWith('dev-'))
      throw new Error('STORAGE_SIGNING_SECRET must be set');
    if (env.EXPOSE_DEV_CODES) throw new Error('EXPOSE_DEV_CODES is not allowed in production');
  }
  return env;
}

export const ENV = Symbol('ENV');
