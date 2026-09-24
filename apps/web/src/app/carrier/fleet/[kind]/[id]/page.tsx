import { Badge, Card, CardContent, CardHeader, CardTitle, Table, Td, Th } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ApiButton } from '@/components/actions';
import { StatusBadge } from '@/components/badges';
import { DocumentUpload } from '@/components/document-upload';
import { PageHeader } from '@/components/shell';
import { api, apiOrNull } from '@/lib/api-server';
import { fileHref, formatDate } from '@/lib/format';
import type { DocumentRow } from '@/lib/types';

const DOCS: Record<string, string[]> = {
  vehicles: ['VEHICLE_LICENSE', 'INSPECTION', 'CMR_INSURANCE', 'TIR_CARNET', 'OTHER'],
  trailers: ['VEHICLE_LICENSE', 'INSPECTION', 'ATP_CERTIFICATE', 'ADR_CERTIFICATE', 'OTHER'],
  drivers: [
    'DRIVING_LICENSE',
    'PSIKOTEKNIK',
    'SRC3',
    'SRC4',
    'SRC5',
    'ADR_CERTIFICATE',
    'PASSPORT',
    'VISA',
    'OTHER',
  ],
};

/** Filo kaydı detayı: belgeler + yükleme + silme (soft delete). */
export default async function FleetItemPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!DOCS[kind]) notFound();
  const t = await getTranslations();
  const item = await apiOrNull<{
    id: string;
    plate?: string;
    fullName?: string;
    status: string;
    complianceValidUntil: string | null;
  }>(`/${kind}/${id}`);
  if (!item) notFound();
  const docs = await api<DocumentRow[]>(`/${kind}/${id}/documents`);
  return (
    <>
      <PageHeader
        title={item.plate ?? item.fullName}
        description={`${t('fleet.compliance')}: ${item.complianceValidUntil ? formatDate(item.complianceValidUntil) : 'Belge eksik'}`}
        actions={
          <ApiButton
            variant="destructive"
            method="DELETE"
            path={`/${kind}/${id}`}
            confirm="Kayıt silinsin mi? (Aktif ilan/sevkiyatta ise silinemez)"
            redirectTo="/carrier/fleet"
          >
            {t('common.delete')}
          </ApiButton>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('shipment.documents')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DocumentUpload endpoint={`/${kind}/${id}/documents`} types={DOCS[kind]} />
          <Table>
            <thead>
              <tr>
                <Th>{t('fleet.docType')}</Th>
                <Th>{t('fleet.expiresAt')}</Th>
                <Th>{t('common.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <a
                      className="text-primary hover:underline"
                      href={fileHref(d.url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {d.type}
                    </a>
                  </Td>
                  <Td>{formatDate(d.expiresAt)}</Td>
                  <Td>
                    <StatusBadge kind="documentStatus" value={d.status} />
                    {d.rejectionReason ? (
                      <Badge tone="danger" className="ml-2">
                        {d.rejectionReason}
                      </Badge>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
