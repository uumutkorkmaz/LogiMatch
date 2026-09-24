import { Card, CardContent, EmptyState } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import { api } from '@/lib/api-server';
import { formatDateTime, formatMoney } from '@/lib/format';
import { ResolveDispute } from './resolve-dispute';

interface Dispute {
  id: string;
  reason: string;
  createdAt: string;
  previousStatus: string;
  shipment: {
    id: string;
    referenceNo: string;
    agreedAmount: string;
    currency: 'TRY' | 'EUR' | 'USD';
    load: { referenceNo: string; pickupCity: string; deliveryCity: string };
    shipperCompany: { legalName: string };
    carrierCompany: { legalName: string };
  };
}

export default async function DisputesPage() {
  const t = await getTranslations();
  const disputes = await api<Dispute[]>('/admin/disputes');
  return (
    <>
      <PageHeader title={t('nav.disputes')} />
      {disputes.length === 0 ? <EmptyState title="✓" /> : null}
      <div className="flex flex-col gap-4">
        {disputes.map((d) => (
          <Card key={d.id}>
            <CardContent className="grid gap-4 pt-5 lg:grid-cols-[1fr_24rem]">
              <div className="text-sm">
                <p className="font-medium">
                  <Link
                    className="text-primary hover:underline"
                    href={`/dashboard/shipments/${d.shipment.id}`}
                  >
                    {d.shipment.referenceNo}
                  </Link>{' '}
                  · {d.shipment.load.pickupCity} → {d.shipment.load.deliveryCity} ·{' '}
                  {formatMoney(d.shipment.agreedAmount, d.shipment.currency)}
                </p>
                <p className="text-muted-foreground">
                  {d.shipment.shipperCompany.legalName} ↔ {d.shipment.carrierCompany.legalName} ·{' '}
                  {formatDateTime(d.createdAt)} · önceki durum {d.previousStatus}
                </p>
                <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3">{d.reason}</p>
              </div>
              <ResolveDispute id={d.id} />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
