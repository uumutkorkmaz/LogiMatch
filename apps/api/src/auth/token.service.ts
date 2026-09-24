import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthTokens, UserRole } from '@logimatch/shared';
import { ENV, type Env } from '../config/env';
import { unauthorized } from '../common/errors';
import { type Db, InjectDb } from '../infra/prisma';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Access: kısa ömürlü JWT. Refresh: opak `<id>.<secret>`, DB'de yalnızca sha256(secret).
 * Rotasyon: her refresh eskisini iptal eder; iptal edilmiş token tekrar gelirse (çalınmış olabilir)
 * tüm aile iptal edilir (ARCHITECTURE §6).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issue(
    user: { id: string; role: UserRole },
    meta: { ip?: string; userAgent?: string; familyId?: string } = {},
  ): Promise<AuthTokens> {
    const accessExp = new Date(Date.now() + this.env.JWT_ACCESS_TTL_SEC * 1000);
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    const { token, expiresAt } = await this.createRefresh(
      user.id,
      meta.familyId ?? randomUUID(),
      meta,
    );
    return {
      accessToken,
      refreshToken: token,
      accessTokenExpiresAt: accessExp.toISOString(),
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }

  private async createRefresh(
    userId: string,
    familyId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ id: string; token: string; expiresAt: Date }> {
    const secret = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.JWT_REFRESH_TTL_DAYS * 86_400_000);
    const row = await this.db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(secret),
        expiresAt,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    return { id: row.id, token: `${row.id}.${secret}`, expiresAt };
  }

  async rotate(
    refreshToken: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    const row = await this.find(refreshToken);
    if (row.revokedAt) {
      // Yeniden kullanım: aile ele geçirilmiş olabilir.
      await this.revokeFamily(row.familyId);
      throw unauthorized('REFRESH_TOKEN_REUSED', 'Oturum güvenlik nedeniyle sonlandırıldı');
    }
    if (row.expiresAt < new Date())
      throw unauthorized('REFRESH_TOKEN_EXPIRED', 'Oturum süresi doldu');
    const user = await this.db.user.findUnique({ where: { id: row.userId } });
    if (!user || user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw unauthorized('USER_INACTIVE', 'Kullanıcı aktif değil');
    }
    const tokens = await this.issue(user, { ...meta, familyId: row.familyId });
    const newId = tokens.refreshToken.split('.')[0]!;
    const updated = await this.db.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: newId },
    });
    if (updated.count === 0) {
      // Aynı token'la eşzamanlı ikinci refresh.
      await this.revokeFamily(row.familyId);
      throw unauthorized('REFRESH_TOKEN_REUSED', 'Oturum güvenlik nedeniyle sonlandırıldı');
    }
    return tokens;
  }

  async revoke(refreshToken: string): Promise<void> {
    const row = await this.find(refreshToken).catch(() => null);
    if (row) await this.revokeFamily(row.familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async find(refreshToken: string) {
    const [id, secret] = refreshToken.split('.');
    if (!id || !secret || !/^[0-9a-f-]{36}$/.test(id)) {
      throw unauthorized('REFRESH_TOKEN_INVALID', 'Geçersiz oturum');
    }
    const row = await this.db.refreshToken.findUnique({ where: { id } });
    if (!row) throw unauthorized('REFRESH_TOKEN_INVALID', 'Geçersiz oturum');
    const a = Buffer.from(row.tokenHash);
    const b = Buffer.from(sha256(secret));
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw unauthorized('REFRESH_TOKEN_INVALID', 'Geçersiz oturum');
    }
    return row;
  }
}
