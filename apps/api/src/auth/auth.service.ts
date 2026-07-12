import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import type { AuthUser, JwtPayload, LoginResponse } from '@task-tracker/shared';
import type { Env } from '../config/env';
import { DRIZZLE, type Database } from '../database/database.module';
import { users, sessions, type UserRow } from '../database/schema';

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
      avatarKey: u.avatarKey,
      designation: u.designation,
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
    };
  }

  private signAccess(u: UserRow, sessionId?: string): string {
    const payload: JwtPayload = { sub: u.id, role: u.role as JwtPayload['role'], tokenVersion: u.tokenVersion, sessionId };
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
  }

  signRefresh(u: UserRow, sessionId?: string): string {
    const payload: JwtPayload = { sub: u.id, role: u.role as JwtPayload['role'], tokenVersion: u.tokenVersion, sessionId };
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

  /** Build an access token + refresh token pair for a user row and record session. */
  private async makeSession(
    user: UserRow,
    userAgent?: string | null,
    ipAddress?: string | null,
  ): Promise<{ tokens: LoginResponse; refreshToken: string }> {
    const [sess] = await this.db
      .insert(sessions)
      .values({
        userId: user.id,
        userAgent: userAgent ?? null,
        ipAddress: ipAddress ?? null,
      })
      .returning();
    const sessionId = sess?.id;
    return {
      tokens: { accessToken: this.signAccess(user, sessionId), user: this.toAuthUser(user) },
      refreshToken: this.signRefresh(user, sessionId),
    };
  }

  /** Verify credentials; returns { access token, refresh token, user }. */
  async login(
    email: string,
    password: string,
    userAgent?: string | null,
    ipAddress?: string | null,
  ): Promise<{ tokens: LoginResponse; refreshToken: string }> {
    const user = await this.findByEmail(email);
    // Constant-ish work whether or not the user exists — avoids user enumeration.
    const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$deadbeefdeadbeef$0000000000000000000000000000000000000000000';
    const ok = await argon2.verify(hash, password).catch(() => false);

    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    return this.makeSession(user, userAgent, ipAddress);
  }

  /** Validate a refresh token and mint a fresh access token (rotating tokenVersion enforced). */
  async refresh(
    refreshToken: string,
    userAgent?: string | null,
    ipAddress?: string | null,
  ): Promise<{ tokens: LoginResponse; refreshToken: string }> {
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

    let sessionId = payload.sessionId;
    if (sessionId) {
      const [sess] = await this.db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!sess) {
        throw new UnauthorizedException('Session is no longer valid');
      }
      await this.db
        .update(sessions)
        .set({
          lastActiveAt: new Date(),
          ...(userAgent ? { userAgent } : {}),
          ...(ipAddress ? { ipAddress } : {}),
        })
        .where(eq(sessions.id, sessionId));
    } else {
      const [sess] = await this.db
        .insert(sessions)
        .values({
          userId: user.id,
          userAgent: userAgent ?? null,
          ipAddress: ipAddress ?? null,
        })
        .returning();
      sessionId = sess?.id;
    }

    return {
      tokens: { accessToken: this.signAccess(user, sessionId), user: this.toAuthUser(user) },
      refreshToken: this.signRefresh(user, sessionId),
    };
  }

  /**
   * Verify an access token the same way JwtStrategy does (signature + still-active
   * user + matching tokenVersion). Used by the chat WebSocket gateway, which can't
   * go through the HTTP passport guard. Returns the request-user shape or throws.
   */
  async verifyAccessToken(
    token: string,
  ): Promise<{ id: string; role: string; tokenVersion: number; sessionId?: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
    const user = await this.findById(payload.sub);
    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    return { id: user.id, role: user.role, tokenVersion: user.tokenVersion, sessionId: payload.sessionId };
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.findById(userId);
    if (!user || !user.isActive) throw new UnauthorizedException();
    return this.toAuthUser(user);
  }

  /**
   * Change own password; bumps tokenVersion so OTHER sessions are invalidated, and
   * returns a fresh token pair so the caller's own session continues seamlessly
   * (important for the forced first-login reset — otherwise the user is logged out).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ tokens: LoginResponse; refreshToken: string }> {
    const user = await this.findById(userId);
    if (!user) throw new UnauthorizedException();

    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    const [updated] = await this.db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        tokenVersion: user.tokenVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return this.makeSession(updated!);
  }

  async logout(sessionId?: string, refreshToken?: string): Promise<void> {
    if (sessionId) {
      await this.db.delete(sessions).where(eq(sessions.id, sessionId));
    } else if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
          secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        });
        if (payload.sessionId) {
          await this.db.delete(sessions).where(eq(sessions.id, payload.sessionId));
        }
      } catch {
        // ignore validation errors on logout
      }
    }
  }
}
