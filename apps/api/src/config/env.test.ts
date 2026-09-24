import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({});
    expect(env.API_PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.QUEUE_DRIVER).toBe('bullmq');
    expect(env.WORKER_IN_API).toBe(true);
  });

  it('splits CORS origins, coerces numbers and booleans', () => {
    const env = loadEnv({
      API_PORT: '5000',
      CORS_ORIGINS: 'http://a.test, http://b.test',
      WORKER_IN_API: 'false',
    });
    expect(env.API_PORT).toBe(5000);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.WORKER_IN_API).toBe(false);
  });

  it('throws on invalid values', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/Invalid environment/);
  });

  it('refuses dev secrets and dev codes in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'x'.repeat(40),
        STORAGE_SIGNING_SECRET: 'y'.repeat(40),
        EXPOSE_DEV_CODES: 'true',
      }),
    ).toThrow(/EXPOSE_DEV_CODES/);
  });
});
