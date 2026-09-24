import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV, type Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: {
          expiresIn: env.JWT_ACCESS_TTL_SEC,
          issuer: 'logimatch',
          audience: 'logimatch-api',
        },
        verifyOptions: { issuer: 'logimatch', audience: 'logimatch-api' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, AuthGuard],
  exports: [AuthService, TokenService, AuthGuard, JwtModule],
})
export class AuthModule {}
