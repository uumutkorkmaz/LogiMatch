import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@logimatch/shared';
import type { AuthActor } from './actor';

export const IS_PUBLIC = 'isPublic';
/** Kimlik doğrulaması gerektirmeyen uç. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Platform rolü kısıtı (ör. admin uçları). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

export const CurrentActor = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthActor =>
    ctx.switchToHttp().getRequest<{ actor: AuthActor }>().actor,
);
