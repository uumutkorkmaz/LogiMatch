import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Test veritabanına migration'ları uygular (idempotent). */
export default function setup(): void {
  const url =
    process.env.DATABASE_URL_TEST ??
    'postgresql://logimatch:logimatch@localhost:5432/logimatch_test?schema=public';
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '../../../packages/db'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
