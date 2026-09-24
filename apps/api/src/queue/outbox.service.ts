import { Injectable, Logger } from '@nestjs/common';
import { type DbOrTx, type Db, InjectDb, Prisma } from '../infra/prisma';
import type { JobName, JobPayloads } from './jobs';

export interface OutboxOptions {
  /** Gecikmeli iş: bu zamanda çalışsın (delayed job). */
  runAt?: Date;
}

/**
 * Transactional outbox: olay, iş verisiyle AYNI transaction'da yazılır.
 * Dispatcher onu kuyruğa taşır → "commit oldu ama iş kuyruğa girmedi" durumu olmaz.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger('Outbox');
  constructor(@InjectDb() private readonly db: Db) {}

  async emit<N extends JobName>(
    tx: DbOrTx,
    name: N,
    payload: JobPayloads[N],
    opts: OutboxOptions = {},
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        type: name,
        payload: {
          data: payload,
          runAt: opts.runAt?.toISOString() ?? null,
        } as Prisma.InputJsonValue,
      },
    });
    this.logger.debug({ name, payload, runAt: opts.runAt }, 'outbox event');
  }

  async emitNow<N extends JobName>(name: N, payload: JobPayloads[N], opts?: OutboxOptions) {
    return this.emit(this.db, name, payload, opts);
  }
}
