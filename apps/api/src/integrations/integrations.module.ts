import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { MailService } from './mail.service';
import {
  LocalFileStorage,
  MockGeocodingProvider,
  MockPaymentProvider,
  MockRoutingProvider,
  MockSmsProvider,
  MockTaxIdVerifier,
  OsrmRoutingProvider,
} from './mocks';
import { FILE_STORAGE, GEOCODING, PAYMENT, ROUTING, SMS, TAX_ID } from './ports';

@Global()
@Module({
  providers: [
    { provide: GEOCODING, useClass: MockGeocodingProvider },
    {
      provide: ROUTING,
      useFactory: () =>
        process.env.ROUTING_PROVIDER === 'osrm' && process.env.OSRM_BASE_URL
          ? new OsrmRoutingProvider(process.env.OSRM_BASE_URL)
          : new MockRoutingProvider(),
    },
    { provide: SMS, useClass: MockSmsProvider },
    { provide: PAYMENT, useClass: MockPaymentProvider },
    { provide: TAX_ID, useClass: MockTaxIdVerifier },
    {
      provide: FILE_STORAGE,
      inject: [ENV],
      useFactory: (env: Env) =>
        new LocalFileStorage(env.STORAGE_LOCAL_DIR, env.API_PUBLIC_URL, env.STORAGE_SIGNING_SECRET),
    },
    MailService,
  ],
  exports: [GEOCODING, ROUTING, SMS, PAYMENT, TAX_ID, FILE_STORAGE, MailService],
})
export class IntegrationsModule {}
