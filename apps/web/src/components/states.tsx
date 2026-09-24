'use client';

import { Alert, Button, Card, Skeleton } from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/** error.tsx sınırları için ortak görünüm. */
export function ErrorView({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');
  return (
    <div className="mx-auto max-w-lg py-16">
      <Alert tone="danger" title={t('error')}>
        <p>{t('errorText')}</p>
        {error.digest ? <p className="mt-1 text-xs opacity-70">ref: {error.digest}</p> : null}
      </Alert>
      <Button className="mt-4" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  );
}

/** loading.tsx için iskelet. */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="mb-2 h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      ))}
    </div>
  );
}

/** Cursor sayfalama: mevcut filtreleri koruyarak sonraki sayfa linki. */
export function LoadMore({ cursor }: { cursor: string | null }) {
  const t = useTranslations('common');
  const params = useSearchParams();
  if (!cursor) return null;
  const next = new URLSearchParams(params.toString());
  next.set('cursor', cursor);
  return (
    <div className="mt-4 flex justify-center">
      <Button asChild variant="outline">
        <Link href={`?${next.toString()}`}>{t('loadMore')}</Link>
      </Button>
    </div>
  );
}
