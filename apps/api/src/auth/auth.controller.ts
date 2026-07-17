import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import {
  changePasswordSchema,
  loginSchema,
  type ChangePasswordInput,
  type LoginInput,
  type LoginResponse,
} from '@task-tracker/shared';
import type { Env } from '../config/env';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';

const REFRESH_COOKIE = 'tt_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private refreshCookieOptions(): CookieOptions {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000, // mirror JWT_REFRESH_TTL default (7d)
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const userAgent = req.headers['user-agent'] ?? null;
    const ipAddress = req.ip ?? null;
    const { tokens, refreshToken } = await this.auth.login(body.email, body.password, userAgent, ipAddress);
    res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions());
    return tokens;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ?? '';
    const userAgent = req.headers['user-agent'] ?? null;
    const ipAddress = req.ip ?? null;
    const { tokens, refreshToken } = await this.auth.refresh(token, userAgent, ipAddress);
    res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions());
    return tokens;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @CurrentUser('sessionId') sessionId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ?? '';
    await this.auth.logout(sessionId, token);
    res.clearCookie(REFRESH_COOKIE, { ...this.refreshCookieOptions(), maxAge: undefined });
  }

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.auth.me(userId);
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { tokens, refreshToken } = await this.auth.changePassword(
      userId,
      body.currentPassword,
      body.newPassword,
    );
    res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions());
    return tokens;
  }
}
