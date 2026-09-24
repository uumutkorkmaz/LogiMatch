import { Controller, Get, Global, Injectable, Module, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { Public } from '../common/decorators';
import { QueueProvider } from '../queue/dispatcher';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly matchingDuration = new Histogram({
    name: 'logimatch_matching_duration_seconds',
    help: 'Tek ilan için eşleştirme süresi (ön-eleme + skorlama + yazma)',
    labelNames: ['direction'],
    buckets: [0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 3, 6],
    registers: [this.registry],
  });
  readonly matchingCandidates = new Histogram({
    name: 'logimatch_matching_candidates',
    help: 'Ön-elemeden geçen aday sayısı',
    buckets: [0, 5, 20, 50, 100, 250, 500],
    registers: [this.registry],
  });
  readonly domainEvents = new Counter({
    name: 'logimatch_domain_events_total',
    help: 'Domain olayları',
    labelNames: ['event'],
    registers: [this.registry],
  });
  readonly queueDepth = new Gauge({
    name: 'logimatch_queue_jobs',
    help: 'Kuyruktaki iş sayısı',
    labelNames: ['queue', 'state'],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'logimatch_' });
  }
}

@ApiExcludeController()
@Controller()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly queues: QueueProvider,
  ) {}

  @Public()
  @Get('metrics')
  async scrape(@Res() res: Response) {
    for (const q of this.queues.all()) {
      const counts = await q
        .getJobCounts('waiting', 'active', 'delayed', 'failed')
        .catch(() => null);
      if (!counts) continue;
      for (const [state, n] of Object.entries(counts))
        this.metrics.queueDepth.set({ queue: q.name, state }, n);
    }
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }
}

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
