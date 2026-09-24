import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const TEST_DB =
  process.env.DATABASE_URL_TEST ?? 'postgresql://logimatch:logimatch@localhost:5432/logimatch_test?schema=public';

// SWC, NestJS DI için gereken decorator metadata'sını üretir (esbuild üretmez).
const plugins = [swc.vite({ module: { type: 'es6' } })];

export default defineConfig({
  plugins,
  test: {
    // e2e dosyaları aynı veritabanını paylaşır; Vitest bu ayarı yalnızca kök seviyede uygular.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/seed/**', 'src/main.ts', 'src/worker.ts', 'src/**/*.test.ts', 'src/**/fixtures.ts'],
    },
    projects: [
      {
        plugins,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        plugins,
        test: {
          name: 'e2e',
          environment: 'node',
          include: ['test/**/*.e2e.test.ts'],
          globalSetup: ['test/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: {
            NODE_ENV: 'test',
            TZ: 'UTC',
            DATABASE_URL: TEST_DB,
            REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
            QUEUE_DRIVER: 'inline',
            WORKER_IN_API: 'false',
            LOG_LEVEL: 'silent',
            EXPOSE_DEV_CODES: 'true',
            RATE_LIMIT_AUTH: '10000',
            RATE_LIMIT_SEARCH: '10000',
            RATE_LIMIT_WRITE: '10000',
            STORAGE_LOCAL_DIR: './.test-uploads',
          },
        },
      },
    ],
  },
});
