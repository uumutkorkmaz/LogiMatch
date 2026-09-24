import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { api } from '@/lib/api-server';
import type { Me } from '@/lib/types';
import { NavLink } from './nav-link';
import { NotificationBell } from './notification-bell';
import { UserMenu } from './user-menu';

export type Panel = 'shipper' | 'carrier' | 'admin';

const NAV: Record<Panel, { href: string; key: string }[]> = {
  shipper: [
    { href: '/dashboard', key: 'overview' },
    { href: '/dashboard/loads', key: 'loads' },
    { href: '/dashboard/loads/new', key: 'newLoad' },
    { href: '/dashboard/offers', key: 'offers' },
    { href: '/dashboard/shipments', key: 'shipments' },
    { href: '/dashboard/messages', key: 'messages' },
  ],
  carrier: [
    { href: '/carrier', key: 'overview' },
    { href: '/carrier/board', key: 'board' },
    { href: '/carrier/postings', key: 'postings' },
    { href: '/carrier/postings/new', key: 'newPosting' },
    { href: '/carrier/matches', key: 'matches' },
    { href: '/carrier/offers', key: 'offers' },
    { href: '/carrier/shipments', key: 'shipments' },
    { href: '/carrier/fleet', key: 'fleet' },
    { href: '/carrier/messages', key: 'messages' },
  ],
  admin: [
    { href: '/admin', key: 'metrics' },
    { href: '/admin/verifications', key: 'verifications' },
    { href: '/admin/companies', key: 'companies' },
    { href: '/admin/moderation', key: 'moderation' },
    { href: '/admin/disputes', key: 'disputes' },
    { href: '/admin/risk', key: 'risk' },
  ],
};

/** Panel iskeleti: kenar menü + üst bar. Kullanıcı ve firma bilgisi sunucuda okunur. */
export async function Shell({ panel, children }: { panel: Panel; children: ReactNode }) {
  const [me, t, tc] = await Promise.all([
    api<Me>('/me'),
    getTranslations('nav'),
    getTranslations('common'),
  ]);
  const active = me.memberships.find((m) => m.companyId === me.activeCompanyId)?.company;
  const isStaff = me.role === 'ADMIN' || me.role === 'OPS';
  const panels: { panel: Panel; href: string; label: string }[] = [];
  if (active?.type === 'SHIPPER' || active?.type === 'BOTH' || isStaff)
    panels.push({ panel: 'shipper', href: '/dashboard', label: tc('shipperPanel') });
  if (active?.type === 'CARRIER' || active?.type === 'BOTH' || isStaff)
    panels.push({ panel: 'carrier', href: '/carrier', label: tc('carrierPanel') });
  if (isStaff) panels.push({ panel: 'admin', href: '/admin', label: tc('adminPanel') });

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <Link
          href="/"
          className="flex items-center gap-2 px-5 py-4 text-lg font-bold tracking-tight"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground">
            LM
          </span>
          LogiMatch
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Ana menü">
          {NAV[panel].map((n) => (
            <NavLink
              key={n.href}
              href={n.href}
              exact={n.href === '/dashboard' || n.href === '/carrier' || n.href === '/admin'}
            >
              {t(n.key)}
            </NavLink>
          ))}
        </nav>
        {panels.length > 1 ? (
          <div className="border-t border-border p-3">
            <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {tc('switchPanel')}
            </p>
            {panels
              .filter((p) => p.panel !== panel)
              .map((p) => (
                <Link
                  key={p.panel}
                  href={p.href}
                  className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {p.label} →
                </Link>
              ))}
          </div>
        ) : null}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="font-semibold md:hidden">LogiMatch</span>
            {active ? (
              <span className="truncate text-muted-foreground">
                {active.legalName}
                {active.verificationStatus !== 'VERIFIED' ? ' · ⚠' : ''}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <UserMenu name={me.fullName ?? me.email} email={me.email} />
          </div>
        </header>
        <nav
          className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-1 md:hidden"
          aria-label="Menü"
        >
          {NAV[panel].map((n) => (
            <NavLink key={n.href} href={n.href} exact compact>
              {t(n.key)}
            </NavLink>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
