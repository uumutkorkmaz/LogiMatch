import { createHash } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { from, lastValueFrom, map, type Observable, of } from 'rxjs';
import { ENV, type Env } from '../config/env';
import { type Db, InjectDb, Prisma } from '../infra/prisma';
import type { AuthActor } from './actor';
import { conflict, unprocessable } from './errors';
import { toJson } from './serialize';

type Req = Request & { actor?: AuthActor; id?: string };

/** Decimal → string, Date → ISO, gizli alanlar çıkarılır. */
@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((v: unknown) => (v === undefined ? v : toJson(v))));
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Idempotency-Key: aynı anahtarla gelen tekrar istek, ilk yanıtı döner (ARCHITECTURE §6).
 * Farklı gövde → 422, ilk istek sürüyorsa → 409.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Req>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const key = req.headers['idempotency-key'];
    if (!MUTATING.has(req.method) || typeof key !== 'string' || !key || !req.actor) {
      return next.handle();
    }
    if (key.length > 200)
      throw unprocessable('IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key çok uzun');
    return from(this.run(req, res, key, next));
  }

  private async run(req: Req, res: Response, key: string, next: CallHandler): Promise<unknown> {
    const userId = req.actor!.userId;
    const requestHash = createHash('sha256')
      .update(`${req.method} ${req.originalUrl} ${JSON.stringify(req.body ?? {})}`)
      .digest('hex');

    const existing = await this.db.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (existing && existing.expiresAt > new Date()) {
      if (existing.requestHash !== requestHash)
        throw unprocessable(
          'IDEMPOTENCY_KEY_REUSED',
          'Bu Idempotency-Key farklı bir istekte kullanılmış',
        );
      if (existing.state === 'IN_PROGRESS')
        throw conflict('IDEMPOTENCY_IN_PROGRESS', 'Aynı istek hâlâ işleniyor');
      res.status(existing.statusCode ?? 200);
      res.setHeader('Idempotent-Replayed', 'true');
      return existing.responseBody;
    }
    if (existing) await this.db.idempotencyRecord.delete({ where: { id: existing.id } });

    try {
      await this.db.idempotencyRecord.create({
        data: {
          key,
          userId,
          method: req.method,
          path: req.originalUrl,
          requestHash,
          expiresAt: new Date(Date.now() + this.env.IDEMPOTENCY_TTL_HOURS * 3600_000),
        },
      });
    } catch {
      throw conflict('IDEMPOTENCY_IN_PROGRESS', 'Aynı istek hâlâ işleniyor');
    }

    try {
      const result = await lastValueFrom(next.handle().pipe(map((v) => toJson(v))), {
        defaultValue: null,
      });
      await this.db.idempotencyRecord.update({
        where: { userId_key: { userId, key } },
        data: {
          state: 'COMPLETED',
          statusCode: res.statusCode,
          responseBody: (result ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
      return result;
    } catch (err) {
      // Hata durumunda istemci aynı anahtarla yeniden deneyebilsin.
      await this.db.idempotencyRecord
        .delete({ where: { userId_key: { userId, key } } })
        .catch(() => undefined);
      throw err;
    }
  }
}

/** Her başarılı mutasyon için AuditLog satırı (actor, aksiyon, varlık, ip, userAgent). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');
  constructor(@InjectDb() private readonly db: Db) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Req>();
    if (!MUTATING.has(req.method)) return next.handle();
    const controller = ctx.getClass().name.replace(/Controller$/, '');
    const handler = ctx.getHandler().name;
    return next.handle().pipe(
      map((result: unknown) => {
        const params = req.params as Record<string, string> | undefined;
        const resultId =
          result && typeof result === 'object' && 'id' in result
            ? String((result as { id: string }).id)
            : undefined;
        void this.db.auditLog
          .create({
            data: {
              actorUserId: req.actor?.userId ?? null,
              action: `${controller}.${handler}`,
              entityType: controller,
              entityId: params?.id ?? resultId ?? null,
              ip: req.ip ?? null,
              userAgent:
                typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
              requestId: typeof req.id === 'string' ? req.id : null,
            },
          })
          .catch((err: unknown) => this.logger.warn({ err }, 'audit write failed'));
        return result;
      }),
    );
  }
}

/** Servis içinden ayrıntılı (before/after) audit kaydı. */
export async function audit(
  db: Pick<Db, 'auditLog'> | { auditLog: Db['auditLog'] },
  actor: AuthActor | null,
  action: string,
  entityType: string,
  entityId: string | null,
  before?: unknown,
  after?: unknown,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: actor?.userId ?? null,
      action,
      entityType,
      entityId,
      before: before === undefined ? Prisma.JsonNull : (toJson(before) as Prisma.InputJsonValue),
      after: after === undefined ? Prisma.JsonNull : (toJson(after) as Prisma.InputJsonValue),
      ip: actor?.ip ?? null,
      userAgent: actor?.userAgent ?? null,
      requestId: actor?.requestId ?? null,
    },
  });
}

export { of };
