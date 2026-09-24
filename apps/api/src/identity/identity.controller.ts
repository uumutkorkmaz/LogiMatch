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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  addMemberSchema,
  blockCompanySchema,
  createCompanySchema,
  documentMetaSchema,
  updateCompanySchema,
  updateMeSchema,
} from '@logimatch/shared';
import { createZodDto } from 'nestjs-zod';
import type { AuthActor } from '../common/actor';
import { CurrentActor } from '../common/decorators';
import { DocumentsService, type UploadedFile as File } from '../documents/documents.service';
import { RatingsService } from '../ratings/ratings.service';
import { CompaniesService } from './companies.service';
import { MeService } from './me.service';

class UpdateMeDto extends createZodDto(updateMeSchema) {}
class CreateCompanyDto extends createZodDto(createCompanySchema) {}
class UpdateCompanyDto extends createZodDto(updateCompanySchema) {}
class AddMemberDto extends createZodDto(addMemberSchema) {}
class DocumentMetaDto extends createZodDto(documentMetaSchema) {}
class BlockDto extends createZodDto(blockCompanySchema) {}

export const UPLOAD_LIMIT = { limits: { fileSize: 10 * 1024 * 1024 } };

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentActor() actor: AuthActor) {
    return this.me.get(actor);
  }

  @Patch()
  update(@CurrentActor() actor: AuthActor, @Body() body: UpdateMeDto) {
    return this.me.update(actor, body);
  }

  /** KVKK veri ihracı */
  @Get('export')
  export(@CurrentActor() actor: AuthActor) {
    return this.me.export(actor);
  }

  /** KVKK anonimleştirme talebi */
  @Post('anonymize')
  @HttpCode(204)
  async anonymize(@CurrentActor() actor: AuthActor) {
    await this.me.anonymize(actor);
  }
}

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly documents: DocumentsService,
    private readonly ratings: RatingsService,
  ) {}

  @Post()
  create(@CurrentActor() actor: AuthActor, @Body() body: CreateCompanyDto) {
    return this.companies.create(actor, body);
  }

  @Get('blocked')
  blocked(@CurrentActor() actor: AuthActor) {
    return this.companies.blockList(actor);
  }

  @Get(':id')
  get(@CurrentActor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.companies.get(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCompanyDto,
  ) {
    return this.companies.update(actor, id, body);
  }

  @Get(':id/members')
  members(@CurrentActor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.companies.members(actor, id);
  }

  @Post(':id/members')
  addMember(
    @CurrentActor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddMemberDto,
  ) {
    return this.companies.addMember(actor, id, body);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  async removeMember(
    @CurrentActor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.companies.removeMember(actor, id, userId);
  }

  @Post(':id/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMIT))
  upload(
    @CurrentActor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DocumentMetaDto,
    @UploadedFile() file: File,
  ) {
    return this.documents.upload(actor, 'COMPANY', id, body, file);
  }

  @Get(':id/documents')
  listDocuments(@CurrentActor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.list(actor, 'COMPANY', id);
  }

  @Post(':id/verify-tax')
  @HttpCode(200)
  verifyTax(@CurrentActor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.companies.verifyTax(actor, id);
  }

  @Post(':id/block')
  block(
    @CurrentActor() actor: AuthActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BlockDto,
  ) {
    return this.companies.block(actor, id, body.reason);
  }

  @Delete(':id/block')
  @HttpCode(204)
  async unblock(@CurrentActor() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    await this.companies.unblock(actor, id);
  }

  @Get(':id/ratings')
  ratingsOf(@Param('id', ParseUUIDPipe) id: string) {
    return this.ratings.forCompany(id);
  }
}
