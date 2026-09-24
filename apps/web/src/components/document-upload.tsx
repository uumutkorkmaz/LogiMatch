'use client';

import { Alert, Button, Field, Input, Select } from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, toProblem } from '@/lib/problem';
import { errorText } from '@/lib/api-client';

/** Belge yükleme (multipart) — proxy üzerinden `/{entity}/{id}/documents`. */
export function DocumentUpload({
  endpoint,
  types,
  withExpiry = true,
}: {
  endpoint: string;
  types: string[];
  withExpiry?: boolean;
}) {
  const t = useTranslations('fleet');
  const router = useRouter();
  const [type, setType] = useState(types[0] ?? 'OTHER');
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('type', type);
      if (withExpiry && expiresAt)
        fd.set('expiresAt', new Date(`${expiresAt}T23:59:59+03:00`).toISOString());
      fd.set('file', file);
      const res = await fetch(`/api/proxy${endpoint}`, { method: 'POST', body: fd });
      if (!res.ok) throw new ApiError(await toProblem(res));
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('docType')}>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((d) => (
              <option key={d} value={d}>
                {d.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        {withExpiry ? (
          <Field label={t('expiresAt')}>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
        ) : null}
        <Field label={t('file')}>
          <Input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
      </div>
      <div>
        <Button size="sm" disabled={!file || busy} onClick={() => void submit()}>
          {t('uploadDoc')}
        </Button>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
