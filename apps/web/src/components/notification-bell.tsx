'use client';

import { Button } from '@logimatch/ui';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clientApi, post } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import type { Notification, Page } from '@/lib/types';

/** Uygulama içi bildirimler; 30 sn'de bir yoklanır. */
export function NotificationBell() {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<(Page<Notification> & { unread: number }) | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await clientApi<Page<Notification> & { unread: number }>('/notifications?limit=15'));
    } catch {
      /* sessiz */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('notifications')}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="size-5" />
        {data && data.unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div className="absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">{t('notifications')}</span>
            <button
              className="text-xs text-primary hover:underline"
              onClick={async () => {
                await post('/notifications/read-all');
                await load();
              }}
            >
              {t('markAllRead')}
            </button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!data || data.items.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t('noNotifications')}
              </li>
            ) : (
              data.items.map((n) => (
                <li
                  key={n.id}
                  className={`border-b border-border px-4 py-3 text-sm last:border-0 ${n.readAt ? '' : 'bg-blue-50/60'}`}
                >
                  <p className="font-medium">{n.title}</p>
                  <p className="text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(n.createdAt)}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
