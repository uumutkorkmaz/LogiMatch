import { Card, EmptyState, Table, Td, Th } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import { ApiButton } from '@/components/actions';
import { PageHeader } from '@/components/shell';
import { api } from '@/lib/api-server';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import type { Load } from '@/lib/types';

type Row = Load & {
  shipperCompany: {
    id: string;
    legalName: string;
    createdAt: string;
    listingsReviewedCount: number;
  };
};

/** Yeni firmaların ilk 3 ilanı (#16). */
export default async function ModerationPage() {
  const t = await getTranslations();
  const loads = await api<Row[]>('/admin/loads/moderation');
  return (
    <>
      <PageHeader
        title={t('nav.moderation')}
        description="Yeni firmaların ilk 3 ilanı yayına girmeden önce incelenir."
      />
      {loads.length === 0 ? (
        <EmptyState title="✓" />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>{t('common.reference')}</Th>
                <Th>{t('common.company')}</Th>
                <Th>
                  {t('common.from')} → {t('common.to')}
                </Th>
                <Th>{t('load.cargoType')}</Th>
                <Th>{t('load.budgetMax')}</Th>
                <Th>{t('common.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {loads.map((l) => (
                <tr key={l.id}>
                  <Td className="font-medium">{l.referenceNo}</Td>
                  <Td>
                    {l.shipperCompany.legalName}
                    <p className="text-xs text-muted-foreground">
                      onaylı ilan: {l.shipperCompany.listingsReviewedCount}/3
                    </p>
                  </Td>
                  <Td>
                    {l.pickupCity} → {l.deliveryCity}
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(l.pickupWindowStart)}
                    </p>
                  </Td>
                  <Td>
                    {l.cargoType} · {formatNumber(l.weightKg)} kg
                  </Td>
                  <Td>{formatMoney(l.budgetMax, l.currency)}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <ApiButton
                        size="sm"
                        path={`/admin/loads/${l.id}/moderate`}
                        body={{ approve: true }}
                      >
                        {t('admin.approve')}
                      </ApiButton>
                      <ApiButton
                        size="sm"
                        variant="outline"
                        path={`/admin/loads/${l.id}/moderate`}
                        body={{ approve: false }}
                        confirm={t('admin.reject')}
                        reasonLabel={t('admin.reason')}
                        reasonKey="reason"
                      >
                        {t('admin.reject')}
                      </ApiButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
