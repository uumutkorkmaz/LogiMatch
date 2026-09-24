import { OPEN_LOAD_STATUSES, OPEN_MATCH_STATUSES } from '@logimatch/shared';
import type { DbOrTx } from '../infra/prisma';

/**
 * Açık ilanın türetilmiş durumu (DOMAIN §4.1): bekleyen teklif varsa OFFERED, açık eşleşme
 * varsa MATCHING, yoksa PUBLISHED. Atanmış/kapanmış ilanlara dokunmaz.
 */
export async function syncOpenLoadStatus(tx: DbOrTx, loadId: string): Promise<void> {
  const load = await tx.load.findUnique({ where: { id: loadId }, select: { status: true } });
  if (!load || !OPEN_LOAD_STATUSES.includes(load.status)) return;
  const [pending, open] = await Promise.all([
    tx.offer.count({ where: { loadId, status: 'PENDING' } }),
    tx.match.count({ where: { loadId, status: { in: [...OPEN_MATCH_STATUSES] } } }),
  ]);
  const target = pending > 0 ? 'OFFERED' : open > 0 ? 'MATCHING' : 'PUBLISHED';
  if (target !== load.status) {
    await tx.load.updateMany({
      where: { id: loadId, status: { in: [...OPEN_LOAD_STATUSES] } },
      data: { status: target },
    });
  }
}
