import { Module } from '@nestjs/common';
import { RatingsModule } from '../ratings/ratings.module';
import { CompaniesService } from './companies.service';
import { CompaniesController, MeController } from './identity.controller';
import { MeService } from './me.service';

@Module({
  imports: [RatingsModule],
  controllers: [MeController, CompaniesController],
  providers: [CompaniesService, MeService],
  exports: [CompaniesService],
})
export class IdentityModule {}
