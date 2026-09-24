'use client';

import { Badge, Button, Card } from '@logimatch/ui';
import { ChevronDown, ChevronUp, MapPin, Star, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { post } from '@/lib/api-client';
import { formatDateTime, formatKm, formatNumber, place } from '@/lib/format';
import type { MaskedCompany, Match } from '@/lib/types';
import { ActionButton } from './actions';
import { ScoreBadge, StatusBadge } from './badges';

const isMasked = (c: unknown): c is MaskedCompany => !!c && typeof c === 'object' && 'masked' in c;

/** Skor rozeti + "neden eşleşti" + maskeli karşı taraf profili + ilgi aksiyonları. */
export function MatchCard({
  match,
  side,
  basePath,
}: {
  match: Match;
  side: 'SHIPPER' | 'CARRIER';
  basePath: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const p = match.truckPosting;
  const l = match.load;
  const counterpart = side === 'SHIPPER' ? p.carrierCompany : l.shipperCompany;
  const myInterest =
    (side === 'SHIPPER' &&
      (match.status === 'INTERESTED_BY_SHIPPER' || match.status === 'MUTUAL')) ||
    (side === 'CARRIER' && (match.status === 'INTERESTED_BY_CARRIER' || match.status === 'MUTUAL'));
  const canAct = !['DISMISSED', 'EXPIRED'].includes(match.status) && !match.shipment;

  return (
    <Card className="p-4" data-testid="match-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ScoreBadge score={match.score} />
          <div>
            {side === 'SHIPPER' ? (
              <p className="flex items-center gap-1.5 font-medium">
                <Truck className="size-4 text-muted-foreground" />
                {t(`enums.trailerType.${p.trailer.trailerType ?? 'TENTELI'}`)} ·{' '}
                {formatNumber(p.trailer.capacityKg)} kg
                <span className="text-muted-foreground">· {p.vehicle.plate}</span>
              </p>
            ) : (
              <p className="font-medium">
                {place(l.pickupCity, l.pickupDistrict, l.pickupCountry)} →{' '}
                {place(l.deliveryCity, l.deliveryDistrict, l.deliveryCountry)}
              </p>
            )}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {side === 'SHIPPER'
                  ? place(p.originCity, p.originDistrict)
                  : `${formatNumber(l.weightKg)} kg · ${l.cargoType}`}
              </span>
              <span>
                {t('load.deadhead')}: {formatKm(match.deadheadKm)}
              </span>
              {side === 'CARRIER' ? (
                <span>{formatDateTime(l.pickupWindowStart)}</span>
              ) : (
                <span>{formatDateTime(p.availableFrom)}</span>
              )}
            </p>
          </div>
        </div>
        <StatusBadge kind="matchStatus" value={match.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {match.scoreBreakdown.reasons.map((r) => (
          <Badge key={r} tone="info">
            {t(`enums.reason.${r}`)}
          </Badge>
        ))}
      </div>

      {counterpart ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {isMasked(counterpart) ? (
            <>
              <span className="font-medium">{counterpart.alias}</span>
              <span className="text-muted-foreground">· {counterpart.city}</span>
              {counterpart.verified ? <Badge tone="success">✓</Badge> : null}
              {counterpart.rating ? (
                <span className="inline-flex items-center gap-0.5 text-amber-600">
                  <Star className="size-3.5 fill-current" /> {counterpart.rating} (
                  {counterpart.ratingCount})
                </span>
              ) : null}
              <span className="text-muted-foreground">
                · {counterpart.completedShipments} sefer
              </span>
              <span className="text-xs text-muted-foreground">({t('common.masked')})</span>
            </>
          ) : (
            <span className="font-medium">{counterpart.legalName}</span>
          )}
        </div>
      ) : null}

      <button
        className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        onClick={() => setOpen((o) => !o)}
      >
        {t('load.whyMatch')}{' '}
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {open ? (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {Object.entries(match.scoreBreakdown.components).map(([k, c]) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="w-32 shrink-0 text-muted-foreground">
                {t(`enums.component.${k}`)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(2, c.value)}%` }}
                />
              </div>
              <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(c.value)} × {c.weight}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {canAct && !myInterest ? (
          <ActionButton
            size="sm"
            action={() => post(`/matches/${match.id}/interest`, { interested: true })}
          >
            {t('load.interested')}
          </ActionButton>
        ) : null}
        {canAct && match.status !== 'MUTUAL' ? (
          <ActionButton
            size="sm"
            variant="ghost"
            action={() => post(`/matches/${match.id}/dismiss`, { reason: 'Uygun değil' })}
          >
            {t('load.dismiss')}
          </ActionButton>
        ) : null}
        {match.status === 'MUTUAL' || match.shipment ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`${basePath}/matches/${match.id}`}>
              {match.shipment ? match.shipment.referenceNo : t('offer.title')} →
            </Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
