import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ENV, type Env } from '../config/env';
import { type Db, InjectDb } from '../infra/prisma';
import { JobRegistry } from './job-registry';
import {
  jobIdFor,
  type JobName,
  type JobPayloads,
  QUEUE_OF,
  QUEUES,
  RECOMPUTE_DEBOUNCE_MS,
} from './jobs';

interface ClaimedEvent {
  id: string;
  type: string;
  payload: { data: unknown; runAt: string | null };
  attempts: number;
}

/** BullMQ kuyruk örnekleri (üretici tarafı). */
@Injectable()
export class QueueProvider implements OnModuleDestroy {
  private readonly queues = new Map<string, Queue>();
  constructor(@Inject(ENV) private readonly env: Env) {}

  get(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: { url: this.env.REDIS_URL },
        defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
      });
      this.queues.set(name, q);
    }
    return q;
  }

  all(): Queue[] {
    return Object.values(QUEUES).map((n) => this.get(n));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}

/**
 * Outbox'taki PENDING olayları sahiplenir (FOR UPDATE SKIP LOCKED → çoklu worker güvenli) ve
 * - bullmq sürücüsünde kuyruğa (gecikmeliyse delay ile) ekler,
 * - inline sürücüde (test) zamanı gelmişleri hemen aynı süreçte çalıştırır.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger('OutboxDispatcher');

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly queues: QueueProvider,
    private readonly registry: JobRegistry,
  ) {}

  /** Bir tur işler; işlenen olay sayısını döner. */
  async drainOnce(limit = 100): Promise<number> {
    const claimed = await this.db.$queryRaw<ClaimedEvent[]>`
      UPDATE "OutboxEvent" SET status = 'DISPATCHED', "dispatchedAt" = now(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM "OutboxEvent"
        WHERE status = 'PENDING' AND "availableAt" <= now()
        ORDER BY "createdAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, type, payload, attempts`;

    for (const ev of claimed) {
      const name = ev.type as JobName;
      const data = ev.payload.data as JobPayloads[typeof name];
      const runAt = ev.payload.runAt ? new Date(ev.payload.runAt) : undefined;
      try {
        if (this.env.QUEUE_DRIVER === 'inline') {
          if (!runAt || runAt.getTime() <= Date.now()) await this.registry.handle(name, data);
        } else {
          const delay =
            name === 'match.recompute'
              ? RECOMPUTE_DEBOUNCE_MS
              : runAt
                ? Math.max(0, runAt.getTime() - Date.now())
                : 0;
          await this.queues.get(QUEUE_OF[name]).add(name, data, {
            jobId: jobIdFor(name, data, runAt),
            delay,
            ...(name === 'notification.send'
              ? { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
              : { attempts: 5, backoff: { type: 'exponential', delay: 2000 } }),
          });
        }
      } catch (err) {
        this.logger.error({ err, id: ev.id, name }, 'dispatch failed');
        await this.db.outboxEvent.update({
          where: { id: ev.id },
          data: {
            status: ev.attempts >= 10 ? 'FAILED' : 'PENDING',
            lastError: String(err),
            availableAt: new Date(Date.now() + 2 ** Math.min(ev.attempts, 8) * 1000),
          },
        });
      }
    }
    return claimed.length;
  }

  /** Test yardımcı: outbox boşalana kadar işler (işler yeni olay üretebilir). */
  async drainAll(maxRounds = 20): Promise<void> {
    for (let i = 0; i < maxRounds; i++) {
      if ((await this.drainOnce()) === 0) return;
    }
  }
}
