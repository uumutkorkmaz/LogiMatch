import {
  Badge,
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
import { fileHref, formatDateTime, formatKm, formatMoney, place } from '@/lib/format';
import type { DocumentRow, Invoice, Page, Settlement, Shipment, ShipmentEvent } from '@/lib/types';
import { StatusBadge } from '../badges';
import { ChatThread } from '../chat';
import { MapView } from '../map-view';
import { PageHeader } from '../shell';
import { ShipmentActions } from '../shipment-actions';
import { LoadMore } from '../states';
import { StatusTabs } from '../filter-bar';

type SP = Promise<Record<string, string | undefined>>;

export async function ShipmentsListPage({
  basePath,
  searchParams,
}: {
  basePath: string;
  searchParams: SP;
}) {
  const sp = await searchParams;
  const t = await getTranslations();
  const page = await api<Page<Shipment>>(
    `/shipments${qs({ status: sp.status, cursor: sp.cursor, limit: 20 })}`,
  );
  const tabs = [
    '',
    'ASSIGNED',
    'IN_TRANSIT',
    'DELIVERED',
    'POD_SUBMITTED',
    'COMPLETED',
    'CANCELLED',
    'DISPUTED',
  ].map((v) => ({
    value: v,
    label: v ? t(`enums.shipmentStatus.${v}`) : t('common.all'),
  }));
  return (
    <>
      <PageHeader title={t('nav.shipments')} />
      <StatusTabs tabs={tabs} current={sp.status ?? ''} />
      {page.items.length === 0 ? (
        <EmptyState title={t('shipment.empty')} />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>{t('common.reference')}</Th>
                <Th>
                  {t('common.from')} → {t('common.to')}
                </Th>
                <Th>{t('common.company')}</Th>
                <Th>{t('shipment.agreed')}</Th>
                <Th>{t('load.pickup')}</Th>
                <Th>{t('common.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((s) => (
                <tr key={s.id} className="hover:bg-accent/50">
                  <Td>
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`${basePath}/${s.id}`}
                    >
                      {s.referenceNo}
                    </Link>
                  </Td>
                  <Td>
                    {s.load.pickupCity} → {s.load.deliveryCity}
                  </Td>
                  <Td className="text-muted-foreground">
                    {basePath.startsWith('/carrier')
                      ? s.shipperCompany.legalName
                      : s.carrierCompany.legalName}
                  </Td>
                  <Td className="tabular-nums">{formatMoney(s.agreedAmount, s.currency)}</Td>
                  <Td>{formatDateTime(s.plannedPickupAt)}</Td>
                  <Td>
                    <StatusBadge kind="shipmentStatus" value={s.status} />
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

export async function ShipmentDetailPage({ id }: { id: string }) {
  const t = await getTranslations();
  const s = await apiOrNull<Shipment>(`/shipments/${id}`);
  if (!s) notFound();
  const [events, docs, settlement, invoices, ratings] = await Promise.all([
    api<ShipmentEvent[]>(`/shipments/${id}/events`),
    api<DocumentRow[]>(`/shipments/${id}/documents`),
    apiOrNull<Settlement>(`/shipments/${id}/settlement`),
    apiOrNull<Invoice[]>(`/shipments/${id}/invoices`),
    api<{ raterCompanyId: string }[]>(`/shipments/${id}/ratings`),
  ]);
  const myCompany = s.viewerRole === 'SHIPPER' ? s.shipperCompanyId : s.carrierCompanyId;
  const cur = s.currency;
  const markers = [
    s.load.pickupLat != null
      ? {
          lat: s.load.pickupLat,
          lng: s.load.pickupLng!,
          label: s.load.pickupCity,
          color: '#16a34a',
        }
      : null,
    s.load.deliveryLat != null
      ? {
          lat: s.load.deliveryLat,
          lng: s.load.deliveryLng!,
          label: s.load.deliveryCity,
          color: '#dc2626',
        }
      : null,
  ].filter(Boolean) as { lat: number; lng: number; label: string; color: string }[];

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {s.referenceNo} <StatusBadge kind="shipmentStatus" value={s.status} />
          </span>
        }
        description={`${place(s.load.pickupCity, s.load.pickupDistrict, s.load.pickupCountry)} → ${place(s.load.deliveryCity, s.load.deliveryDistrict, s.load.deliveryCountry)} · ${s.load.referenceNo}`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <MapView markers={markers} line height={260} />
          <Card>
            <CardHeader>
              <CardTitle>{t('shipment.timeline')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative ml-2 border-l border-border" data-testid="timeline">
                {events.map((e) => (
                  <li key={e.id} className="mb-4 ml-4">
                    <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-card bg-primary" />
                    <p className="text-sm font-medium">
                      {e.toStatus
                        ? t(`enums.shipmentStatus.${e.toStatus}`)
                        : e.type.replaceAll('_', ' ')}
                      {e.actorRole ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {e.actorRole}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(e.occurredAt)}</p>
                    {e.note ? <p className="mt-0.5 text-sm">{e.note}</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          {s.conversation ? (
            <ChatThread conversationId={s.conversation.id} preDeal={false} />
          ) : null}
        </div>
        <div className="flex flex-col gap-6">
          <ShipmentActions
            shipment={s}
            hasPod={docs.some((d) => ['POD', 'CMR', 'IRSALIYE'].includes(d.type))}
            myRating={ratings.some((r) => r.raterCompanyId === myCompany)}
          />
          <Card>
            <CardHeader>
              <CardTitle>{t('shipment.parties')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div>
                <p className="text-xs uppercase text-muted-foreground">{t('enums.side.SHIPPER')}</p>
                <p className="font-medium">{s.shipperCompany.legalName}</p>
                <p className="text-muted-foreground">
                  {s.shipperCompany.phone} · {s.shipperCompany.email}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">{t('enums.side.CARRIER')}</p>
                <p className="font-medium">{s.carrierCompany.legalName}</p>
                <p className="text-muted-foreground">
                  {s.carrierCompany.phone} · {s.carrierCompany.email}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  {t('shipment.vehicle')} / {t('shipment.driver')}
                </p>
                <p>
                  {s.vehicle.plate} + {s.trailer.plate} (
                  {t(`enums.trailerType.${s.trailer.trailerType}`)})
                </p>
                <p className="text-muted-foreground">
                  {s.driver.fullName} · {s.driver.phone}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                <span className="text-muted-foreground">{t('load.pickup')}</span>
                <span>{formatDateTime(s.plannedPickupAt)}</span>
                <span className="text-muted-foreground">{t('load.deadhead')}</span>
                <span>{formatKm(s.deadheadKm)}</span>
                <span className="text-muted-foreground">{t('shipment.agreed')}</span>
                <span className="font-semibold">{formatMoney(s.agreedAmount, cur)}</span>
              </div>
            </CardContent>
          </Card>
          {settlement ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('shipment.settlement')}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-y-1.5 text-sm">
                {settlement.transport ? (
                  <>
                    <span className="text-muted-foreground">Navlun (KDV hariç)</span>
                    <span className="text-right tabular-nums">
                      {formatMoney(settlement.transport.subtotal, cur)}
                    </span>
                    <span className="text-muted-foreground">{t('load.vat')}</span>
                    <span className="text-right tabular-nums">
                      {formatMoney(settlement.transport.vatAmount, cur)}
                    </span>
                    <span className="text-muted-foreground">{t('load.withholdingAmount')}</span>
                    <span className="text-right tabular-nums">
                      {formatMoney(settlement.transport.withholdingAmount, cur)}
                    </span>
                  </>
                ) : null}
                {settlement.cancellation ? (
                  <>
                    <span className="text-muted-foreground">İptal bedeli</span>
                    <span className="text-right tabular-nums">
                      {formatMoney(settlement.cancellation.invoice.total, cur)}
                    </span>
                  </>
                ) : null}
                <span className="text-muted-foreground">{t('load.commission')}</span>
                <span className="text-right tabular-nums">
                  {formatMoney(s.commissionAmount, cur)}
                </span>
                <span className="border-t border-border pt-1.5 font-medium">
                  {t('shipment.shipperPays')}
                </span>
                <span className="border-t border-border pt-1.5 text-right font-medium tabular-nums">
                  {formatMoney(settlement.shipper.total, cur)}
                </span>
                <span className="font-medium">{t('shipment.carrierNet')}</span>
                <span className="text-right font-medium tabular-nums">
                  {formatMoney(settlement.carrier.net, cur)}
                </span>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t('shipment.documents')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {docs.length === 0 ? <p className="text-muted-foreground">—</p> : null}
              {docs.map((d) => (
                <a
                  key={d.id}
                  href={fileHref(d.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-accent"
                >
                  <span>{d.type}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(d.createdAt)}
                  </span>
                </a>
              ))}
              {invoices && invoices.length > 0 ? (
                <>
                  <p className="mt-2 font-medium">{t('shipment.invoices')}</p>
                  {invoices.map((inv) => (
                    <a
                      key={inv.id}
                      href={`/api/proxy/invoices/${inv.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-accent"
                    >
                      <span>
                        {inv.number} <Badge>{inv.kind}</Badge>
                      </span>
                      <span className="tabular-nums">{formatMoney(inv.total, inv.currency)}</span>
                    </a>
                  ))}
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
