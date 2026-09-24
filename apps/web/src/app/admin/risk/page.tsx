import { Badge, Card, EmptyState, Table, Td, Th } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import { ApiButton } from '@/components/actions';
import { FilterBar } from '@/components/filter-bar';
import { PageHeader } from '@/components/shell';
import { LoadMore } from '@/components/states';
import { api, qs } from '@/lib/api-server';
import { formatDateTime } from '@/lib/format';
import type { Page } from '@/lib/types';

interface Flag {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  status: string;
  details: Record<string, unknown>;
  createdAt: string;
  company: { id: string; legalName: string } | null;
  message: { body: string; originalBody?: string } | null;
}

export default async function RiskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations();
  const page = await api<Page<Flag>>(
    `/admin/risk-flags${qs({ type: sp.type, status: sp.status, cursor: sp.cursor, limit: 30 })}`,
  );
  const types = [
    'DUPLICATE_TAX_NUMBER',
    'DUPLICATE_PHONE',
    'DUPLICATE_IBAN',
    'CONTACT_LEAK',
    'NO_SHOW_STREAK',
    'LISTING_REVIEW',
  ];
  return (
    <>
      <PageHeader title={t('nav.risk')} />
      <FilterBar
        fields={[
          {
            name: 'type',
            label: t('fleet.type'),
            type: 'select',
            options: types.map((x) => ({ value: x, label: t(`enums.riskType.${x}`) })),
          },
        ]}
      />
      {page.items.length === 0 ? (
        <EmptyState title="✓" />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>{t('fleet.type')}</Th>
                <Th>{t('common.company')}</Th>
                <Th>Detay</Th>
                <Th>{t('common.date')}</Th>
                <Th>{t('common.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((f) => (
                <tr key={f.id}>
                  <Td>
                    <Badge
                      tone={
                        f.type === 'CONTACT_LEAK' || f.type === 'NO_SHOW_STREAK'
                          ? 'danger'
                          : 'warning'
                      }
                    >
                      {t(`enums.riskType.${f.type}`)}
                    </Badge>
                  </Td>
                  <Td>{f.company?.legalName ?? '—'}</Td>
                  <Td className="max-w-md text-xs">
                    {f.message ? (
                      <>
                        <p>
                          <b>{t('admin.original')}:</b> {f.message.originalBody ?? '—'}
                        </p>
                        <p className="text-muted-foreground">→ {f.message.body}</p>
                      </>
                    ) : (
                      <code className="break-all text-muted-foreground">
                        {JSON.stringify(f.details)}
                      </code>
                    )}
                  </Td>
                  <Td className="text-muted-foreground">{formatDateTime(f.createdAt)}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <ApiButton
                        size="sm"
                        path={`/admin/risk-flags/${f.id}/resolve`}
                        body={{ status: 'RESOLVED' }}
                        confirm="Çözüldü olarak işaretle"
                        reasonLabel={t('admin.resolution')}
                        reasonKey="resolution"
                      >
                        {t('admin.resolve')}
                      </ApiButton>
                      <ApiButton
                        size="sm"
                        variant="ghost"
                        path={`/admin/risk-flags/${f.id}/resolve`}
                        body={{ status: 'DISMISSED' }}
                        confirm="Bayrağı kapat"
                        reasonLabel={t('admin.reason')}
                        reasonKey="resolution"
                      >
                        ✕
                      </ApiButton>
                    </div>
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
