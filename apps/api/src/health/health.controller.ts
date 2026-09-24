import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Redis } from 'ioredis';
import { Public } from '../common/decorators';
import { type Db, InjectDb } from '../infra/prisma';
import { InjectRedis } from '../infra/redis';

export interface HealthResponse {
  status: 'ok';
  uptimeSec: number;
}

export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  checks: Record<string, 'up' | 'down'>;
}

@ApiTags('ops')
@Controller()
export class HealthController {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /** Liveness: süreç ayakta mı. Bağımlılıkları kontrol etmez. */
  @Public()
  @Get('health')
  @ApiOkResponse({ description: 'Process is alive' })
  health(): HealthResponse {
    return { status: 'ok', uptimeSec: Math.round(process.uptime()) };
  }

  /** Readiness: DB ve Redis erişilebilir mi. Değilse 503. */
  @Public()
  @Get('ready')
  @ApiOkResponse({ description: 'Dependencies are reachable' })
  async ready(): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([
      this.db.$queryRaw`SELECT 1`.then(() => 'up' as const).catch(() => 'down' as const),
      this.redis
        .ping()
        .then(() => 'up' as const)
        .catch(() => 'down' as const),
    ]);
    const body: ReadinessResponse = {
      status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
      checks: { database, redis },
    };
    if (body.status !== 'ok') throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
