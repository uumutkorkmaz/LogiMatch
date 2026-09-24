import { createHash, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { AuthTokens, RegisterInput } from '@logimatch/shared';
import { ENV, type Env } from '../config/env';
import { badRequest, conflict, forbidden, unauthorized, unprocessable } from '../common/errors';
import { type Db, InjectDb } from '../infra/prisma';
import { MailService } from '../integrations/mail.service';
import { type ISmsProvider, SMS } from '../integrations/ports';
import { TokenService } from './token.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

type OtpPurpose = 'VERIFY_EMAIL' | 'VERIFY_PHONE' | 'RESET_PASSWORD';

export const hashPassword = (password: string) =>
  hash(password, { memoryCost: 19456, timeCost: 2 });

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    @Inject(SMS) private readonly sms: ISmsProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(input: RegisterInput, meta: { ip?: string; userAgent?: string }) {
    const existing = await this.db.user.findFirst({
      where: {
        OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])],
        deletedAt: undefined,
      },
    });
    if (existing)
      throw conflict('USER_EXISTS', 'Bu e-posta veya telefon ile kayıtlı bir hesap var');
    const user = await this.db.user.create({
      data: {
        email: input.email,
        phone: input.phone ?? null,
        fullName: input.fullName,
        role: input.role,
        locale: input.locale,
        passwordHash: await hashPassword(input.password),
        // Hesap hemen aktif; ilan yayınlamanın asıl kapısı firma doğrulaması (ASSUMPTIONS).
        status: 'ACTIVE',
      },
    });
    const devCode = await this.sendOtp(user.id, 'VERIFY_EMAIL');
    const tokens = await this.tokens.issue(user, meta);
    return { user: { id: user.id, email: user.email, role: user.role }, tokens, ...devCode };
  }

  async login(
    email: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    const user = await this.db.user.findUnique({ where: { email } });
    const invalid = unauthorized('INVALID_CREDENTIALS', 'E-posta veya şifre hatalı');
    if (!user || user.anonymizedAt) {
      // Zamanlama saldırısına karşı yine de hash doğrula.
      await verify(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$0000000000000000000000000000000000000000000',
        password,
      ).catch(() => false);
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw forbidden(
        'ACCOUNT_LOCKED',
        `Çok fazla hatalı deneme; ${LOCK_MINUTES} dk sonra tekrar deneyin`,
      );
    }
    if (!(await verify(user.passwordHash, password))) {
      const failed = user.failedLoginCount + 1;
      await this.db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          lockedUntil:
            failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      throw invalid;
    }
    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw forbidden('USER_SUSPENDED', 'Hesabınız askıya alınmış');
    }
    await this.db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    return this.tokens.issue(user, meta);
  }

  refresh(refreshToken: string, meta: { ip?: string; userAgent?: string }) {
    return this.tokens.rotate(refreshToken, meta);
  }

  logout(refreshToken?: string) {
    return refreshToken ? this.tokens.revoke(refreshToken) : Promise.resolve();
  }

  /** Kodu üretir, gönderir; EXPOSE_DEV_CODES açıksa yanıtta döner (yalnızca dev). */
  async sendOtp(userId: string, purpose: OtpPurpose): Promise<{ devCode?: string }> {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (purpose === 'VERIFY_PHONE' && !user.phone)
      throw badRequest('PHONE_MISSING', 'Önce telefon ekleyin');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.otpChallenge.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await this.db.otpChallenge.create({
      data: {
        userId,
        purpose,
        codeHash: this.otpHash(userId, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    const text = `LogiMatch doğrulama kodunuz: ${code} (10 dk geçerli)`;
    if (purpose === 'VERIFY_PHONE') await this.sms.send(user.phone!, text);
    else await this.mail.send(user.email, 'LogiMatch doğrulama kodu', text).catch(() => undefined);
    return this.env.EXPOSE_DEV_CODES ? { devCode: code } : {};
  }

  async verifyOtp(userId: string, purpose: OtpPurpose, code: string): Promise<void> {
    const otp = await this.db.otpChallenge.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date())
      throw unprocessable('OTP_EXPIRED', 'Kodun süresi doldu');
    if (otp.attempts >= OTP_MAX_ATTEMPTS)
      throw unprocessable('OTP_LOCKED', 'Çok fazla hatalı deneme');
    if (otp.codeHash !== this.otpHash(userId, code)) {
      await this.db.otpChallenge.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw unprocessable('OTP_INVALID', 'Kod hatalı');
    }
    await this.db.otpChallenge.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    if (purpose === 'VERIFY_EMAIL')
      await this.db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    if (purpose === 'VERIFY_PHONE')
      await this.db.user.update({ where: { id: userId }, data: { phoneVerifiedAt: new Date() } });
  }

  async forgotPassword(email: string): Promise<{ devCode?: string }> {
    const user = await this.db.user.findUnique({ where: { email } });
    // Hesap var mı yok mu sızdırma: her durumda aynı yanıt.
    if (!user || user.anonymizedAt) return {};
    return this.sendOtp(user.id, 'RESET_PASSWORD');
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user) throw unprocessable('OTP_INVALID', 'Kod hatalı');
    await this.verifyOtp(user.id, 'RESET_PASSWORD', code);
    await this.db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await this.tokens.revokeAllForUser(user.id);
  }

  private otpHash(userId: string, code: string): string {
    return createHash('sha256').update(`${userId}:${code}`).digest('hex');
  }
}
