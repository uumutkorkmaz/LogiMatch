import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  Td,
  Th,
} from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, apiOrNull, qs } from '@/lib/api-server';
import { formatDateTime, formatKm, formatMoney, formatNumber, place } from '@/lib/format';
import type { Conversation, Match, Offer, Page } from '@/lib/types';
import { StatusBadge } from '../badges';
import { ChatThread } from '../chat';
import { MatchCard } from '../match-card';
import { NegotiationPanel } from '../negotiation';
import { PageHeader } from '../shell';
import { LoadMore } from '../states';
import { StatusTabs } from '../filter-bar';

type SP = Promise<Record<string, string | undefined>>;

/** Gelen/giden teklifler. */
export async function OffersPage({
  basePath,
  searchParams,
}: {
  basePath: string;
  searchParams: SP;
}) {
  const sp = await searchParams;
  const t = await getTranslations();
  const direction = sp.status === 'incoming' || sp.status === 'outgoing' ? sp.status : 'all';
  const page = await api<Page<Offer>>(`/offers${qs({ direction, cursor: sp.cursor, limit: 25 })}`);
  return (
    <>
      <PageHeader title={t('nav.offers')} />
      <StatusTabs
        current={sp.status ?? ''}
        tabs={[
          { value: '', label: t('common.all') },
          { value: 'incoming', label: t('offer.incoming') },
          { value: 'outgoing', label: t('offer.outgoing') },
        ]}
      />
      {page.items.length === 0 ? (
        <EmptyState title={t('offer.empty')} />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>{t('common.reference')}</Th>
                <Th>
                  {t('common.from')} → {t('common.to')}
                </Th>
                <Th>{t('common.amount')}</Th>
                <Th>{t('offer.round')}</Th>
                <Th>{t('offer.validUntil')}</Th>
                <Th>{t('common.status')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {page.items.map((o) => (
                <tr key={o.id}>
                  <Td className="font-medium">{o.load?.referenceNo}</Td>
                  <Td>
                    {o.load?.pickupCity} → {o.load?.deliveryCity}
                  </Td>
                  <Td className="tabular-nums">
                    {formatMoney(o.amount, o.currency)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {o.direction === 'incoming' ? '↓' : '↑'}
                    </span>
                  </Td>
                  <Td>{o.round}/5</Td>
                  <Td>{formatDateTime(o.validUntil)}</Td>
                  <Td>
                    <StatusBadge kind="offerStatus" value={o.status} />
                  </Td>
                  <Td>
                    <Link
                      className="text-primary hover:underline"
                      href={`${basePath}/matches/${o.matchId}`}
                    >
                      {t('common.view')}
                    </Link>
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

/** Eşleşme detayı: karşılaştırma + pazarlık + maskeli sohbet. */
export async function MatchDetailPage({
  id,
  side,
  basePath,
}: {
  id: string;
  side: 'SHIPPER' | 'CARRIER';
  basePath: string;
}) {
  const t = await getTranslations();
  const m = await apiOrNull<Match>(`/matches/${id}`);
  if (!m) notFound();
  const l = m.load;
  const p = m.truckPosting;
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {l.referenceNo} ↔ {p.referenceNo} <StatusBadge kind="matchStatus" value={m.status} />
          </span>
        }
        description={`${place(l.pickupCity, l.pickupDistrict, l.pickupCountry)} → ${place(l.deliveryCity, l.deliveryDistrict, l.deliveryCountry)}`}
        actions={
          m.shipment ? (
            <Button asChild>
              <Link href={`${basePath}/shipments/${m.shipment.id}`}>
                {m.shipment.referenceNo} →
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <MatchCard match={m} side={side} basePath={basePath} />
          <Card>
            <CardHeader>
              <CardTitle>{t('load.steps.cargo')}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">{t('load.cargoType')}</span>
              <span>{l.cargoType}</span>
              <span className="text-muted-foreground">{t('load.weightKg')}</span>
              <span>{formatNumber(l.weightKg)}</span>
              <span className="text-muted-foreground">{t('load.pickup')}</span>
              <span>{formatDateTime(l.pickupWindowStart)}</span>
              <span className="text-muted-foreground">{t('load.delivery')}</span>
              <span>{formatDateTime(l.deliveryWindowEnd)}</span>
              <span className="text-muted-foreground">{t('load.distance')}</span>
              <span>{formatKm(l.routeDistanceKm)}</span>
              <span className="text-muted-foreground">{t('load.trailerTypes')}</span>
              <span>
                {l.requiredTrailerTypes.map((x) => t(`enums.trailerType.${x}`)).join(', ')}
              </span>
            </CardContent>
          </Card>
          {m.status === 'MUTUAL' || m.offers.length > 0 ? (
            <NegotiationPanel match={m} side={side} shipmentHref={`${basePath}/shipments`} />
          ) : null}
        </div>
        <div>
          {m.conversation ? (
            <ChatThread conversationId={m.conversation.id} preDeal={!m.contactRevealed} />
          ) : null}
        </div>
      </div>
    </>
  );
}

/** "Eşleşmelerim" listesi. */
export async function MatchesPage({
  side,
  basePath,
  searchParams,
}: {
  side: 'SHIPPER' | 'CARRIER';
  basePath: string;
  searchParams: SP;
}) {
  const sp = await searchParams;
  const t = await getTranslations();
  const matches = await api<Match[]>(`/matches${qs({ status: sp.status })}`);
  const tabs = ['', 'SUGGESTED', 'INTERESTED_BY_SHIPPER', 'INTERESTED_BY_CARRIER', 'MUTUAL'].map(
    (v) => ({
      value: v,
      label: v ? t(`enums.matchStatus.${v}`) : t('common.all'),
    }),
  );
  return (
    <>
      <PageHeader title={t('nav.matches')} />
      <StatusTabs tabs={tabs} current={sp.status ?? ''} />
      {matches.length === 0 ? (
        <EmptyState title={t('load.noMatches')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} side={side} basePath={basePath} />
          ))}
        </div>
      )}
    </>
  );
}

/** Mesajlar: konuşma listesi + seçili konuşma. */
export async function MessagesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const t = await getTranslations();
  const conversations = await api<Conversation[]>('/conversations');
  const selected = conversations.find((c) => c.id === sp.c) ?? conversations[0];
  return (
    <>
      <PageHeader title={t('messages.title')} />
      {conversations.length === 0 ? (
        <EmptyState title={t('messages.empty')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Card className="max-h-[32rem] overflow-y-auto p-2">
            {conversations.map((c) => (
              <Link
                key={c.id}
                href={`?c=${c.id}`}
                className={`block rounded-lg px-3 py-2 text-sm ${selected?.id === c.id ? 'bg-primary/10' : 'hover:bg-accent'}`}
              >
                <p className="flex items-center justify-between font-medium">
                  {c.shipment?.referenceNo ?? c.match?.load.referenceNo}
                  {c.unread ? (
                    <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                      {c.unread}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.match ? `${c.match.load.pickupCity} → ${c.match.load.deliveryCity}` : ''}{' '}
                  {c.contactRevealed ? '' : '🔒'}
                </p>
                {c.lastMessage ? (
                  <p className="truncate text-xs text-muted-foreground">{c.lastMessage.body}</p>
                ) : null}
              </Link>
            ))}
          </Card>
          {selected ? (
            <ChatThread conversationId={selected.id} preDeal={!selected.contactRevealed} />
          ) : (
            <EmptyState title={t('messages.select')} />
          )}
        </div>
      )}
    </>
  );
}
