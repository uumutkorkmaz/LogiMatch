import { Global, Module } from '@nestjs/common';
import { MetricsModule } from '../health/metrics';
import { CandidatesRepository } from './infra/candidates.repository';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

@Global()
@Module({
  imports: [MetricsModule],
  controllers: [MatchingController],
  providers: [CandidatesRepository, MatchingService],
  exports: [MatchingService, CandidatesRepository],
})
export class MatchingModule {}
