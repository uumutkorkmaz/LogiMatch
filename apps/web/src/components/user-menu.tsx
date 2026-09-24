'use client';

import { Button } from '@logimatch/ui';
import { LogOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function UserMenu({ name, email }: { name: string; email: string }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();

  const setLocale = (l: string) => {
    document.cookie = `NEXT_LOCALE=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={t('language')}
        value={locale}
        onChange={(e) => setLocale(e.target.value)}
        className="h-8 rounded-md border border-border bg-background px-1.5 text-xs"
      >
        <option value="tr">TR</option>
        <option value="en">EN</option>
      </select>
      <div className="hidden text-right text-xs leading-tight sm:block">
        <p className="font-medium">{name}</p>
        <p className="text-muted-foreground">{email}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('logout')}
        title={t('logout')}
        onClick={async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        }}
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
