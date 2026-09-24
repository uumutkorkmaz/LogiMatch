import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env';

export const REDIS = Symbol('REDIS');
export const InjectRedis = () => Inject(REDIS);

@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@InjectRedis() private readonly redis: Redis) {}
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) =>
        new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
