import { Card, CardContent, CardHeader, CardTitle, Stat } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import { ApiButton } from '@/components/actions';
import { BarChart, Funnel } from '@/components/charts';
import { PageHeader } from '@/components/shell';
import { api } from '@/lib/api-server';
import { formatMoney } from '@/lib/format';

interface Metrics {
  gmv: string;
  commissionRevenue: string;
  takeRatePct: number | null;
  matchRatePct: number | null;
  fillRatePct: number | null;
  avgOfferRounds: number | null;
  cancellationRatePct: number | null;
  shipments: { total: number; completed: number; cancelled: number };
  funnel: {
    published: number;
    matched: number;
    mutual: number;
    offered: number;
    assigned: number;
    completed: number;
  };
  daily: { day: string; gmv: string; shipments: number }[];
  live: {
    openLoads: number;
    activePostings: number;
    activeShipments: number;
    pendingDocs: number;
    openDisputes: number;
    openFlags: number;
  };
}

const pct = (n: number | null) => (n == null ? '—' : `%${n}`);

export default async function AdminMetrics() {
  const t = await getTranslations('admin');
  const m = await api<Metrics>('/admin/metrics');
  return (
    <>
      <PageHeader
        title={t('gmv')}
        description="Son 90 gün · TRY (kilitli kurla)"
        actions={
          <ApiButton
            variant="outline"
            path="/admin/matches/recompute"
            body={{ allOpen: true }}
            confirm={t('recompute') + '?'}
          >
            {t('recompute')}
          </ApiButton>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t('gmv')}
          value={formatMoney(m.gmv, 'TRY')}
          hint={`${m.shipments.total} sevkiyat`}
        />
        <Stat
          label={t('revenue')}
          value={formatMoney(m.commissionRevenue, 'TRY')}
          hint={`${t('takeRate')}: ${pct(m.takeRatePct)}`}
        />
        <Stat
          label={t('matchRate')}
          value={pct(m.matchRatePct)}
          hint={`${t('fillRate')}: ${pct(m.fillRatePct)}`}
        />
        <Stat
          label={t('avgRounds')}
          value={m.avgOfferRounds ?? '—'}
          hint={`${t('cancelRate')}: ${pct(m.cancellationRatePct)}`}
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('daily')}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={m.daily.map((d) => ({ label: d.day, value: Number(d.gmv) }))}
              format={(n) => formatMoney(n, 'TRY')}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('funnel')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Funnel
              steps={[
                { label: 'Yayınlanan ilan', value: m.funnel.published },
                { label: 'Eşleşme bulunan', value: m.funnel.matched },
                { label: 'Karşılıklı ilgi', value: m.funnel.mutual },
                { label: 'Teklif alan', value: m.funnel.offered },
                { label: 'Sevkiyata dönen', value: m.funnel.assigned },
                { label: 'Tamamlanan', value: m.funnel.completed },
              ]}
            />
          </CardContent>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">{t('live')}</h2>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t('openLoads')} value={m.live.openLoads} />
        <Stat label={t('activePostings')} value={m.live.activePostings} />
        <Stat label={t('activeShipments')} value={m.live.activeShipments} />
        <Stat label={t('pendingDocs')} value={m.live.pendingDocs} />
        <Stat label={t('openDisputes')} value={m.live.openDisputes} />
        <Stat label={t('openFlags')} value={m.live.openFlags} />
      </div>
    </>
  );
}
