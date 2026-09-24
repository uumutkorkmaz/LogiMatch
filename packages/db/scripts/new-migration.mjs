// Yeni migration üretir: `pnpm --filter @logimatch/db migrate:new <isim>`
//
// `prisma migrate dev` yerine kullanılır, çünkü:
//  - geography kolonları GENERATED ALWAYS ... STORED; Prisma bunları "default"lu kolon sanıp
//    her diff'te `ALTER COLUMN ... DROP DEFAULT` üretir (generated kolonda hata verir).
//  - Bu script dev DB'nin şu anki hali ile schema.prisma farkını alır ve o satırları ayıklar.
// Önkoşul: dev DB tüm migration'ları almış olmalı (`pnpm --filter @logimatch/db migrate:deploy`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GENERATED_COLUMNS = [
  'homeBaseLocation',
  'pickupLocation',
  'deliveryLocation',
  'location',
  'originLocation',
];

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Kullanım: migrate:new <snake_case_isim>');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL tanımlı değil');
  process.exit(1);
}

const raw = execFileSync(
  'npx',
  [
    'prisma',
    'migrate',
    'diff',
    '--from-url',
    process.env.DATABASE_URL,
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--script',
  ],
  { encoding: 'utf8', shell: process.platform === 'win32' },
);

const generated = new RegExp(`ALTER COLUMN "(${GENERATED_COLUMNS.join('|')})" DROP DEFAULT`);
const statements = raw
  .split(/;\s*\n/)
  .map((stmt) => {
    // "ALTER TABLE x ALTER COLUMN a DROP DEFAULT,\nALTER COLUMN b DROP DEFAULT" → parçala
    const lines = stmt.split(/,\n/).filter((l) => !generated.test(l));
    return lines.join(',\n');
  })
  .filter((stmt) => {
    const body = stmt.replace(/--.*$/gm, '').trim();
    return body.length > 0 && !/^ALTER TABLE "[^"]+"$/.test(body);
  });

if (statements.length === 0) {
  console.warn('Şema ile veritabanı arasında fark yok.');
  process.exit(0);
}

const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, '')
  .slice(0, 14);
const dir = join('prisma', 'migrations', `${stamp}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'migration.sql'), statements.join(';\n') + ';\n');
console.warn(`Oluşturuldu: ${dir}/migration.sql — gözden geçirip migrate:deploy çalıştırın.`);
