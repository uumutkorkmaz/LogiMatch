import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthActor } from './actor';

/**
 * Üç ayrı limit (ARCHITECTURE §6): auth 5/dk (yalnızca /auth), arama 60/dk (GET),
 * yazma 30/dk (mutasyonlar). Anahtar: kullanıcı varsa kullanıcı, yoksa IP.
 */
@Injectable()
export class RouteAwareThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as Request & { actor?: AuthActor };
    return Promise.resolve(r.actor?.userId ?? r.ip ?? 'unknown');
  }

  protected override async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const req = props.context.switchToHttp().getRequest<Request>();
    const path = req.path ?? '';
    const isAuth = path.includes('/auth/');
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    const name = props.throttler.name;
    if (path === '/health' || path === '/ready' || path === '/metrics') return true;
    if (name === 'auth' && !isAuth) return true;
    if (name === 'search' && (!isRead || isAuth)) return true;
    if (name === 'write' && (isRead || isAuth)) return true;
    return super.handleRequest(props);
  }
}
