import { type INestApplication, RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@logimatch/shared';
import { patchNestJsSwagger } from 'nestjs-zod';

/** main.ts ve e2e testleri aynı HTTP yapılandırmasını kullansın diye ortak. */
export function configureApp(app: INestApplication, opts: { swagger: boolean }): void {
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();

  if (opts.swagger) {
    patchNestJsSwagger();
    const config = new DocumentBuilder()
      .setTitle('LogiMatch API')
      .setDescription(
        'Dijital yük brokerliği platformu — REST API. Hatalar RFC 7807 problem+json; ' +
          'mutasyonlarda Idempotency-Key desteklenir; X-Company-Id ile aktif firma seçilir.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addGlobalParameters(
        { name: 'X-Company-Id', in: 'header', required: false, schema: { type: 'string' } },
        { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
      )
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
      jsonDocumentUrl: 'api/docs/openapi.json',
    });
  }
}
