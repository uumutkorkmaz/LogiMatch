'use client';

import { cn } from '@logimatch/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavLink({
  href,
  children,
  exact,
  compact,
}: {
  href: string;
  children: ReactNode;
  exact?: boolean;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md text-sm transition-colors',
        compact ? 'whitespace-nowrap px-2.5 py-1.5' : 'px-3 py-2',
        active
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </Link>
  );
}
