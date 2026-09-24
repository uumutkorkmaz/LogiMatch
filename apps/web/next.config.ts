import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@logimatch/ui', '@logimatch/shared'],
  // Lint, monorepo'da `pnpm lint` ile ayrı koşar.
  eslint: { ignoreDuringBuilds: true },
};

export default withNextIntl(nextConfig);
