import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createLoadSchema,
  createTruckPostingSchema,
  loadQuerySchema,
  pinLocationSchema,
  reasonSchema,
  truckPostingQuerySchema,
  updateLoadSchema,
  updateTruckPostingSchema,
} from '@logimatch/shared';
import { createZodDto } from 'nestjs-zod';
import type { AuthActor } from '../common/actor';
import { CurrentActor } from '../common/decorators';
import { LoadsService } from './loads.service';
import { TruckPostingsService } from './truck-postings.service';

class CreateLoadDto extends createZodDto(createLoadSchema) {}
class UpdateLoadDto extends createZodDto(updateLoadSchema) {}
class LoadQueryDto extends createZodDto(loadQuerySchema) {}
class PinDto extends createZodDto(pinLocationSchema) {}
class ReasonDto extends createZodDto(reasonSchema) {}
class CreatePostingDto extends createZodDto(createTruckPostingSchema) {}
class UpdatePostingDto extends createZodDto(updateTruckPostingSchema) {}
class PostingQueryDto extends createZodDto(truckPostingQuerySchema) {}

@ApiTags('loads')
@ApiBearerAuth()
@Controller('loads')
export class LoadsController {
  constructor(private readonly loads: LoadsService) {}

  @Post()
  create(@CurrentActor() a: AuthActor, @Body() b: CreateLoadDto) {
    return this.loads.create(a, b);
  }

  @Get()
  list(@CurrentActor() a: AuthActor, @Query() q: LoadQueryDto) {
    return this.loads.list(a, q);
  }

  @Get('summary')
  summary(@CurrentActor() a: AuthActor) {
    return this.loads.summary(a);
  }

  @Get(':id')
  get(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.loads.get(a, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateLoadDto,
  ) {
    return this.loads.update(a, id, b);
  }

  @Post(':id/pin')
  @HttpCode(200)
  pin(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() b: PinDto) {
    return this.loads.pin(a, id, b.target, b.lat, b.lng);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.loads.publish(a, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: ReasonDto,
  ) {
    return this.loads.cancel(a, id, b.reason);
  }
}

@ApiTags('truck-postings')
@ApiBearerAuth()
@Controller('truck-postings')
export class TruckPostingsController {
  constructor(private readonly postings: TruckPostingsService) {}

  @Post()
  create(@CurrentActor() a: AuthActor, @Body() b: CreatePostingDto) {
    return this.postings.create(a, b);
  }

  @Get()
  list(@CurrentActor() a: AuthActor, @Query() q: PostingQueryDto) {
    return this.postings.list(a, q);
  }

  @Get(':id')
  get(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.postings.get(a, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdatePostingDto,
  ) {
    return this.postings.update(a, id, b);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.postings.publish(a, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: ReasonDto,
  ) {
    return this.postings.cancel(a, id, b.reason);
  }
}
