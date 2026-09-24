import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { JobRegistry } from '../queue/job-registry';
import { GeoService } from './geo.service';
import { LoadsController, TruckPostingsController } from './listings.controller';
import { LoadsService } from './loads.service';
import { TruckPostingsService } from './truck-postings.service';

@Global()
@Module({
  controllers: [LoadsController, TruckPostingsController],
  providers: [GeoService, LoadsService, TruckPostingsService],
  exports: [GeoService, LoadsService, TruckPostingsService],
})
export class ListingsModule implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly loads: LoadsService,
    private readonly postings: TruckPostingsService,
  ) {}

  onModuleInit(): void {
    this.registry.register('listing.expire', (p) =>
      p.entity === 'load' ? this.loads.expire(p.id) : this.postings.expire(p.id),
    );
  }
}
