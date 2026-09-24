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
import { PageHeader } from '@/components/shell';
import { api } from '@/lib/api-server';
import { formatDate, formatNumber } from '@/lib/format';
import type { Driver, Trailer, Vehicle } from '@/lib/types';
import { FleetForms } from './fleet-forms';

function Validity({ until }: { until: string | null }) {
  if (!until) return <Badge tone="danger">Belge eksik</Badge>;
  const days = (new Date(until).getTime() - Date.now()) / 86_400_000;
  if (days > 3650) return <Badge tone="success">✓</Badge>;
  return (
    <Badge tone={days < 0 ? 'danger' : days < 30 ? 'warning' : 'success'}>
      {formatDate(until)}
    </Badge>
  );
}

export default async function FleetPage() {
  const t = await getTranslations();
  const [vehicles, trailers, drivers] = await Promise.all([
    api<Vehicle[]>('/vehicles'),
    api<Trailer[]>('/trailers'),
    api<Driver[]>('/drivers'),
  ]);
  const status = (s: string) => (
    <Badge tone={s === 'ACTIVE' ? 'success' : 'neutral'}>
      {t(`enums.assetStatus.${s === 'ON_LEAVE' ? 'IN_SERVICE' : s}`)}
    </Badge>
  );

  return (
    <>
      <PageHeader title={t('nav.fleet')} />
      <FleetForms />
      <div className="mt-6 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {t('fleet.vehicles')} ({vehicles.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vehicles.length === 0 ? (
              <EmptyState title={t('fleet.empty')} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t('fleet.plate')}</Th>
                    <Th>{t('fleet.type')}</Th>
                    <Th>{t('fleet.brand')}</Th>
                    <Th>{t('fleet.compliance')}</Th>
                    <Th>{t('common.status')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.id}>
                      <Td>
                        <Link
                          className="font-medium text-primary hover:underline"
                          href={`/carrier/fleet/vehicles/${v.id}`}
                        >
                          {v.plate}
                        </Link>
                      </Td>
                      <Td>{t(`enums.vehicleType.${v.type}`)}</Td>
                      <Td className="text-muted-foreground">
                        {v.brand} {v.model} ({v.year})
                      </Td>
                      <Td>
                        <Validity until={v.complianceValidUntil} />
                      </Td>
                      <Td>{status(v.status)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t('fleet.trailers')} ({trailers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>{t('fleet.plate')}</Th>
                  <Th>{t('fleet.type')}</Th>
                  <Th>{t('fleet.capacityKg')}</Th>
                  <Th>LDM / {t('fleet.pallets')}</Th>
                  <Th>{t('fleet.compliance')}</Th>
                  <Th>{t('common.status')}</Th>
                </tr>
              </thead>
              <tbody>
                {trailers.map((x) => (
                  <tr key={x.id}>
                    <Td>
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={`/carrier/fleet/trailers/${x.id}`}
                      >
                        {x.plate}
                      </Link>
                    </Td>
                    <Td>
                      {t(`enums.trailerType.${x.trailerType}`)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {x.features.map((f) => t(`enums.trailerFeature.${f}`)).join(', ')}
                      </span>
                    </Td>
                    <Td className="tabular-nums">{formatNumber(x.capacityKg)}</Td>
                    <Td className="tabular-nums">
                      {x.loadingMeters} / {x.palletCapacity}
                    </Td>
                    <Td>
                      <Validity until={x.complianceValidUntil} />
                    </Td>
                    <Td>{status(x.status)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t('fleet.drivers')} ({drivers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>{t('auth.fullName')}</Th>
                  <Th>SRC / ADR</Th>
                  <Th>Vize</Th>
                  <Th>{t('fleet.compliance')}</Th>
                  <Th>{t('common.status')}</Th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id}>
                    <Td>
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={`/carrier/fleet/drivers/${d.id}`}
                      >
                        {d.fullName}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">
                      {d.srcTypes.join(', ')}{' '}
                      {d.adrClasses.length ? `· ADR ${d.adrClasses.join(',')}` : ''}
                    </Td>
                    <Td className="text-muted-foreground">{d.visaCountries.join(', ') || '—'}</Td>
                    <Td>
                      <Validity until={d.complianceValidUntil} />
                    </Td>
                    <Td>{status(d.status)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
