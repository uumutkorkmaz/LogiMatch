import { MatchesPage } from '@/components/pages/deal-pages';

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <MatchesPage side="CARRIER" basePath="/carrier" searchParams={searchParams} />;
}
