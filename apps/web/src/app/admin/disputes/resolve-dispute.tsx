'use client';

import { Alert, Button, Field, Select, Textarea } from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorText, post } from '@/lib/api-client';

export function ResolveDispute({ id }: { id: string }) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [outcome, setOutcome] = useState('COMPLETED');
  const [faultParty, setFaultParty] = useState('');
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Field label={t('outcome')}>
        <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="COMPLETED">Tamamlandı say</option>
          <option value="CANCELLED">İptal et</option>
        </Select>
      </Field>
      <Field label={t('faultParty')}>
        <Select value={faultParty} onChange={(e) => setFaultParty(e.target.value)}>
          <option value="">—</option>
          <option value="SHIPPER">Yük veren</option>
          <option value="CARRIER">Taşıyıcı</option>
        </Select>
      </Field>
      <Field label={t('resolution')}>
        <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} />
      </Field>
      <Button
        disabled={resolution.trim().length < 5}
        onClick={async () => {
          setError(null);
          try {
            await post(`/admin/disputes/${id}/resolve`, {
              outcome,
              faultParty: faultParty || undefined,
              resolution,
            });
            router.refresh();
          } catch (err) {
            setError(errorText(err));
          }
        }}
      >
        {t('resolve')}
      </Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
