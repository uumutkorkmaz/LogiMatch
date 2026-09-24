import { randomUUID } from 'node:crypto';
import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AdminModule } from './admin/admin.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import {
  AuditInterceptor,
  IdempotencyInterceptor,
  SerializeInterceptor,
} from './common/interceptors';
import { ProblemFilter } from './common/problem.filter';
import { RouteAwareThrottlerGuard } from './common/throttle.guard';
import { ConfigModule } from './config/config.module';
import { ENV, type Env, loadEnv } from './config/env';
import { DealsModule } from './deals/deals.module';
import { DocumentsModule } from './documents/documents.module';
import { FleetModule } from './fleet/fleet.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { DbModule } from './infra/prisma';
import { RedisModule } from './infra/redis';
import { IntegrationsModule } from './integrations/integrations.module';
import { ListingsModule } from './listings/listings.module';
import { MatchingModule } from './matching/matching.module';
import { MessagingModule } from './messaging/messaging.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlatformModule } from './platform/platform-config.service';
import { PricingModule } from './pricing/pricing.module';
import { QueueModule } from './queue/queue.module';

/** Domain modülleri: hem API hem worker süreci yükler (iş işleyicileri modüllerde kayıtlı). */
export const DOMAIN_MODULES = [
  ConfigModule,
  DbModule,
  RedisModule,
  QueueModule,
  IntegrationsModule,
  PlatformModule,
  NotificationsModule,
  AuthModule,
  DocumentsModule,
  IdentityModule,
  FleetModule,
  PricingModule,
  MatchingModule,
  ListingsModule,
  DealsModule,
  MessagingModule,
  AdminModule,
];

function logger(): DynamicModule {
  const env = loadEnv();
  return LoggerModule.forRoot({
    pinoHttp: {
      level: env.LOG_LEVEL,
      // Gelen X-Request-Id korunur, yoksa üretilir; tüm log satırlarına `reqId` olarak düşer.
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.newPassword',
        '*.iban',
        '*.taxNumber',
      ],
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/metrics' },
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  });
}

@Module({
  imports: [
    logger(),
    ...DOMAIN_MODULES,
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [
          { name: 'auth', ttl: 60_000, limit: env.RATE_LIMIT_AUTH },
          { name: 'search', ttl: 60_000, limit: env.RATE_LIMIT_SEARCH },
          { name: 'write', ttl: 60_000, limit: env.RATE_LIMIT_WRITE },
        ],
        storage: new ThrottlerStorageRedisService(env.REDIS_URL),
      }),
    }),
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: ProblemFilter },
    // Sıra önemli: önce kimlik (tracker kullanıcıya göre), sonra rate limit.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RouteAwareThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: SerializeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}

/** Worker süreci: HTTP yok, yalnızca domain modülleri + kuyruk tüketicileri. */
@Module({ imports: [logger(), ...DOMAIN_MODULES] })
export class WorkerModule {}
