import { Card, CardContent, CardHeader, CardTitle, EmptyState, Table, Td, Th } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import { ApiButton } from '@/components/actions';
import { PageHeader } from '@/components/shell';
import { api } from '@/lib/api-server';
import { fileHref, formatDate, formatDateTime } from '@/lib/format';
import type { CompanyLite, DocumentRow } from '@/lib/types';

/** Doğrulama kuyruğu: belge önizleme + onay/ret (ret sebebi zorunlu) + firma doğrulama. */
export default async function VerificationsPage() {
  const t = await getTranslations();
  const q = await api<{
    documents: DocumentRow[];
    companies: (CompanyLite & { documents: { type: string; status: string }[] })[];
  }>('/admin/verifications/pending');
  return (
    <>
      <PageHeader title={t('nav.verifications')} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {t('admin.pendingDocs')} ({q.documents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {q.documents.length === 0 ? (
              <EmptyState title="✓" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t('common.company')}</Th>
                    <Th>{t('fleet.docType')}</Th>
                    <Th>Sahip</Th>
                    <Th>{t('fleet.expiresAt')}</Th>
                    <Th>{t('common.date')}</Th>
                    <Th>{t('common.actions')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {q.documents.map((d) => (
                    <tr key={d.id} data-testid="pending-doc">
                      <Td className="font-medium">{d.company?.legalName}</Td>
                      <Td>
                        <a
                          className="text-primary hover:underline"
                          href={fileHref(d.url)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {d.type} ↗
                        </a>
                      </Td>
                      <Td className="text-muted-foreground">{d.ownerType}</Td>
                      <Td>{formatDate(d.expiresAt)}</Td>
                      <Td className="text-muted-foreground">{formatDateTime(d.createdAt)}</Td>
                      <Td>
                        <div className="flex gap-2">
                          <ApiButton size="sm" path={`/admin/documents/${d.id}/approve`}>
                            {t('admin.approve')}
                          </ApiButton>
                          <ApiButton
                            size="sm"
                            variant="outline"
                            path={`/admin/documents/${d.id}/reject`}
                            confirm={t('admin.reject')}
                            reasonLabel={t('admin.reason')}
                            reasonKey="reason"
                          >
                            {t('admin.reject')}
                          </ApiButton>
                        </div>
                      </Td>
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
              {t('admin.pendingCompanies')} ({q.companies.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>{t('common.company')}</Th>
                  <Th>VKN</Th>
                  <Th>Belgeler</Th>
                  <Th>{t('common.actions')}</Th>
                </tr>
              </thead>
              <tbody>
                {q.companies.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <p className="font-medium">{c.legalName}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`enums.companyType.${c.type}`)} · {c.city}
                      </p>
                    </Td>
                    <Td className="tabular-nums">{c.taxNumber}</Td>
                    <Td className="text-xs text-muted-foreground">
                      {c.documents.map((d) => `${d.type} (${d.status})`).join(', ') || '—'}
                    </Td>
                    <Td>
                      <div className="flex gap-2">
                        <ApiButton
                          size="sm"
                          path={`/admin/companies/${c.id}/verification`}
                          body={{ verificationStatus: 'VERIFIED' }}
                        >
                          {t('admin.verify')}
                        </ApiButton>
                        <ApiButton
                          size="sm"
                          variant="outline"
                          path={`/admin/companies/${c.id}/verification`}
                          body={{ verificationStatus: 'REJECTED' }}
                          confirm={t('admin.reject')}
                          reasonLabel={t('admin.reason')}
                          reasonKey="reason"
                        >
                          {t('admin.reject')}
                        </ApiButton>
                      </div>
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
