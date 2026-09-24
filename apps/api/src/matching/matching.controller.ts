import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { dismissSchema, interestSchema, manualMatchSchema } from '@logimatch/shared';
import { createZodDto } from 'nestjs-zod';
import type { AuthActor } from '../common/actor';
import { CurrentActor } from '../common/decorators';
import { MatchingService } from './matching.service';

class InterestDto extends createZodDto(interestSchema) {}
class DismissDto extends createZodDto(dismissSchema) {}
class ManualMatchDto extends createZodDto(manualMatchSchema) {}

@ApiTags('matches')
@ApiBearerAuth()
@Controller()
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Get('loads/:id/matches')
  forLoad(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.matching.listForLoad(a, id);
  }

  @Get('truck-postings/:id/matches')
  forPosting(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.matching.listForPosting(a, id);
  }

  @Get('matches')
  mine(@CurrentActor() a: AuthActor, @Query('status') status?: string) {
    return this.matching.listMine(a, status);
  }

  @Post('matches')
  manual(@CurrentActor() a: AuthActor, @Body() b: ManualMatchDto) {
    return this.matching.manual(a, b.loadId, b.truckPostingId);
  }

  @Get('matches/:id')
  get(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.matching.get(a, id);
  }

  @Post('matches/:id/interest')
  @HttpCode(200)
  interest(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: InterestDto,
  ) {
    return this.matching.interest(a, id, b.interested);
  }

  @Post('matches/:id/dismiss')
  @HttpCode(200)
  dismiss(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: DismissDto,
  ) {
    return this.matching.dismiss(a, id, b.reason);
  }
}
