import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import type { AuthUser, JwtPayload, LoginResponse } from '@task-tracker/shared';
import type { Env } from '../config/env';
import { DRIZZLE, type Database } from '../database/database.module';
import { users, type UserRow } from '../database/schema';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private toAuthUser(u: UserRow): AuthUser {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as AuthUser['role'],
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
    };
  }

  private signAccess(u: UserRow): string {
    const payload: JwtPayload = { sub: u.id, role: u.role as JwtPayload['role'], tokenVersion: u.tokenVersion };
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
  }

  signRefresh(u: UserRow): string {
    const payload: JwtPayload = { sub: u.id, role: u.role as JwtPayload['role'], tokenVersion: u.tokenVersion };
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }),
    });
  }

  private async findByEmail(email: string): Promise<UserRow | undefined> {
    const [u] = await this.db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    return u;
  }

  private async findById(id: string): Promise<UserRow | undefined> {
    const [u] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return u;
  }

  /** Verify credentials; returns { access token, refresh token, user }. */
  async login(email: string, password: string): Promise<{ tokens: LoginResponse; refreshToken: string }> {
    const user = await this.findByEmail(email);
    // Constant-ish work whether or not the user exists — avoids user enumeration.
    const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$deadbeefdeadbeef$0000000000000000000000000000000000000000000';
    const ok = await argon2.verify(hash, password).catch(() => false);

    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    return {
      tokens: { accessToken: this.signAccess(user), user: this.toAuthUser(user) },
      refreshToken: this.signRefresh(user),
    };
  }

  /** Validate a refresh token and mint a fresh access token (rotating tokenVersion enforced). */
  async refresh(refreshToken: string): Promise<{ tokens: LoginResponse; refreshToken: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.findById(payload.sub);
    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    return {
      tokens: { accessToken: this.signAccess(user), user: this.toAuthUser(user) },
      refreshToken: this.signRefresh(user),
    };
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.findById(userId);
    if (!user || !user.isActive) throw new UnauthorizedException();
    return this.toAuthUser(user);
  }

  /** Change own password; bumps tokenVersion so other sessions are invalidated. */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new UnauthorizedException();

    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        tokenVersion: user.tokenVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }
}
