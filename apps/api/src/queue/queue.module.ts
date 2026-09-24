import { Global, Module } from '@nestjs/common';
import { OutboxDispatcher, QueueProvider } from './dispatcher';
import { JobRegistry } from './job-registry';
import { OutboxService } from './outbox.service';
import { WorkerRunner } from './worker-runner';

@Global()
@Module({
  providers: [OutboxService, JobRegistry, QueueProvider, OutboxDispatcher, WorkerRunner],
  exports: [OutboxService, JobRegistry, QueueProvider, OutboxDispatcher, WorkerRunner],
})
export class QueueModule {}
