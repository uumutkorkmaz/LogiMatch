import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ApiButton } from '@/components/actions';
import { StatusBadge } from '@/components/badges';
import { MatchCard } from '@/components/match-card';
import { MapView } from '@/components/map-view';
import { PageHeader } from '@/components/shell';
import { api, apiOrNull } from '@/lib/api-server';
import { formatDateTime, formatKm, formatMoney, formatNumber, place } from '@/lib/format';
import type { Load, Match } from '@/lib/types';
import { PinPicker } from './pin-picker';

export default async function LoadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations();
  const load = await apiOrNull<Load>(`/loads/${id}`);
  if (!load) notFound();
  const matches = ['DRAFT'].includes(load.status) ? [] : await api<Match[]>(`/loads/${id}/matches`);
  const open = ['PUBLISHED', 'MATCHING', 'OFFERED'].includes(load.status);
  const markers = load.stops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({
      lat: s.lat!,
      lng: s.lng!,
      label: `${s.sequence}. ${s.city}`,
      color: s.type === 'PICKUP' ? '#16a34a' : '#dc2626',
    }));

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {load.referenceNo} <StatusBadge kind="loadStatus" value={load.status} />
          </span>
        }
        description={`${place(load.pickupCity, load.pickupDistrict, load.pickupCountry)} → ${place(load.deliveryCity, load.deliveryDistrict, load.deliveryCountry)}`}
        actions={
          <>
            {load.status === 'DRAFT' ? (
              <ApiButton path={`/loads/${id}/publish`} disabled={load.geocodeStatus === 'FAILED'}>
                {t('common.publish')}
              </ApiButton>
            ) : null}
            {load.status === 'DRAFT' || open ? (
              <ApiButton
                variant="outline"
                path={`/loads/${id}/cancel`}
                confirm={t('load.cancelLoad') + '?'}
                reasonLabel={t('shipment.cancelReason')}
                reasonKey="reason"
              >
                {t('load.cancelLoad')}
              </ApiButton>
            ) : null}
          </>
        }
      />
      {load.moderationStatus === 'PENDING_REVIEW' ? (
        <Alert tone="info" className="mb-4">
          {t('load.moderation')}
        </Alert>
      ) : null}
      {load.geocodeStatus === 'FAILED' ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('load.geocodeFailed')}</CardTitle>
          </CardHeader>
          <CardContent>
            <PinPicker loadId={id} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">
            {t('load.matches')} <span className="text-muted-foreground">({matches.length})</span>
          </h2>
          {matches.length === 0 ? (
            <EmptyState title={t('load.noMatches')} description={t('load.noMatchesText')} />
          ) : (
            matches.map((m) => (
              <MatchCard key={m.id} match={m} side="SHIPPER" basePath="/dashboard" />
            ))
          )}
        </div>
        <div className="flex flex-col gap-4">
          <MapView markers={markers} line height={240} />
          <Card>
            <CardContent className="grid grid-cols-2 gap-y-2 pt-5 text-sm">
              <span className="text-muted-foreground">{t('load.pickup')}</span>
              <span>{formatDateTime(load.pickupWindowStart)}</span>
              <span className="text-muted-foreground">{t('load.delivery')}</span>
              <span>{formatDateTime(load.deliveryWindowEnd)}</span>
              <span className="text-muted-foreground">{t('load.cargoType')}</span>
              <span>{load.cargoType}</span>
              <span className="text-muted-foreground">{t('load.weightKg')}</span>
              <span>{formatNumber(load.weightKg)}</span>
              <span className="text-muted-foreground">{t('load.distance')}</span>
              <span>{formatKm(load.routeDistanceKm)}</span>
              <span className="text-muted-foreground">{t('load.pricingMode')}</span>
              <span>{t(`enums.pricingMode.${load.pricingMode}`)}</span>
              <span className="text-muted-foreground">{t('load.budgetMax')}</span>
              <span>
                {load.budgetMin ? `${formatMoney(load.budgetMin, load.currency)} – ` : ''}
                {formatMoney(load.budgetMax, load.currency)}
              </span>
              <span className="text-muted-foreground">{t('load.suggested')}</span>
              <span className="text-muted-foreground">
                {formatMoney(load.estimatedPriceMin, load.currency)} –{' '}
                {formatMoney(load.estimatedPriceMax, load.currency)}
              </span>
              <span className="col-span-2 mt-1 flex flex-wrap gap-1">
                {load.requiredTrailerTypes.map((x) => (
                  <Badge key={x}>{t(`enums.trailerType.${x}`)}</Badge>
                ))}
                {load.isAdr ? <Badge tone="danger">ADR {load.adrClass}</Badge> : null}
                {load.requiresTempControl ? (
                  <Badge tone="info">
                    {load.minTempC}…{load.maxTempC} °C
                  </Badge>
                ) : null}
                {load.transportScope === 'INTERNATIONAL' ? (
                  <Badge tone="warning">{t('enums.transportScope.INTERNATIONAL')}</Badge>
                ) : null}
              </span>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
