import { ShipmentDetailPage } from '@/components/pages/shipment-pages';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ShipmentDetailPage id={(await params).id} />;
}
