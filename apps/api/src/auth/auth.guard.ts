import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@logimatch/shared';
import type { Request } from 'express';
import { type AuthActor, STAFF_ROLES } from '../common/actor';
import { IS_PUBLIC, ROLES } from '../common/decorators';
import { forbidden, unauthorized } from '../common/errors';
import { type Db, InjectDb } from '../infra/prisma';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

type ActorRequest = Request & { actor?: AuthActor; id?: string };

/** Global guard: JWT doğrular, kullanıcıyı ve firma üyeliklerini yükler, rol kısıtını uygular. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectDb() private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const req = ctx.switchToHttp().getRequest<ActorRequest>();

    const token = this.extractToken(req);
    if (!token) {
      if (isPublic) return true;
      throw unauthorized('TOKEN_MISSING', 'Erişim tokenı gerekli');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      if (isPublic) return true;
      throw unauthorized('TOKEN_INVALID', 'Token geçersiz veya süresi dolmuş');
    }

    req.actor = await this.loadActor(payload.sub, req);

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes(req.actor.role)) {
      throw forbidden('ROLE_REQUIRED', 'Bu uç için yetkiniz yok');
    }
    return true;
  }

  private extractToken(req: Request): string | null {
    const h = req.headers.authorization;
    if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7).trim() || null;
    return null;
  }

  async loadActor(userId: string, req?: ActorRequest): Promise<AuthActor> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            company: {
              select: { type: true, status: true, verificationStatus: true, deletedAt: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) throw unauthorized('USER_NOT_FOUND', 'Kullanıcı bulunamadı');
    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw forbidden('USER_SUSPENDED', 'Hesabınız askıya alınmış');
    }
    const memberships = user.memberships
      .filter((m) => !m.company.deletedAt)
      .map((m) => ({
        companyId: m.companyId,
        companyRole: m.companyRole,
        companyType: m.company.type,
        companyStatus: m.company.status,
        verificationStatus: m.company.verificationStatus,
      }));
    const requested = req?.headers['x-company-id'];
    const active =
      typeof requested === 'string' && memberships.some((m) => m.companyId === requested)
        ? requested
        : (memberships[0]?.companyId ?? null);
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      memberships,
      activeCompanyId: active,
      isStaff: STAFF_ROLES.includes(user.role),
      ip: req?.ip,
      userAgent:
        typeof req?.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      requestId: typeof req?.id === 'string' ? req.id : undefined,
    };
  }
}
