import { Global, Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { FilesController } from './files.controller';

@Global()
@Module({
  controllers: [FilesController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
