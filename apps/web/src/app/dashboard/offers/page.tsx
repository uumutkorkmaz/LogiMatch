import { OffersPage } from '@/components/pages/deal-pages';

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <OffersPage basePath="/dashboard" searchParams={searchParams} />;
}
