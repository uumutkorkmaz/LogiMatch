import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  adminListQuerySchema,
  approveDocumentSchema,
  metricsQuerySchema,
  moderateLoadSchema,
  recomputeMatchesSchema,
  rejectDocumentSchema,
  resolveDisputeSchema,
  resolveRiskFlagSchema,
  setCompanyStatusSchema,
  setCompanyVerificationSchema,
} from '@logimatch/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { AuthActor } from '../common/actor';
import { CurrentActor, Roles } from '../common/decorators';
import { ShipmentsService } from '../deals/shipments.service';
import { DocumentsService } from '../documents/documents.service';
import { IdentityModule } from '../identity/identity.module';
import { LoadsService } from '../listings/loads.service';
import { MatchingService } from '../matching/matching.service';
import { AdminService } from './admin.service';

class ListDto extends createZodDto(adminListQuerySchema) {}
class ApproveDto extends createZodDto(approveDocumentSchema) {}
class RejectDto extends createZodDto(rejectDocumentSchema) {}
class StatusDto extends createZodDto(setCompanyStatusSchema) {}
class VerificationDto extends createZodDto(setCompanyVerificationSchema) {}
class ResolveDisputeDto extends createZodDto(resolveDisputeSchema) {}
class ModerateDto extends createZodDto(moderateLoadSchema) {}
class ResolveFlagDto extends createZodDto(resolveRiskFlagSchema) {}
class RecomputeDto extends createZodDto(recomputeMatchesSchema) {}
class MetricsDto extends createZodDto(metricsQuerySchema) {}
class FxDto extends createZodDto(
  z.object({
    base: z.enum(['TRY', 'EUR', 'USD']),
    quote: z.enum(['TRY', 'EUR', 'USD']),
    rate: z.string().regex(/^\d+(\.\d{1,8})?$/),
  }),
) {}
class ConfigPatchDto extends createZodDto(z.record(z.unknown())) {}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN', 'OPS')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly documents: DocumentsService,
    private readonly shipments: ShipmentsService,
    private readonly loads: LoadsService,
    private readonly matching: MatchingService,
  ) {}

  @Get('verifications/pending')
  pending() {
    return this.admin.pendingVerifications();
  }

  @Post('documents/:id/approve')
  @HttpCode(200)
  approve(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: ApproveDto,
  ) {
    return this.documents.approve(a, id, b.expiresAt);
  }

  @Post('documents/:id/reject')
  @HttpCode(200)
  reject(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: RejectDto,
  ) {
    return this.documents.reject(a, id, b.reason);
  }

  @Get('companies')
  companies(@Query() q: ListDto) {
    return this.admin.listCompanies(q);
  }

  @Post('companies/:id/suspend')
  @HttpCode(200)
  suspend(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: StatusDto,
  ) {
    return this.admin.setCompanyStatus(a, id, b);
  }

  @Post('companies/:id/verification')
  @HttpCode(200)
  verification(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: VerificationDto,
  ) {
    return this.admin.setVerification(a, id, b);
  }

  @Get('disputes')
  disputes(@Query('status') status?: string) {
    return this.admin.listDisputes(status);
  }

  @Post('disputes/:id/resolve')
  @HttpCode(200)
  resolve(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: ResolveDisputeDto,
  ) {
    return this.shipments.resolveDispute(a, id, b);
  }

  @Get('loads/moderation')
  moderation() {
    return this.admin.moderationQueue();
  }

  @Post('loads/:id/moderate')
  @HttpCode(200)
  moderate(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: ModerateDto,
  ) {
    return this.loads.moderate(a, id, b.approve, b.reason);
  }

  @Get('risk-flags')
  flags(@Query() q: ListDto) {
    return this.admin.riskFlags(q);
  }

  @Post('risk-flags/:id/resolve')
  @HttpCode(200)
  resolveFlag(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: ResolveFlagDto,
  ) {
    return this.admin.resolveRiskFlag(a, id, b);
  }

  @Get('metrics')
  metrics(@Query() q: MetricsDto) {
    return this.admin.metrics(q.from, q.to);
  }

  @Post('matches/recompute')
  @HttpCode(202)
  async recompute(@Body() b: RecomputeDto) {
    return {
      enqueued: await this.matching.enqueueRecompute(
        b.loadIds ?? [],
        b.truckPostingIds ?? [],
        b.allOpen,
      ),
    };
  }

  @Get('config')
  config() {
    return this.admin.currentConfig();
  }

  @Roles('ADMIN')
  @Post('config/pricing')
  pricing(@CurrentActor() a: AuthActor, @Body() b: ConfigPatchDto) {
    return this.admin.newPricingVersion(a, b);
  }

  @Roles('ADMIN')
  @Post('config/matching')
  matchingConfig(@CurrentActor() a: AuthActor, @Body() b: ConfigPatchDto) {
    return this.admin.newMatchingVersion(a, b);
  }

  @Roles('ADMIN')
  @Post('config/exchange-rates')
  fx(@CurrentActor() a: AuthActor, @Body() b: FxDto) {
    return this.admin.addExchangeRate(a, b.base, b.quote, b.rate);
  }

  @Get('audit-logs')
  auditLogs(@Query() q: ListDto) {
    return this.admin.auditLogs(q);
  }
}

@Module({ imports: [IdentityModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
