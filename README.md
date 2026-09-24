# LogiMatch

Türkiye merkezli, uluslararası taşımaya açık **dijital yük brokerliği** platformu.
Yük veren (shipper) ile taşıyıcıyı (carrier) eşleştirir, sözleşmeyi kurar, komisyon alır.

- Mimari: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Domain modeli ve iş kuralları: [docs/DOMAIN.md](docs/DOMAIN.md)
- Varsayımlar: [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)

## Monorepo

```
apps/api         NestJS 10 — REST /api/v1 + OpenAPI (/api/docs), worker entrypoint
apps/web         Next.js 15 (App Router) — shipper, carrier, admin panelleri
packages/db      Prisma 6 şeması, migration'lar, seed
packages/shared  zod şemaları, enum'lar, state machine tanımları, TR validator'ları
packages/ui      paylaşılan React bileşenleri (shadcn/ui tabanlı)
infra/           docker init script'leri
```

## Gereksinimler

- Node.js 22 LTS (`.nvmrc`), pnpm 9 (`npm i -g pnpm@9` veya `corepack enable`)
- Docker (PostgreSQL 16 + PostGIS, Redis 7, MailHog)

## Başlangıç

```bash
cp .env.example .env
pnpm install
pnpm infra:up          # postgres:5432, redis:6379, mailhog:8025
pnpm build
pnpm dev               # api: http://localhost:4000  web: http://localhost:3000
```

- API sağlık: `GET /health`, `GET /ready` — Swagger: http://localhost:4000/api/docs
- MailHog UI: http://localhost:8025

## Kalite kapısı

Her modül sonunda üçü de yeşil olmalı:

```bash
pnpm build && pnpm test && pnpm lint
```

CI (`.github/workflows/ci.yml`) aynı adımları PostGIS + Redis servisleriyle koşar,
ek olarak `pnpm format:check`.

## Demo hesapları (seed sonrası, adım 3)

| Rol     | E-posta                | Şifre     |
| ------- | ---------------------- | --------- |
| Shipper | shipper@logimatch.test | Demo1234! |
| Carrier | carrier@logimatch.test | Demo1234! |
| Admin   | admin@logimatch.test   | Demo1234! |
