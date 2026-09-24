import { Button, Card, EmptyState, Table, Td, Th } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { StatusBadge } from '@/components/badges';
import { StatusTabs } from '@/components/filter-bar';
import { PageHeader } from '@/components/shell';
import { LoadMore } from '@/components/states';
import { api, qs } from '@/lib/api-server';
import { formatDateTime, place } from '@/lib/format';
import type { Page, Posting } from '@/lib/types';

export default async function PostingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations();
  const page = await api<Page<Posting>>(
    `/truck-postings${qs({ mine: true, status: sp.status, cursor: sp.cursor, limit: 25 })}`,
  );
  return (
    <>
      <PageHeader
        title={t('nav.postings')}
        actions={
          <Button asChild>
            <Link href="/carrier/postings/new">+ {t('nav.newPosting')}</Link>
          </Button>
        }
      />
      <StatusTabs
        current={sp.status ?? ''}
        tabs={['', 'DRAFT', 'ACTIVE', 'RESERVED', 'EXPIRED', 'CANCELLED'].map((v) => ({
          value: v,
          label: v ? t(`enums.postingStatus.${v}`) : t('common.all'),
        }))}
      />
      {page.items.length === 0 ? (
        <EmptyState title={t('posting.empty')} />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>{t('common.reference')}</Th>
                <Th>{t('posting.origin')}</Th>
                <Th>{t('posting.vehicle')}</Th>
                <Th>{t('posting.availableFrom')}</Th>
                <Th>{t('posting.preferred')}</Th>
                <Th>{t('common.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((p) => (
                <tr key={p.id} className="hover:bg-accent/50">
                  <Td>
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/carrier/postings/${p.id}`}
                    >
                      {p.referenceNo}
                    </Link>
                  </Td>
                  <Td>{place(p.originCity, p.originDistrict)}</Td>
                  <Td className="text-muted-foreground">
                    {p.vehicle.plate} ·{' '}
                    {t(`enums.trailerType.${p.trailer.trailerType ?? 'TENTELI'}`)}
                  </Td>
                  <Td>
                    {formatDateTime(p.availableFrom)} – {formatDateTime(p.availableUntil)}
                  </Td>
                  <Td className="text-muted-foreground">
                    {p.preferredDestinations.map((d) => d.city ?? d.country).join(', ') || '—'}
                  </Td>
                  <Td>
                    <StatusBadge kind="postingStatus" value={p.status} />
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
