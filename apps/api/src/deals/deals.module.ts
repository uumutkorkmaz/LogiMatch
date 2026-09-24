import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { type Db, InjectDb } from '../infra/prisma';
import { LoadsService } from '../listings/loads.service';
import { TruckPostingsService } from '../listings/truck-postings.service';
import { JobRegistry } from '../queue/job-registry';
import { RatingsModule } from '../ratings/ratings.module';
import { OffersController, ShipmentsController } from './deals.controller';
import { OffersService } from './offers.service';
import { ShipmentsService } from './shipments.service';

@Global()
@Module({
  imports: [RatingsModule],
  controllers: [OffersController, ShipmentsController],
  providers: [OffersService, ShipmentsService],
  exports: [OffersService, ShipmentsService],
})
export class DealsModule implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly offers: OffersService,
    private readonly shipments: ShipmentsService,
    private readonly loads: LoadsService,
    private readonly postings: TruckPostingsService,
    @InjectDb() private readonly db: Db,
  ) {}

  /**
   * Saatlik güvenlik ağı (ARCHITECTURE §4): gecikmeli işler kaybolduysa süresi geçmiş
   * teklif, ilan ve POD'ları kapatır. Birincil mekanizma delayed job'dır.
   */
  onModuleInit(): void {
    this.registry.register('reconcile.timers', async () => {
      await this.offers.reconcileExpired();
      const now = new Date();
      const loads = await this.db.load.findMany({
        where: {
          status: { in: ['PUBLISHED', 'MATCHING', 'OFFERED'] },
          OR: [{ expiresAt: { lte: now } }, { pickupWindowEnd: { lte: now } }],
        },
        select: { id: true },
      });
      for (const l of loads) await this.loads.expire(l.id);
      const postings = await this.db.truckPosting.findMany({
        where: { status: 'ACTIVE', availableUntil: { lte: now } },
        select: { id: true },
      });
      for (const p of postings) await this.postings.expire(p.id);
      await this.shipments.reconcileAutoComplete();
    });
  }
}
