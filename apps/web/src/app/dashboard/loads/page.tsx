import { Button, Card, EmptyState, Table, Td, Th } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { StatusBadge } from '@/components/badges';
import { StatusTabs } from '@/components/filter-bar';
import { PageHeader } from '@/components/shell';
import { LoadMore } from '@/components/states';
import { api, qs } from '@/lib/api-server';
import { formatDateTime, formatMoney, formatNumber, place } from '@/lib/format';
import type { Load, Page } from '@/lib/types';

const TABS = [
  '',
  'DRAFT',
  'PUBLISHED',
  'MATCHING',
  'OFFERED',
  'ASSIGNED',
  'IN_TRANSIT',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
];

export default async function LoadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations();
  const page = await api<Page<Load>>(
    `/loads${qs({ mine: true, status: sp.status, cursor: sp.cursor, limit: 20 })}`,
  );
  return (
    <>
      <PageHeader
        title={t('nav.loads')}
        actions={
          <Button asChild>
            <Link href="/dashboard/loads/new">+ {t('nav.newLoad')}</Link>
          </Button>
        }
      />
      <StatusTabs
        tabs={TABS.map((v) => ({
          value: v,
          label: v ? t(`enums.loadStatus.${v}`) : t('common.all'),
        }))}
        current={sp.status ?? ''}
      />
      {page.items.length === 0 ? (
        <EmptyState
          title={t('load.empty')}
          description={t('load.emptyText')}
          action={
            <Button asChild>
              <Link href="/dashboard/loads/new">{t('nav.newLoad')}</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>{t('common.reference')}</Th>
                <Th>
                  {t('common.from')} → {t('common.to')}
                </Th>
                <Th>{t('load.cargoType')}</Th>
                <Th>{t('load.pickup')}</Th>
                <Th>{t('load.budgetMax')}</Th>
                <Th>{t('load.matches')}</Th>
                <Th>{t('common.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((l) => (
                <tr key={l.id} className="hover:bg-accent/50">
                  <Td>
                    <Link
                      href={`/dashboard/loads/${l.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {l.referenceNo}
                    </Link>
                  </Td>
                  <Td>
                    {place(l.pickupCity, null, l.pickupCountry)} →{' '}
                    {place(l.deliveryCity, null, l.deliveryCountry)}
                  </Td>
                  <Td className="text-muted-foreground">
                    {l.cargoType} · {formatNumber(l.weightKg)} kg
                  </Td>
                  <Td>{formatDateTime(l.pickupWindowStart)}</Td>
                  <Td className="tabular-nums">
                    {l.budgetMax ? formatMoney(l.budgetMax, l.currency) : '—'}
                  </Td>
                  <Td className="tabular-nums">{l._count?.matches ?? 0}</Td>
                  <Td>
                    <StatusBadge kind="loadStatus" value={l.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <LoadMore cursor={page.nextCursor} />
    </>
  );
}
