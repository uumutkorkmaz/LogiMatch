import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  cancelShipmentSchema,
  createOfferSchema,
  disputeSchema,
  documentMetaSchema,
  offerQuerySchema,
  ratingSchema,
  shipmentEventSchema,
  shipmentQuerySchema,
  shipmentStatusUpdateSchema,
} from '@logimatch/shared';
import { createZodDto } from 'nestjs-zod';
import type { AuthActor } from '../common/actor';
import { CurrentActor } from '../common/decorators';
import type { UploadedFile as File } from '../documents/documents.service';
import { UPLOAD_LIMIT } from '../identity/identity.controller';
import { RatingsService } from '../ratings/ratings.service';
import { OffersService } from './offers.service';
import { ShipmentsService } from './shipments.service';

class CreateOfferDto extends createZodDto(createOfferSchema) {}
class OfferQueryDto extends createZodDto(offerQuerySchema) {}
class StatusDto extends createZodDto(shipmentStatusUpdateSchema) {}
class EventDto extends createZodDto(shipmentEventSchema) {}
class CancelDto extends createZodDto(cancelShipmentSchema) {}
class DisputeDto extends createZodDto(disputeSchema) {}
class ShipmentQueryDto extends createZodDto(shipmentQuerySchema) {}
class RatingDto extends createZodDto(ratingSchema) {}
class DocumentMetaDto extends createZodDto(documentMetaSchema) {}

@ApiTags('offers')
@ApiBearerAuth()
@Controller()
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Post('matches/:id/offers')
  create(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: CreateOfferDto,
  ) {
    return this.offers.create(a, id, b);
  }

  @Get('offers')
  list(@CurrentActor() a: AuthActor, @Query() q: OfferQueryDto) {
    return this.offers.list(a, q);
  }

  @Get('offers/:id')
  get(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.get(a, id);
  }

  @Post('offers/:id/accept')
  @HttpCode(201)
  accept(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.accept(a, id);
  }

  @Post('offers/:id/reject')
  @HttpCode(200)
  reject(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.reject(a, id);
  }

  @Post('offers/:id/counter')
  counter(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: CreateOfferDto,
  ) {
    return this.offers.counter(a, id, b);
  }

  @Post('offers/:id/withdraw')
  @HttpCode(200)
  withdraw(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.withdraw(a, id);
  }
}

@ApiTags('shipments')
@ApiBearerAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(
    private readonly shipments: ShipmentsService,
    private readonly ratings: RatingsService,
  ) {}

  @Get()
  list(@CurrentActor() a: AuthActor, @Query() q: ShipmentQueryDto) {
    return this.shipments.list(a, q);
  }

  @Get('summary')
  summary(@CurrentActor() a: AuthActor) {
    return this.shipments.summary(a);
  }

  @Get(':id')
  get(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.get(a, id);
  }

  @Post(':id/status')
  @HttpCode(200)
  status(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: StatusDto,
  ) {
    return this.shipments.updateStatus(a, id, b);
  }

  @Get(':id/events')
  events(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.events(a, id);
  }

  @Post(':id/events')
  addEvent(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: EventDto,
  ) {
    return this.shipments.addEvent(a, id, b);
  }

  @Post(':id/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMIT))
  upload(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: DocumentMetaDto,
    @UploadedFile() file: File,
  ) {
    return this.shipments.uploadDocument(a, id, b, file);
  }

  @Get(':id/documents')
  documents(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.listDocuments(a, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: CancelDto,
  ) {
    return this.shipments.cancel(a, id, b);
  }

  @Post(':id/dispute')
  @HttpCode(200)
  dispute(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: DisputeDto,
  ) {
    return this.shipments.dispute(a, id, b.reason);
  }

  @Post(':id/ratings')
  rate(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() b: RatingDto) {
    return this.ratings.rate(a, id, b);
  }

  @Get(':id/ratings')
  ratingsOf(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.ratings.forShipment(a, id);
  }
}
