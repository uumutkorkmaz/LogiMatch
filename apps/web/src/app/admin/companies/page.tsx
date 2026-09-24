import { Card, Table, Td, Th } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import { ApiButton } from '@/components/actions';
import { StatusBadge } from '@/components/badges';
import { FilterBar } from '@/components/filter-bar';
import { PageHeader } from '@/components/shell';
import { LoadMore } from '@/components/states';
import { api, qs } from '@/lib/api-server';
import type { CompanyLite, Page } from '@/lib/types';

type Row = CompanyLite & {
  stats: {
    ratingCount: number;
    ratingSum: number;
    completedAsCarrier: number;
    completedAsShipper: number;
    noShowCount: number;
  } | null;
  _count: { members: number; riskFlags: number; vehicles: number };
};

export default async function CompaniesAdmin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations();
  const page = await api<Page<Row>>(
    `/admin/companies${qs({ q: sp.q, status: sp.status, type: sp.type, cursor: sp.cursor, limit: 30 })}`,
  );
  return (
    <>
      <PageHeader title={t('nav.companies')} />
      <FilterBar
        fields={[
          { name: 'q', label: t('common.search'), type: 'text' },
          {
            name: 'type',
            label: t('onboarding.type'),
            type: 'select',
            options: ['SHIPPER', 'CARRIER', 'BOTH'].map((x) => ({
              value: x,
              label: t(`enums.companyType.${x}`),
            })),
          },
          {
            name: 'status',
            label: t('common.status'),
            type: 'select',
            options: ['ACTIVE', 'UNDER_REVIEW', 'SUSPENDED'].map((x) => ({
              value: x,
              label: t(`enums.companyStatus.${x}`),
            })),
          },
        ]}
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>{t('common.company')}</Th>
              <Th>{t('onboarding.type')}</Th>
              <Th>Puan / sefer</Th>
              <Th>Risk</Th>
              <Th>{t('common.status')}</Th>
              <Th>{t('common.actions')}</Th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((c) => (
              <tr key={c.id}>
                <Td>
                  <p className="font-medium">{c.legalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.taxNumber} · {c.city}
                  </p>
                </Td>
                <Td>{t(`enums.companyType.${c.type}`)}</Td>
                <Td className="tabular-nums">
                  {c.stats?.ratingCount
                    ? (c.stats.ratingSum / c.stats.ratingCount).toFixed(1)
                    : '—'}{' '}
                  / {(c.stats?.completedAsCarrier ?? 0) + (c.stats?.completedAsShipper ?? 0)}
                  {c.stats?.noShowCount ? (
                    <span className="ml-1 text-xs text-destructive">
                      no-show {c.stats.noShowCount}
                    </span>
                  ) : null}
                </Td>
                <Td className="tabular-nums">{c._count.riskFlags}</Td>
                <Td>
                  <div className="flex flex-col gap-1">
                    <StatusBadge kind="companyStatus" value={c.status} />
                    <StatusBadge kind="verificationStatus" value={c.verificationStatus} />
                  </div>
                </Td>
                <Td>
                  {c.status === 'ACTIVE' ? (
                    <ApiButton
                      size="sm"
                      variant="destructive"
                      path={`/admin/companies/${c.id}/suspend`}
                      body={{ status: 'SUSPENDED' }}
                      confirm={t('admin.suspend')}
                      reasonLabel={t('admin.reason')}
                      reasonKey="reason"
                    >
                      {t('admin.suspend')}
                    </ApiButton>
                  ) : (
                    <ApiButton
                      size="sm"
                      path={`/admin/companies/${c.id}/suspend`}
                      body={{ status: 'ACTIVE' }}
                      confirm={t('admin.activate')}
                      reasonLabel={t('admin.reason')}
                      reasonKey="reason"
                    >
                      {t('admin.activate')}
                    </ApiButton>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <LoadMore cursor={page.nextCursor} />
    </>
  );
}
