import { Alert, Button, EmptyState, Stat } from '@logimatch/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { MatchCard } from '@/components/match-card';
import { PageHeader } from '@/components/shell';
import { api } from '@/lib/api-server';
import { formatDate, formatMoney } from '@/lib/format';
import type { DocumentRow, Match, Me } from '@/lib/types';

interface Summary {
  byCurrency: { currency: 'TRY' | 'EUR' | 'USD'; gross: string; commission: string; net: string }[];
  completed: number;
  active: number;
}

export default async function CarrierOverview() {
  const t = await getTranslations();
  const me = await api<Me>('/me');
  const company = me.memberships.find((m) => m.companyId === me.activeCompanyId)?.company;
  if (!company) {
    return (
      <EmptyState
        title={t('onboarding.title')}
        description={t('onboarding.text')}
        action={
          <Button asChild>
            <Link href="/onboarding">{t('onboarding.submit')}</Link>
          </Button>
        }
      />
    );
  }
  const [summary, expiring, matches] = await Promise.all([
    api<Summary>('/shipments/summary'),
    api<DocumentRow[]>('/fleet/expiring-documents'),
    api<Match[]>('/matches'),
  ]);
  const tryRow = summary.byCurrency.find((r) => r.currency === 'TRY');
  const others = summary.byCurrency.filter((r) => r.currency !== 'TRY');

  return (
    <>
      <PageHeader
        title={t('nav.overview')}
        description={company.legalName}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/carrier/board">{t('nav.board')}</Link>
            </Button>
            <Button asChild>
              <Link href="/carrier/postings/new">+ {t('nav.newPosting')}</Link>
            </Button>
          </>
        }
      />
      {expiring.length > 0 ? (
        <Alert
          tone="warning"
          className="mb-4"
          title={`${t('fleet.expiringTitle')} (${expiring.length})`}
        >
          <p>{t('fleet.expiringText')}</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" data-testid="expiring-docs">
            {expiring.slice(0, 8).map((d) => (
              <li key={d.id}>
                <b>{d.type}</b> · {d.ownerType} ·{' '}
                {d.status === 'EXPIRED'
                  ? t('enums.documentStatus.EXPIRED')
                  : formatDate(d.expiresAt)}
              </li>
            ))}
          </ul>
          <Link href="/carrier/fleet" className="mt-2 inline-block text-xs underline">
            {t('nav.fleet')} →
          </Link>
        </Alert>
      ) : null}
      {company.verificationStatus !== 'VERIFIED' ? (
        <Alert tone="warning" className="mb-4">
          {t('onboarding.pendingVerification')}{' '}
          <Link className="underline" href="/carrier/company">
            {t('onboarding.uploadDocs')}
          </Link>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label={t('earnings.gross')}
          value={formatMoney(tryRow?.gross ?? 0, 'TRY')}
          hint={others.map((o) => formatMoney(o.gross, o.currency)).join(' · ') || undefined}
        />
        <Stat
          label={t('earnings.commission')}
          value={formatMoney(tryRow?.commission ?? 0, 'TRY')}
        />
        <Stat
          label={t('earnings.net')}
          value={formatMoney(tryRow?.net ?? 0, 'TRY')}
          hint={others.map((o) => formatMoney(o.net, o.currency)).join(' · ') || undefined}
        />
        <Stat label={t('earnings.completed')} value={summary.completed} />
        <Stat label={t('earnings.active')} value={summary.active} />
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">{t('nav.matches')}</h2>
      {matches.length === 0 ? (
        <EmptyState title={t('load.noMatches')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {matches.slice(0, 6).map((m) => (
            <MatchCard key={m.id} match={m} side="CARRIER" basePath="/carrier" />
          ))}
        </div>
      )}
    </>
  );
}
