import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MetricsModule } from './metrics';

@Module({ imports: [MetricsModule], controllers: [HealthController] })
export class HealthModule {}
