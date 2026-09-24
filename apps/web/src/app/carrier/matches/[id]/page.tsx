import { MatchDetailPage } from '@/components/pages/deal-pages';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <MatchDetailPage id={(await params).id} side="CARRIER" basePath="/carrier" />;
}
