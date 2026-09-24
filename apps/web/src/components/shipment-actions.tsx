'use client';

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  Modal,
  Textarea,
} from '@logimatch/ui';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorText, post } from '@/lib/api-client';
import type { Shipment } from '@/lib/types';
import { ActionButton } from './actions';
import { DocumentUpload } from './document-upload';

const TARGET: Record<string, string> = {
  ARRIVE_PICKUP: 'AT_PICKUP',
  LOAD: 'LOADED',
  DEPART: 'IN_TRANSIT',
  ARRIVE_DELIVERY: 'AT_DELIVERY',
  DELIVER: 'DELIVERED',
  SUBMIT_POD: 'POD_SUBMITTED',
  CONFIRM: 'COMPLETED',
};

/** Rol ve duruma göre izinli aksiyonlar (durum makinesinden gelen availableEvents). */
export function ShipmentActions({
  shipment,
  hasPod,
  myRating,
}: {
  shipment: Shipment;
  hasPod: boolean;
  myRating: boolean;
}) {
  const t = useTranslations();
  const events = shipment.availableEvents ?? [];
  const role = shipment.viewerRole;
  const next = events.filter((e) => TARGET[e]);
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('shipment.next')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {next.map((e) => (
            <ActionButton
              key={e}
              data-testid={`status-${TARGET[e]}`}
              disabled={e === 'SUBMIT_POD' && !hasPod}
              action={() => post(`/shipments/${shipment.id}/status`, { status: TARGET[e] })}
              confirm={e === 'CONFIRM' ? t('shipment.confirm') + '?' : undefined}
            >
              {e === 'CONFIRM'
                ? t('shipment.confirm')
                : `→ ${t(`enums.shipmentStatus.${TARGET[e]}`)}`}
            </ActionButton>
          ))}
          {shipment.status === 'ASSIGNED' && (role === 'CARRIER' || role === 'DRIVER') ? (
            <ActionButton
              variant="outline"
              action={() =>
                post(`/shipments/${shipment.id}/events`, { type: 'DEPARTED_TO_PICKUP' })
              }
            >
              {t('shipment.departed')}
            </ActionButton>
          ) : null}
        </div>

        {(role === 'CARRIER' || role === 'DRIVER') &&
        ['DELIVERED', 'AT_DELIVERY', 'IN_TRANSIT', 'LOADED', 'AT_PICKUP', 'ASSIGNED'].includes(
          shipment.status,
        ) ? (
          <div>
            <p className="mb-2 text-sm font-medium">{t('shipment.documents')}</p>
            <DocumentUpload
              endpoint={`/shipments/${shipment.id}/documents`}
              types={['POD', 'IRSALIYE', 'CMR', 'OTHER']}
              withExpiry={false}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {events.includes('CANCEL') && role !== 'DRIVER' ? (
            <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
              {t('shipment.cancel')}
            </Button>
          ) : null}
          {events.includes('DISPUTE') ? (
            <ActionButton
              variant="outline"
              size="sm"
              reasonLabel={t('shipment.disputeReason')}
              confirm={t('shipment.dispute')}
              action={(reason) =>
                post(`/shipments/${shipment.id}/dispute`, {
                  reason: (reason ?? '').padEnd(10, '.'),
                })
              }
            >
              {t('shipment.dispute')}
            </ActionButton>
          ) : null}
        </div>

        {shipment.status === 'COMPLETED' && (role === 'SHIPPER' || role === 'CARRIER') ? (
          myRating ? (
            <Alert tone="success">{t('shipment.rated')}</Alert>
          ) : (
            <RatingForm shipmentId={shipment.id} side={role} />
          )
        ) : null}
      </CardContent>
      <CancelDialog open={cancelOpen} onClose={() => setCancelOpen(false)} shipment={shipment} />
    </Card>
  );
}

function CancelDialog({
  open,
  onClose,
  shipment,
}: {
  open: boolean;
  onClose: () => void;
  shipment: Shipment;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [noShow, setNoShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('shipment.cancel')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 3}
            onClick={async () => {
              setError(null);
              try {
                const r = await post<{
                  cancellation: { tier: string; total: string; payer: string | null };
                }>(`/shipments/${shipment.id}/cancel`, { reason, noShow });
                setResult(
                  `${r.cancellation.tier}: ${r.cancellation.total} ${shipment.currency} ${r.cancellation.payer ? `(${r.cancellation.payer})` : ''}`,
                );
                router.refresh();
              } catch (err) {
                setError(errorText(err));
              }
            }}
          >
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <Alert tone="warning">
          İptal politikası: yüklemeye 48 saatten fazla varsa ücretsiz; 24–48 saat %10; 24 saatten az
          %25; yükleme noktasında %50 + boş km tazminatı.
        </Alert>
        <Field label={t('shipment.cancelReason')}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {shipment.viewerRole === 'SHIPPER' && shipment.status === 'ASSIGNED' ? (
          <Checkbox
            label={t('shipment.noShow')}
            checked={noShow}
            onChange={(e) => setNoShow(e.target.checked)}
          />
        ) : null}
        {result ? <Alert tone="success">{result}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Modal>
  );
}

function RatingForm({ shipmentId, side }: { shipmentId: string; side: 'SHIPPER' | 'CARRIER' }) {
  const t = useTranslations('shipment');
  const router = useRouter();
  const dims =
    side === 'SHIPPER'
      ? ['punctuality', 'communication', 'cargoCare', 'documentation', 'priceHonesty']
      : ['punctuality', 'communication', 'documentation', 'priceHonesty'];
  const [values, setValues] = useState<Record<string, number>>({ stars: 5 });
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const Stars = ({ name }: { name: string }) => (
    <div className="flex gap-0.5" role="radiogroup" aria-label={t(name)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={values[name] === n}
          aria-label={`${n}`}
          onClick={() => setValues({ ...values, [name]: n })}
        >
          <Star
            className={`size-5 ${n <= (values[name] ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`}
          />
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
      data-testid="rating-form"
    >
      <p className="text-sm font-medium">{t('rate')}</p>
      {['stars', ...dims].map((d) => (
        <div key={d} className="flex items-center justify-between gap-3 text-sm">
          <span>{t(d)}</span>
          <Stars name={d} />
        </div>
      ))}
      <Input
        placeholder={t('comment')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <Button
        onClick={async () => {
          setError(null);
          try {
            await post(`/shipments/${shipmentId}/ratings`, {
              ...values,
              comment: comment || undefined,
            });
            router.refresh();
          } catch (err) {
            setError(errorText(err));
          }
        }}
      >
        {t('rate')}
      </Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
