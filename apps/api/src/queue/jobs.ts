// Arka plan iş tipleri ve kuyruk eşlemesi (ARCHITECTURE §4).

export interface JobPayloads {
  'match.compute': { entity: 'load' | 'posting'; id: string };
  'match.recompute': { entity: 'load' | 'posting'; id: string };
  'offer.expire': { offerId: string };
  'listing.expire': { entity: 'load' | 'posting'; id: string };
  'notification.send': { notificationId: string };
  'shipment.no-show-check': { shipmentId: string };
  'shipment.auto-complete': { shipmentId: string };
  'document.expiry-scan': Record<string, never>;
  'reconcile.timers': Record<string, never>;
}
export type JobName = keyof JobPayloads;

export const QUEUES = {
  matching: 'lm-matching',
  timers: 'lm-timers',
  notifications: 'lm-notifications',
  maintenance: 'lm-maintenance',
  dlq: 'lm-dlq',
} as const;

export const QUEUE_OF: Record<JobName, (typeof QUEUES)[keyof typeof QUEUES]> = {
  'match.compute': QUEUES.matching,
  'match.recompute': QUEUES.matching,
  'offer.expire': QUEUES.timers,
  'listing.expire': QUEUES.timers,
  'shipment.no-show-check': QUEUES.timers,
  'shipment.auto-complete': QUEUES.timers,
  'notification.send': QUEUES.notifications,
  'document.expiry-scan': QUEUES.maintenance,
  'reconcile.timers': QUEUES.maintenance,
};

/** Aynı iş için tekil BullMQ jobId (idempotency / debounce). */
export function jobIdFor<N extends JobName>(name: N, p: JobPayloads[N], runAt?: Date): string {
  const at = runAt ? `:${runAt.getTime()}` : '';
  switch (name) {
    case 'match.compute':
    case 'match.recompute':
    case 'listing.expire': {
      const x = p as JobPayloads['match.compute'];
      return `${name}:${x.entity}:${x.id}${name === 'match.recompute' ? '' : at}`;
    }
    case 'offer.expire':
      return `${name}:${(p as JobPayloads['offer.expire']).offerId}`;
    case 'notification.send':
      return `${name}:${(p as JobPayloads['notification.send']).notificationId}`;
    case 'shipment.no-show-check':
    case 'shipment.auto-complete':
      return `${name}:${(p as JobPayloads['shipment.no-show-check']).shipmentId}${at}`;
    default:
      return `${name}${at}`;
  }
}

/** recompute olayları 30 sn geciktirilir; aynı jobId varken yeni istek yutulur (debounce). */
export const RECOMPUTE_DEBOUNCE_MS = 30_000;
