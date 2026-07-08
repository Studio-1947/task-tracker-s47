import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { eq } from 'drizzle-orm';
import type { JwtPayload } from '@task-tracker/shared';
import type { Env } from '../config/env';
import { DRIZZLE, type Database } from '../database/database.module';
import { users } from '../database/schema';
import type { RequestUser } from '../common/decorators/current-user.decorator';

/**
 * Validates the access token AND re-checks the user is still active with a matching
 * tokenVersion — so a deactivated user is locked out immediately, not at next expiry
 * (PRD §3.7 / §11.2).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const [user] = await this.db
      .select({
        id: users.id,
        role: users.role,
        isActive: users.isActive,
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    return { id: user.id, role: user.role, tokenVersion: user.tokenVersion };
  }
}
