import { Badge } from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import { scoreTone } from '@/lib/format';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary';

const TONES: Record<string, Tone> = {
  // yük / sevkiyat
  DRAFT: 'neutral',
  PUBLISHED: 'info',
  MATCHING: 'info',
  OFFERED: 'warning',
  ASSIGNED: 'primary',
  AT_PICKUP: 'primary',
  LOADED: 'primary',
  IN_TRANSIT: 'primary',
  AT_DELIVERY: 'primary',
  DELIVERED: 'success',
  POD_SUBMITTED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  EXPIRED: 'neutral',
  DISPUTED: 'danger',
  // ilan / eşleşme / teklif
  ACTIVE: 'success',
  RESERVED: 'primary',
  SUGGESTED: 'info',
  VIEWED: 'neutral',
  INTERESTED_BY_SHIPPER: 'warning',
  INTERESTED_BY_CARRIER: 'warning',
  MUTUAL: 'success',
  DISMISSED: 'neutral',
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  COUNTERED: 'neutral',
  WITHDRAWN: 'neutral',
  // belge / firma
  APPROVED: 'success',
  VERIFIED: 'success',
  UNVERIFIED: 'neutral',
  UNDER_REVIEW: 'warning',
  SUSPENDED: 'danger',
  PENDING_REVIEW: 'warning',
};

type Kind =
  | 'loadStatus'
  | 'postingStatus'
  | 'matchStatus'
  | 'offerStatus'
  | 'shipmentStatus'
  | 'documentStatus'
  | 'companyStatus'
  | 'verificationStatus';

export function StatusBadge({ kind, value }: { kind: Kind; value: string }) {
  const t = useTranslations('enums');
  return <Badge tone={TONES[value] ?? 'neutral'}>{t(`${kind}.${value}`)}</Badge>;
}

export function ScoreBadge({ score }: { score: number | string }) {
  const n = Number(score);
  return (
    <Badge tone={scoreTone(n)} className="text-sm tabular-nums" title="Eşleşme skoru (0-100)">
      {Math.round(n)}
    </Badge>
  );
}
