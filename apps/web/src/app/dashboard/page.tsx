import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Stat,
} from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { StatusBadge } from '@/components/badges';
import { PageHeader } from '@/components/shell';
import { api } from '@/lib/api-server';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Me, Offer, Page, Shipment } from '@/lib/types';

export default async function ShipperOverview() {
  const t = await getTranslations();
  const me = await api<Me>('/me');
  const company = me.memberships.find((m) => m.companyId === me.activeCompanyId)?.company;
  if (!company) {
    return (
      <EmptyState
        title={t('onboarding.title')}
        description={t('onboarding.text')}
        action={
          <Button asChild>
            <Link href="/onboarding">{t('onboarding.submit')}</Link>
          </Button>
        }
      />
    );
  }
  const [summary, shipments, offers] = await Promise.all([
    api<Record<string, number>>('/loads/summary'),
    api<Page<Shipment>>('/shipments?active=true&limit=5'),
    api<Page<Offer>>('/offers?direction=incoming&status=PENDING&limit=5'),
  ]);
  const open = (summary.PUBLISHED ?? 0) + (summary.MATCHING ?? 0) + (summary.OFFERED ?? 0);

  return (
    <>
      <PageHeader
        title={t('nav.overview')}
        description={company.legalName}
        actions={
          <Button asChild>
            <Link href="/dashboard/loads/new">+ {t('nav.newLoad')}</Link>
          </Button>
        }
      />
      {company.verificationStatus !== 'VERIFIED' ? (
        <Alert
          tone="warning"
          className="mb-4"
          title={t(`enums.verificationStatus.${company.verificationStatus}`)}
        >
          {t('onboarding.pendingVerification')}{' '}
          <Link href="/dashboard/company" className="underline">
            {t('onboarding.uploadDocs')}
          </Link>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t('enums.loadStatus.PUBLISHED')}
          value={open}
          hint={`${summary.OFFERED ?? 0} ${t('enums.loadStatus.OFFERED').toLowerCase()}`}
        />
        <Stat
          label={t('enums.loadStatus.ASSIGNED')}
          value={(summary.ASSIGNED ?? 0) + (summary.IN_TRANSIT ?? 0)}
        />
        <Stat label={t('enums.loadStatus.COMPLETED')} value={summary.COMPLETED ?? 0} />
        <Stat label={t('enums.loadStatus.DRAFT')} value={summary.DRAFT ?? 0} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('offer.incoming')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {offers.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('offer.empty')}</p>
            ) : null}
            {offers.items.map((o) => (
              <Link
                key={o.id}
                href={`/dashboard/matches/${o.matchId}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-accent"
              >
                <span>
                  <span className="font-medium">{o.load?.referenceNo}</span> · {o.load?.pickupCity}{' '}
                  → {o.load?.deliveryCity}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatMoney(o.amount, o.currency)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('nav.shipments')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {shipments.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('shipment.empty')}</p>
            ) : null}
            {shipments.items.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/shipments/${s.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-accent"
              >
                <span>
                  <span className="font-medium">{s.referenceNo}</span> · {s.load.pickupCity} →{' '}
                  {s.load.deliveryCity}
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(s.plannedPickupAt)}
                  </span>
                </span>
                <StatusBadge kind="shipmentStatus" value={s.status} />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
