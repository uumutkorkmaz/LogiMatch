'use client';

import { Alert, Button, type ButtonProps, Field, Modal, Textarea } from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState, useTransition } from 'react';
import { clientApi, errorText } from '@/lib/api-client';

/**
 * API'ye bir mutasyon gönderen buton. Başarıda sayfayı yeniler; hata RFC 7807 detayıyla gösterilir.
 * `confirm` verilirse önce onay penceresi açılır (isteğe bağlı gerekçe alanıyla).
 */
export function ActionButton({
  action,
  children,
  confirm,
  reasonLabel,
  onDone,
  ...props
}: Omit<ButtonProps, 'onClick'> & {
  action: (reason?: string) => Promise<unknown>;
  confirm?: ReactNode;
  reasonLabel?: string;
  onDone?: (result: unknown) => void;
}) {
  const t = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const run = () =>
    start(async () => {
      setError(null);
      try {
        const res = await action(reasonLabel ? reason : undefined);
        setOpen(false);
        onDone?.(res);
        router.refresh();
      } catch (err) {
        setError(errorText(err));
      }
    });

  return (
    <>
      <Button
        {...props}
        disabled={pending || props.disabled}
        onClick={() => (confirm ? setOpen(true) : run())}
      >
        {pending ? '…' : children}
      </Button>
      {confirm ? (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={children}
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                variant={props.variant === 'destructive' ? 'destructive' : 'default'}
                disabled={pending || (!!reasonLabel && reason.trim().length < 3)}
                onClick={run}
              >
                {t('confirm')}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-sm">
            <div>{confirm}</div>
            {reasonLabel ? (
              <Field label={reasonLabel}>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            ) : null}
            {error ? <Alert tone="danger">{error}</Alert> : null}
          </div>
        </Modal>
      ) : null}
      {!confirm && error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </>
  );
}

/**
 * Server Component'lerden kullanılabilen sürüm: yalnızca serileştirilebilir prop alır.
 * `reasonKey` verilirse onay penceresindeki metin gövdeye bu anahtarla eklenir.
 */
export function ApiButton({
  path,
  method = 'POST',
  body,
  reasonKey,
  redirectTo,
  ...props
}: Omit<ButtonProps, 'onClick'> & {
  path: string;
  method?: 'POST' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  reasonKey?: string;
  redirectTo?: string;
  confirm?: ReactNode;
  reasonLabel?: string;
}) {
  const router = useRouter();
  return (
    <ActionButton
      {...props}
      action={(reason) =>
        clientApi(path, {
          method,
          json: { ...(body ?? {}), ...(reasonKey ? { [reasonKey]: reason } : {}) },
        })
      }
      onDone={() => {
        if (redirectTo) router.push(redirectTo);
      }}
    />
  );
}
