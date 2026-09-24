import { Alert, Button } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import { api } from '@/lib/api-server';
import type { Driver, Trailer, Vehicle } from '@/lib/types';
import { PostingForm } from './posting-form';

export default async function NewPostingPage() {
  const t = await getTranslations();
  const [vehicles, trailers, drivers] = await Promise.all([
    api<Vehicle[]>('/vehicles'),
    api<Trailer[]>('/trailers'),
    api<Driver[]>('/drivers'),
  ]);
  const active = <T extends { status: string }>(xs: T[]) => xs.filter((x) => x.status === 'ACTIVE');
  const ready = active(vehicles).length && active(trailers).length && active(drivers).length;
  return (
    <>
      <PageHeader title={t('posting.title')} />
      {ready ? (
        <PostingForm
          vehicles={active(vehicles).map((v) => ({
            id: v.id,
            label: `${v.plate} · ${v.brand} ${v.model}`,
          }))}
          trailers={active(trailers).map((x) => ({
            id: x.id,
            label: `${x.plate} · ${t(`enums.trailerType.${x.trailerType}`)} · ${x.capacityKg} kg`,
          }))}
          drivers={active(drivers).map((d) => ({ id: d.id, label: d.fullName }))}
        />
      ) : (
        <Alert tone="warning" title={t('fleet.empty')}>
          <Button asChild size="sm" className="mt-2">
            <Link href="/carrier/fleet">{t('nav.fleet')}</Link>
          </Button>
        </Alert>
      )}
    </>
  );
}
