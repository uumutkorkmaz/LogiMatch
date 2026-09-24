'use client';

import { Alert, Button, Select } from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorText, post } from '@/lib/api-client';

/** Panodan manuel eşleşme: carrier bir yüke kendi araç ilanıyla ilgi gösterir (TRUCK_INITIATED). */
export function BoardInterest({
  loadId,
  postings,
}: {
  loadId: string;
  postings: { id: string; label: string }[];
}) {
  const t = useTranslations('board');
  const router = useRouter();
  const [postingId, setPostingId] = useState(postings[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  if (postings.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <Select
        aria-label={t('selectPosting')}
        value={postingId}
        onChange={(e) => setPostingId(e.target.value)}
        className="h-9 w-auto max-w-xs text-xs"
      >
        {postings.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        variant={ok ? 'secondary' : 'default'}
        disabled={ok}
        onClick={async () => {
          setError(null);
          try {
            const m = await post<{ id: string }>('/matches', { loadId, truckPostingId: postingId });
            setOk(true);
            router.push(`/carrier/matches/${m.id}`);
          } catch (err) {
            setError(errorText(err));
          }
        }}
      >
        {ok ? '✓' : t('showInterest')}
      </Button>
      {error ? (
        <Alert tone="warning" className="w-full py-2 text-xs">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
