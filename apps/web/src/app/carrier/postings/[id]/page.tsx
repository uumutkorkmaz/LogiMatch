import { Alert, Card, CardContent, EmptyState } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ApiButton } from '@/components/actions';
import { StatusBadge } from '@/components/badges';
import { MapView } from '@/components/map-view';
import { MatchCard } from '@/components/match-card';
import { PageHeader } from '@/components/shell';
import { api, apiOrNull } from '@/lib/api-server';
import { formatDateTime, formatMoney, formatNumber, place } from '@/lib/format';
import type { Match, Posting } from '@/lib/types';

export default async function PostingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations();
  const p = await apiOrNull<Posting>(`/truck-postings/${id}`);
  if (!p) notFound();
  const matches = p.status === 'DRAFT' ? [] : await api<Match[]>(`/truck-postings/${id}/matches`);
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {p.referenceNo} <StatusBadge kind="postingStatus" value={p.status} />
          </span>
        }
        description={`${place(p.originCity, p.originDistrict)} · ${formatDateTime(p.availableFrom)} – ${formatDateTime(p.availableUntil)}`}
        actions={
          <>
            {p.status === 'DRAFT' ? (
              <ApiButton path={`/truck-postings/${id}/publish`}>{t('common.publish')}</ApiButton>
            ) : null}
            {p.status === 'DRAFT' || p.status === 'ACTIVE' ? (
              <ApiButton
                variant="outline"
                path={`/truck-postings/${id}/cancel`}
                confirm="İlan iptal edilsin mi?"
                reasonLabel={t('shipment.cancelReason')}
                reasonKey="reason"
              >
                {t('common.cancel')}
              </ApiButton>
            ) : null}
          </>
        }
      />
      {p.pausedAt ? (
        <Alert tone="warning" className="mb-4">
          İlan duraklatıldı (firma incelemede).
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">
            {t('posting.matches')} <span className="text-muted-foreground">({matches.length})</span>
          </h2>
          {matches.length === 0 ? (
            <EmptyState title={t('load.noMatches')} description={t('load.noMatchesText')} />
          ) : null}
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} side="CARRIER" basePath="/carrier" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <MapView
            markers={[{ lat: p.originLat, lng: p.originLng, label: p.originCity }]}
            height={220}
          />
          <Card>
            <CardContent className="grid grid-cols-2 gap-y-2 pt-5 text-sm">
              <span className="text-muted-foreground">{t('posting.vehicle')}</span>
              <span>{p.vehicle.plate}</span>
              <span className="text-muted-foreground">{t('posting.trailer')}</span>
              <span>
                {t(`enums.trailerType.${p.trailer.trailerType ?? 'TENTELI'}`)} ·{' '}
                {formatNumber(p.trailer.capacityKg)} kg
              </span>
              <span className="text-muted-foreground">{t('posting.driver')}</span>
              <span>{p.driver.fullName}</span>
              <span className="text-muted-foreground">{t('posting.maxDeadhead')}</span>
              <span>{p.maxDeadheadKm} km</span>
              <span className="text-muted-foreground">{t('posting.minPricePerKm')}</span>
              <span>{p.minPricePerKm ? formatMoney(p.minPricePerKm, p.currency) : '—'}</span>
              <span className="text-muted-foreground">{t('posting.preferred')}</span>
              <span>
                {p.preferredDestinations.map((d) => d.city ?? d.country).join(', ') || '—'}
              </span>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
