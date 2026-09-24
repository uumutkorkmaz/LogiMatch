import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators';
import { forbidden, notFound } from '../common/errors';
import { type Db, InjectDb } from '../infra/prisma';
import { FILE_STORAGE, type IFileStorage } from '../integrations/ports';

/** İmzalı, süreli URL ile belge indirme. İmza doğrulanmadan dosya verilmez. */
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    @Inject(FILE_STORAGE) private readonly storage: IFileStorage,
    @InjectDb() private readonly db: Db,
  ) {}

  @Public()
  @Get()
  async download(
    @Query('key') key: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    if (!key || !this.storage.verifySignature(key, Number(exp), sig ?? '')) {
      throw forbidden('SIGNATURE_INVALID', 'Bağlantı geçersiz veya süresi dolmuş');
    }
    const doc = await this.db.document.findFirst({ where: { fileKey: key } });
    if (!doc) throw notFound('File');
    const data = await this.storage.get(key);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.fileName)}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(data);
  }
}
