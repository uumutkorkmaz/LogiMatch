import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  createDriverSchema,
  createTrailerSchema,
  createVehicleSchema,
  documentMetaSchema,
  updateDriverSchema,
  updateTrailerSchema,
  updateVehicleSchema,
} from '@logimatch/shared';
import type { Request } from 'express';
import { createZodDto } from 'nestjs-zod';
import type { AuthActor } from '../common/actor';
import { CurrentActor } from '../common/decorators';
import { DocumentsService, type UploadedFile as File } from '../documents/documents.service';
import { UPLOAD_LIMIT } from '../identity/identity.controller';
import { FleetService } from './fleet.service';

class CreateVehicleDto extends createZodDto(createVehicleSchema) {}
class UpdateVehicleDto extends createZodDto(updateVehicleSchema) {}
class CreateTrailerDto extends createZodDto(createTrailerSchema) {}
class UpdateTrailerDto extends createZodDto(updateTrailerSchema) {}
class CreateDriverDto extends createZodDto(createDriverSchema) {}
class UpdateDriverDto extends createZodDto(updateDriverSchema) {}
class DocumentMetaDto extends createZodDto(documentMetaSchema) {}

@ApiTags('fleet')
@ApiBearerAuth()
@Controller()
export class FleetController {
  constructor(
    private readonly fleet: FleetService,
    private readonly documents: DocumentsService,
  ) {}

  @Get('fleet/expiring-documents')
  expiring(@CurrentActor() a: AuthActor) {
    return this.fleet.expiringDocuments(a);
  }

  // Araç
  @Get('vehicles')
  listVehicles(@CurrentActor() a: AuthActor) {
    return this.fleet.listVehicles(a);
  }
  @Post('vehicles')
  createVehicle(@CurrentActor() a: AuthActor, @Body() b: CreateVehicleDto) {
    return this.fleet.createVehicle(a, b);
  }
  @Get('vehicles/:id')
  getVehicle(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.fleet.getVehicle(a, id);
  }
  @Patch('vehicles/:id')
  updateVehicle(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateVehicleDto,
  ) {
    return this.fleet.updateVehicle(a, id, b);
  }
  @Delete('vehicles/:id')
  @HttpCode(204)
  async deleteVehicle(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    await this.fleet.remove(a, 'vehicle', id);
  }

  // Dorse
  @Get('trailers')
  listTrailers(@CurrentActor() a: AuthActor) {
    return this.fleet.listTrailers(a);
  }
  @Post('trailers')
  createTrailer(@CurrentActor() a: AuthActor, @Body() b: CreateTrailerDto) {
    return this.fleet.createTrailer(a, b);
  }
  @Get('trailers/:id')
  getTrailer(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.fleet.getTrailer(a, id);
  }
  @Patch('trailers/:id')
  updateTrailer(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateTrailerDto,
  ) {
    return this.fleet.updateTrailer(a, id, b);
  }
  @Delete('trailers/:id')
  @HttpCode(204)
  async deleteTrailer(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    await this.fleet.remove(a, 'trailer', id);
  }

  // Şoför
  @Get('drivers')
  listDrivers(@CurrentActor() a: AuthActor) {
    return this.fleet.listDrivers(a);
  }
  @Post('drivers')
  createDriver(@CurrentActor() a: AuthActor, @Body() b: CreateDriverDto) {
    return this.fleet.createDriver(a, b);
  }
  @Get('drivers/:id')
  getDriver(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.fleet.getDriver(a, id);
  }
  @Patch('drivers/:id')
  updateDriver(
    @CurrentActor() a: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateDriverDto,
  ) {
    return this.fleet.updateDriver(a, id, b);
  }
  @Delete('drivers/:id')
  @HttpCode(204)
  async deleteDriver(@CurrentActor() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    await this.fleet.remove(a, 'driver', id);
  }

  // Belgeler: POST /{vehicles|trailers|drivers}/:id/documents
  @Post(['vehicles/:id/documents', 'trailers/:id/documents', 'drivers/:id/documents'])
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMIT))
  upload(
    @CurrentActor() a: AuthActor,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: DocumentMetaDto,
    @UploadedFile() file: File,
  ) {
    return this.documents.upload(a, ownerTypeOf(req.path), id, b, file);
  }

  @Get(['vehicles/:id/documents', 'trailers/:id/documents', 'drivers/:id/documents'])
  listDocs(
    @CurrentActor() a: AuthActor,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documents.list(a, ownerTypeOf(req.path), id);
  }
}

function ownerTypeOf(path: string): 'VEHICLE' | 'TRAILER' | 'DRIVER' {
  if (path.includes('/vehicles/')) return 'VEHICLE';
  if (path.includes('/trailers/')) return 'TRAILER';
  return 'DRIVER';
}
