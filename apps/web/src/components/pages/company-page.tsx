import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  Td,
  Th,
} from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import { api } from '@/lib/api-server';
import { fileHref, formatDate } from '@/lib/format';
import type { CompanyLite, DocumentRow, Me } from '@/lib/types';
import { ApiButton } from '../actions';
import { StatusBadge } from '../badges';
import { DocumentUpload } from '../document-upload';
import { PageHeader } from '../shell';

const SHIPPER_DOCS = ['TAX_CERTIFICATE', 'SIGNATURE_CIRCULAR', 'ACTIVITY_CERTIFICATE', 'OTHER'];
const CARRIER_DOCS = [
  'TAX_CERTIFICATE',
  'SIGNATURE_CIRCULAR',
  'ACTIVITY_CERTIFICATE',
  'K1',
  'L1',
  'L2',
  'C2',
  'C3',
  'R1',
  'R2',
  'CARRIER_LIABILITY',
  'CARGO_INSURANCE',
  'OTHER',
];

export async function CompanyPage() {
  const t = await getTranslations();
  const me = await api<Me>('/me');
  const m = me.memberships.find((x) => x.companyId === me.activeCompanyId);
  if (!m) return <Alert tone="warning">{t('onboarding.text')}</Alert>;
  const [company, docs] = await Promise.all([
    api<CompanyLite>(`/companies/${m.companyId}`),
    api<DocumentRow[]>(`/companies/${m.companyId}/documents`),
  ]);
  return (
    <>
      <PageHeader
        title={company.legalName}
        description={`${company.taxOffice} · ${company.taxNumber} · ${company.city}`}
        actions={
          <ApiButton variant="outline" path={`/companies/${company.id}/verify-tax`}>
            VKN doğrula
          </ApiButton>
        }
      />
      {company.verificationStatus !== 'VERIFIED' ? (
        <Alert tone="warning" className="mb-4">
          {t('onboarding.pendingVerification')}
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t('common.company')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex gap-2">
              <StatusBadge kind="verificationStatus" value={company.verificationStatus} />
              <StatusBadge kind="companyStatus" value={company.status} />
            </div>
            <p>{t(`enums.companyType.${company.type}`)}</p>
            <p className="text-muted-foreground">{company.address}</p>
            <p className="text-muted-foreground">
              {company.phone} · {company.email}
            </p>
            <p className="text-xs text-muted-foreground">Rolünüz: {m.companyRole}</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('onboarding.uploadDocs')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DocumentUpload
              endpoint={`/companies/${company.id}/documents`}
              types={company.type === 'SHIPPER' ? SHIPPER_DOCS : CARRIER_DOCS}
            />
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
                        href={fileHref(d.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
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
      </div>
    </>
  );
}
