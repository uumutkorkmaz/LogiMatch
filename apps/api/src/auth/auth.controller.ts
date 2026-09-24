import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyCodeSchema,
} from '@logimatch/shared';
import type { Request } from 'express';
import { createZodDto } from 'nestjs-zod';
import type { AuthActor } from '../common/actor';
import { CurrentActor, Public } from '../common/decorators';
import { AuthService } from './auth.service';

class RegisterDto extends createZodDto(registerSchema) {}
class LoginDto extends createZodDto(loginSchema) {}
class RefreshDto extends createZodDto(refreshSchema) {}
class LogoutDto extends createZodDto(logoutSchema) {}
class VerifyCodeDto extends createZodDto(verifyCodeSchema) {}
class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}

const meta = (req: Request) => ({
  ip: req.ip,
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: RegisterDto, @Req() req: Request) {
    return this.auth.register(body, meta(req));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto, @Req() req: Request) {
    return this.auth.login(body.email, body.password, meta(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(body.refreshToken, meta(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: LogoutDto) {
    await this.auth.logout(body.refreshToken);
  }

  @ApiBearerAuth()
  @Post('verify-email/request')
  @HttpCode(202)
  requestEmailCode(@CurrentActor() actor: AuthActor) {
    return this.auth.sendOtp(actor.userId, 'VERIFY_EMAIL');
  }

  @ApiBearerAuth()
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@CurrentActor() actor: AuthActor, @Body() body: VerifyCodeDto) {
    await this.auth.verifyOtp(actor.userId, 'VERIFY_EMAIL', body.code);
  }

  @ApiBearerAuth()
  @Post('verify-phone/request')
  @HttpCode(202)
  requestPhoneCode(@CurrentActor() actor: AuthActor) {
    return this.auth.sendOtp(actor.userId, 'VERIFY_PHONE');
  }

  @ApiBearerAuth()
  @Post('verify-phone')
  @HttpCode(204)
  async verifyPhone(@CurrentActor() actor: AuthActor, @Body() body: VerifyCodeDto) {
    await this.auth.verifyOtp(actor.userId, 'VERIFY_PHONE', body.code);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  forgot(@Body() body: ForgotPasswordDto) {
    return this.auth.forgotPassword(body.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  async reset(@Body() body: ResetPasswordDto) {
    await this.auth.resetPassword(body.email, body.code, body.newPassword);
  }
}
