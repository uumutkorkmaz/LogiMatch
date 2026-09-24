import { ShipmentsListPage } from '@/components/pages/shipment-pages';

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <ShipmentsListPage basePath="/dashboard/shipments" searchParams={searchParams} />;
}
