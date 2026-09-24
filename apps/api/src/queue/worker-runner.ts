import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import { ENV, type Env } from '../config/env';
import { type Db, InjectDb } from '../infra/prisma';
import { QueueProvider, OutboxDispatcher } from './dispatcher';
import { JobRegistry } from './job-registry';
import { type JobName, type JobPayloads, QUEUES } from './jobs';

/**
 * Worker tarafı: BullMQ Worker'larını ve outbox poll döngüsünü başlatır.
 * Ayrı süreçte (`node dist/worker.js`) veya WORKER_IN_API=true iken API içinde çalışır.
 */
@Injectable()
export class WorkerRunner implements OnModuleDestroy {
  private readonly logger = new Logger('Worker');
  private readonly workers: Worker[] = [];
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @InjectDb() private readonly db: Db,
    private readonly registry: JobRegistry,
    private readonly dispatcher: OutboxDispatcher,
    private readonly queues: QueueProvider,
  ) {}

  async start(): Promise<void> {
    const connection = { url: this.env.REDIS_URL };
    const concurrency: Record<string, number> = {
      [QUEUES.matching]: this.env.WORKER_CONCURRENCY_MATCHING,
      [QUEUES.notifications]: this.env.WORKER_CONCURRENCY_NOTIFICATIONS,
      [QUEUES.timers]: 4,
      [QUEUES.maintenance]: 1,
    };

    for (const [queue, c] of Object.entries(concurrency)) {
      const w = new Worker(
        queue,
        async (job: Job) => {
          await this.registry.handle(job.name as JobName, job.data as JobPayloads[JobName]);
        },
        { connection, concurrency: c },
      );
      w.on('failed', (job, err) => void this.onFailed(queue, job, err));
      this.workers.push(w);
    }

    // Günlük belge taraması 03:00 İstanbul (00:00 UTC) + saatlik zamanlayıcı uzlaştırması.
    const maintenance = this.queues.get(QUEUES.maintenance);
    await maintenance.upsertJobScheduler(
      'document-expiry-daily',
      { pattern: '0 0 * * *', tz: 'UTC' },
      {
        name: 'document.expiry-scan',
        data: {},
      },
    );
    await maintenance.upsertJobScheduler(
      'reconcile-hourly',
      { every: 60 * 60 * 1000 },
      {
        name: 'reconcile.timers',
        data: {},
      },
    );

    this.timer = setInterval(() => void this.poll(), this.env.OUTBOX_POLL_MS);
    this.logger.log('worker started');
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      while ((await this.dispatcher.drainOnce()) > 0) {
        /* boşalana kadar */
      }
    } catch (err) {
      this.logger.error({ err }, 'outbox poll failed');
    } finally {
      this.polling = false;
    }
  }

  /** Son denemede de başarısız olan bildirim DLQ'ya düşer ve DEAD işaretlenir (#28). */
  private async onFailed(queue: string, job: Job | undefined, err: Error): Promise<void> {
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    this.logger.warn(
      { queue, name: job.name, attempts: job.attemptsMade, err: err.message },
      'job failed',
    );
    if (!exhausted) return;
    await this.queues.get(QUEUES.dlq).add(job.name, { ...job.data, error: err.message, queue });
    if (job.name === 'notification.send') {
      const { notificationId } = job.data as JobPayloads['notification.send'];
      await this.db.notification
        .update({ where: { id: notificationId }, data: { status: 'DEAD', lastError: err.message } })
        .catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await Promise.all(this.workers.map((w) => w.close()));
  }
}
