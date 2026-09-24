import { Injectable, Logger } from '@nestjs/common';
import type { JobName, JobPayloads } from './jobs';

type Handler<N extends JobName> = (payload: JobPayloads[N]) => Promise<void>;

/** Modüller iş işleyicilerini buraya kaydeder; BullMQ worker'ı ve inline sürücü buradan çağırır. */
@Injectable()
export class JobRegistry {
  private readonly logger = new Logger('JobRegistry');
  private readonly handlers = new Map<JobName, Handler<JobName>>();

  register<N extends JobName>(name: N, handler: Handler<N>): void {
    this.handlers.set(name, handler as unknown as Handler<JobName>);
  }

  has(name: JobName): boolean {
    return this.handlers.has(name);
  }

  async handle<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void> {
    const h = this.handlers.get(name);
    if (!h) {
      this.logger.warn({ name }, 'no handler registered');
      return;
    }
    await h(payload);
  }
}
