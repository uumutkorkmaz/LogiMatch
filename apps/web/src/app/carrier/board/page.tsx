import { TR_PROVINCES, TRAILER_TYPES } from '@logimatch/shared';
import { Badge, Card, EmptyState } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import { FilterBar } from '@/components/filter-bar';
import { MapView } from '@/components/map-view';
import { PageHeader } from '@/components/shell';
import { LoadMore } from '@/components/states';
import { api, qs } from '@/lib/api-server';
import { formatDateTime, formatKm, formatMoney, formatNumber, place } from '@/lib/format';
import type { Load, Page, Posting } from '@/lib/types';
import { BoardInterest } from './board-interest';

/** Yük panosu: harita + liste, filtreler URL'de (paylaşılabilir). */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations();
  const [page, postings] = await Promise.all([
    api<Page<Load>>(
      `/loads${qs({
        pickupCity: sp.pickupCity,
        deliveryCity: sp.deliveryCity,
        trailerType: sp.trailerType,
        minWeightKg: sp.minWeightKg,
        maxWeightKg: sp.maxWeightKg,
        isAdr: sp.isAdr,
        transportScope: sp.intl === 'true' ? 'INTERNATIONAL' : undefined,
        pickupFrom: sp.pickupFrom
          ? new Date(`${sp.pickupFrom}T00:00:00+03:00`).toISOString()
          : undefined,
        cursor: sp.cursor,
        limit: 30,
      })}`,
    ),
    api<Page<Posting>>('/truck-postings?mine=true&status=ACTIVE&limit=50'),
  ]);
  const provinces = TR_PROVINCES.map((p) => ({ value: p.name, label: p.name }));
  const markers = page.items
    .filter((l) => l.pickupLat != null)
    .map((l) => ({
      lat: l.pickupLat!,
      lng: l.pickupLng!,
      label: `${l.pickupCity} → ${l.deliveryCity} (${formatNumber(l.weightKg)} kg)`,
    }));

  return (
    <>
      <PageHeader title={t('board.title')} />
      <FilterBar
        fields={[
          { name: 'pickupCity', label: t('board.pickupCity'), type: 'select', options: provinces },
          {
            name: 'deliveryCity',
            label: t('board.deliveryCity'),
            type: 'select',
            options: provinces,
          },
          {
            name: 'trailerType',
            label: t('board.trailerType'),
            type: 'select',
            options: TRAILER_TYPES.map((x) => ({ value: x, label: t(`enums.trailerType.${x}`) })),
          },
          { name: 'minWeightKg', label: t('board.minWeight'), type: 'number' },
          { name: 'maxWeightKg', label: t('board.maxWeight'), type: 'number' },
          { name: 'pickupFrom', label: t('board.pickupFrom'), type: 'date' },
          { name: 'isAdr', label: t('board.adrOnly'), type: 'checkbox' },
          { name: 'intl', label: t('board.intlOnly'), type: 'checkbox' },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="order-2 flex flex-col gap-3 lg:order-1">
          {page.items.length === 0 ? <EmptyState title={t('board.empty')} /> : null}
          {page.items.map((l) => (
            <Card key={l.id} className="p-4" data-testid="board-load">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {place(l.pickupCity, l.pickupDistrict, l.pickupCountry)} →{' '}
                    {place(l.deliveryCity, l.deliveryDistrict, l.deliveryCountry)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {l.cargoType} · {formatNumber(l.weightKg)} kg · {formatKm(l.routeDistanceKm)} ·{' '}
                    {formatDateTime(l.pickupWindowStart)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {l.requiredTrailerTypes.map((x) => (
                      <Badge key={x}>{t(`enums.trailerType.${x}`)}</Badge>
                    ))}
                    {l.isAdr ? <Badge tone="danger">ADR {l.adrClass}</Badge> : null}
                    {l.requiresTempControl ? (
                      <Badge tone="info">
                        {l.minTempC}…{l.maxTempC} °C
                      </Badge>
                    ) : null}
                    {l.transportScope === 'INTERNATIONAL' ? (
                      <Badge tone="warning">{t('enums.transportScope.INTERNATIONAL')}</Badge>
                    ) : null}
                    {l.shipper ? (
                      <Badge>
                        {l.shipper.alias}
                        {l.shipper.rating ? ` ★${l.shipper.rating}` : ''}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">
                    {l.budgetMax
                      ? formatMoney(l.budgetMax, l.currency)
                      : t('enums.pricingMode.OPEN_TO_OFFER')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`enums.pricingMode.${l.pricingMode}`)}
                  </p>
                </div>
              </div>
              <BoardInterest
                loadId={l.id}
                postings={postings.items.map((p) => ({
                  id: p.id,
                  label: `${p.referenceNo} · ${p.originCity} · ${t(`enums.trailerType.${p.trailer.trailerType ?? 'TENTELI'}`)}`,
                }))}
              />
            </Card>
          ))}
          <LoadMore cursor={page.nextCursor} />
        </div>
        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-20">
            <MapView markers={markers} height={480} />
          </div>
        </div>
      </div>
    </>
  );
}
