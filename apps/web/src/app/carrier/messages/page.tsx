import { MessagesPage } from '@/components/pages/deal-pages';

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <MessagesPage searchParams={searchParams} />;
}
