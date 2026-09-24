'use client';

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { errorText, post } from '@/lib/api-client';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Match, Offer } from '@/lib/types';
import { ActionButton } from './actions';
import { StatusBadge } from './badges';

/** Pazarlık zinciri + teklif/karşı teklif/kabul/ret/geri çekme (DOMAIN §4.4). */
export function NegotiationPanel({
  match,
  side,
  shipmentHref,
}: {
  match: Match;
  side: 'SHIPPER' | 'CARRIER';
  shipmentHref: string;
}) {
  const t = useTranslations('offer');
  const router = useRouter();
  const offers = [...match.offers].sort((a, b) => a.round - b.round);
  const pending = offers.find((o) => o.status === 'PENDING');
  const lastRound = offers.at(-1)?.round ?? 0;
  const fixed = match.load.pricingMode === 'FIXED';
  const cur = match.load.currency;
  const [amount, setAmount] = useState(
    pending
      ? String(Number(pending.amount))
      : match.load.budgetMax
        ? String(Number(match.load.budgetMax))
        : '',
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const submit = (path: string) =>
    start(async () => {
      setError(null);
      try {
        const res = await post<Offer & { warning?: string }>(path, {
          amount,
          note: note || undefined,
        });
        setWarning(res.warning === 'ABOVE_BUDGET' ? t('aboveBudget') : null);
        setNote('');
        router.refresh();
      } catch (err) {
        setError(errorText(err));
      }
    });

  const mine = (o: Offer) => o.offeredBy === side;
  const canNew =
    match.status === 'MUTUAL' && !pending && !match.shipment && !fixed && lastRound < 5;
  const canCounter = pending && !mine(pending) && !fixed && pending.round < 5;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        {match.load.budgetMax ? (
          <p className="text-sm text-muted-foreground">
            Bütçe: {match.load.budgetMin ? `${formatMoney(match.load.budgetMin, cur)} – ` : ''}
            {formatMoney(match.load.budgetMax, cur)}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fixed ? <Alert>{t('fixedPrice')}</Alert> : null}
        {offers.length === 0 ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : null}
        <ol className="flex flex-col gap-2">
          {offers.map((o) => (
            <li
              key={o.id}
              data-testid="offer-row"
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${mine(o) ? 'border-blue-200 bg-blue-50/50' : 'border-border'}`}
            >
              <div>
                <p className="font-semibold tabular-nums">{formatMoney(o.amount, o.currency)}</p>
                <p className="text-xs text-muted-foreground">
                  {t('round')} {o.round} · {mine(o) ? 'Siz' : 'Karşı taraf'} ·{' '}
                  {formatDateTime(o.createdAt)}
                  {o.status === 'PENDING'
                    ? ` · ${t('validUntil')}: ${formatDateTime(o.validUntil)}`
                    : ''}
                </p>
                {o.note ? <p className="mt-1 text-xs">“{o.note}”</p> : null}
              </div>
              <div className="flex items-center gap-2">
                {o.aboveBudgetWarning ? <Badge tone="warning">{t('aboveBudget')}</Badge> : null}
                <StatusBadge kind="offerStatus" value={o.status} />
              </div>
            </li>
          ))}
        </ol>

        {pending && !mine(pending) ? (
          <div className="flex flex-wrap gap-2">
            <ActionButton
              action={() => post<{ id: string }>(`/offers/${pending.id}/accept`)}
              onDone={(r) => router.push(`${shipmentHref}/${(r as { id: string }).id}`)}
              confirm={`${formatMoney(pending.amount, cur)} (KDV hariç) tutarında anlaşma yapılacak ve sevkiyat oluşturulacak.`}
            >
              {t('accept')}
            </ActionButton>
            <ActionButton
              variant="outline"
              action={() => post(`/offers/${pending.id}/reject`)}
              confirm={t('reject') + '?'}
            >
              {t('reject')}
            </ActionButton>
          </div>
        ) : null}
        {pending && mine(pending) ? (
          <ActionButton variant="outline" action={() => post(`/offers/${pending.id}/withdraw`)}>
            {t('withdraw')}
          </ActionButton>
        ) : null}

        {canNew || canCounter ? (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`${t('amount')} (${cur})`}>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label={t('amount')}
                />
              </Field>
              <Field label={t('note')}>
                <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <Button
                disabled={busy || !amount}
                onClick={() =>
                  submit(
                    canCounter ? `/offers/${pending.id}/counter` : `/matches/${match.id}/offers`,
                  )
                }
              >
                {canCounter ? t('counter') : t('makeOffer')}
              </Button>
              <span className="text-xs text-muted-foreground">{t('maxRounds')}</span>
            </div>
          </div>
        ) : null}
        {warning ? <Alert tone="warning">{warning}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </CardContent>
    </Card>
  );
}
