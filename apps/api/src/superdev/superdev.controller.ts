import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import {
  createUserSchema,
  createWorkspaceSchema,
  loginSchema,
  type CreateUserInput,
  type LoginInput,
} from '@task-tracker/shared';
import type { Env } from '../config/env';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from '../auth/auth.service';
import { ErrorLogService } from './error-log.service';
import { FeatureFlagsService } from './feature-flags.service';
import { SuperDevService } from './superdev.service';
import { SuperDevAuthService } from './superdev-auth.service';
import { SuperDevGuard } from './superdev.guard';
import { getClientIp } from './ip-allowlist';
import { SUPERDEV_COOKIE, SUPERDEV_COOKIE_PATH } from './superdev.constants';

const REFRESH_COOKIE = 'tt_refresh';

const userPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
  isActive: z.boolean().optional(),
  designation: z.string().max(120).nullable().optional(),
});

const flagPatchSchema = z.object({
  enabled: z.boolean(),
  description: z.string().max(255).optional(),
});

const archivePatchSchema = z.object({ isArchived: z.boolean() });
const resolvePatchSchema = z.object({ resolved: z.boolean() });
// Workspace creation with an optional explicit owner (defaults to first active admin).
const createWorkspaceWithOwnerSchema = createWorkspaceSchema.extend({
  ownerId: z.string().uuid().optional(),
});

/**
 * Hidden developer console. Every route is @Public() so the global user JwtAuthGuard
 * is bypassed; access is instead gated by SuperDevGuard (env-defined identity). When
 * the feature is not configured, the guard/auth service make these routes 404.
 */
@Public()
@Controller('super-dev')
export class SuperDevController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly sdAuth: SuperDevAuthService,
    private readonly sd: SuperDevService,
    private readonly errors: ErrorLogService,
    private readonly flags: FeatureFlagsService,
    private readonly auth: AuthService,
  ) {}

  private cookieOptions(): CookieOptions {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      path: SUPERDEV_COOKIE_PATH,
      maxAge: 8 * 60 * 60 * 1000,
    };
  }

  private refreshCookieOptions(): CookieOptions {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      path: '/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  // ---- Session ----------------------------------------------------------

  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): { email: string } {
    const { token, email } = this.sdAuth.login(body.email, body.password, getClientIp(req));
    res.cookie(SUPERDEV_COOKIE, token, this.cookieOptions());
    return { email };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    this.sdAuth.assertEnabled();
    res.clearCookie(SUPERDEV_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }

  @UseGuards(SuperDevGuard)
  @Get('me')
  me(@Req() req: Request & { superdev?: { email: string } }): { email: string } {
    return { email: req.superdev?.email ?? '' };
  }

  // ---- Overview / activity / errors -------------------------------------

  @UseGuards(SuperDevGuard)
  @Get('overview')
  overview() {
    return this.sd.overview();
  }

  @UseGuards(SuperDevGuard)
  @Get('activity')
  activity(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    return this.sd.activity({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      action,
      userId,
      workspaceId,
    });
  }

  @UseGuards(SuperDevGuard)
  @Get('errors')
  listErrors(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('resolved') resolved?: string,
  ) {
    return this.errors.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      resolved: resolved === undefined ? undefined : resolved === 'true',
    });
  }

  @UseGuards(SuperDevGuard)
  @Patch('errors/:id')
  async resolveError(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolvePatchSchema)) body: { resolved: boolean },
  ) {
    await this.errors.setResolved(id, body.resolved);
    return { ok: true };
  }

  // ---- God-mode: users --------------------------------------------------

  @UseGuards(SuperDevGuard)
  @Get('users')
  listUsers() {
    return this.sd.listUsers();
  }

  @UseGuards(SuperDevGuard)
  @Post('users')
  @HttpCode(201)
  createUser(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput) {
    return this.sd.createUser(body);
  }

  @UseGuards(SuperDevGuard)
  @Patch('users/:id')
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userPatchSchema)) body: z.infer<typeof userPatchSchema>,
  ) {
    await this.sd.updateUser(id, body);
    return { ok: true };
  }

  @UseGuards(SuperDevGuard)
  @Post('users/:id/reset-password')
  @HttpCode(200)
  resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.sd.resetPassword(id);
  }

  @UseGuards(SuperDevGuard)
  @Post('users/:id/force-logout')
  @HttpCode(200)
  async forceLogout(@Param('id', ParseUUIDPipe) id: string) {
    await this.sd.forceLogout(id);
    return { ok: true };
  }

  // ---- God-mode: workspaces --------------------------------------------

  @UseGuards(SuperDevGuard)
  @Get('workspaces')
  listWorkspaces() {
    return this.sd.listWorkspaces();
  }

  @UseGuards(SuperDevGuard)
  @Post('workspaces')
  @HttpCode(201)
  createWorkspace(
    @Body(new ZodValidationPipe(createWorkspaceWithOwnerSchema)) body: z.infer<typeof createWorkspaceWithOwnerSchema>,
  ) {
    const { ownerId, ...input } = body;
    return this.sd.createWorkspace(input, ownerId);
  }

  @UseGuards(SuperDevGuard)
  @Patch('workspaces/:id')
  async archiveWorkspace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(archivePatchSchema)) body: { isArchived: boolean },
  ) {
    await this.sd.setWorkspaceArchived(id, body.isArchived);
    return { ok: true };
  }

  @UseGuards(SuperDevGuard)
  @Delete('workspaces/:id')
  async deleteWorkspace(@Param('id', ParseUUIDPipe) id: string) {
    await this.sd.deleteWorkspace(id);
    return { ok: true };
  }

  // ---- Kill-switches ----------------------------------------------------

  @UseGuards(SuperDevGuard)
  @Get('flags')
  listFlags() {
    return this.flags.list();
  }

  @UseGuards(SuperDevGuard)
  @Patch('flags/:key')
  setFlag(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(flagPatchSchema)) body: z.infer<typeof flagPatchSchema>,
  ) {
    return this.flags.set(key, body.enabled, body.description);
  }

  // ---- Impersonation ----------------------------------------------------

  @UseGuards(SuperDevGuard)
  @Post('impersonate/:userId')
  @HttpCode(200)
  async impersonate(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'] ?? null;
    const ipAddress = req.ip ?? null;
    const { tokens, refreshToken } = await this.auth.issueSessionForUser(userId, userAgent, ipAddress);
    // Set the normal refresh cookie so the impersonated session behaves like a login.
    res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions());
    return tokens;
  }
}
