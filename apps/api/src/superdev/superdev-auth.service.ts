import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isSuperDevEnabled, type Env } from '../config/env';
import { isIpAllowed, parseAllowlist } from './ip-allowlist';
import { SUPERDEV_SCOPE, type SuperDevJwtPayload } from './superdev.constants';

/** Brute-force throttle: N failed logins per IP then a cooldown lockout. */
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

interface AttemptRecord {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

/** Named so the global exception filter emits error:"TooManyRequests" (not "Http"). */
class TooManyRequestsException extends HttpException {
  constructor(message: string) {
    super({ statusCode: HttpStatus.TOO_MANY_REQUESTS, error: 'TooManyRequests', message }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/**
 * Authenticates the single, env-defined super-dev identity. There is no DB row and
 * no user record — credentials live only in server env, which is why admins/members
 * can never see this account anywhere in the product.
 */
@Injectable()
export class SuperDevAuthService {
  private readonly attempts = new Map<string, AttemptRecord>();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly jwt: JwtService,
  ) {}

  /** Reject requests from IPs outside the allowlist as if the console doesn't exist. */
  assertIpAllowed(ip: string): void {
    const allowlist = parseAllowlist(this.config.get('SUPERDEV_ALLOWED_IPS', { infer: true }));
    if (!isIpAllowed(ip, allowlist)) throw new NotFoundException();
  }

  private assertNotLocked(ip: string): void {
    const rec = this.attempts.get(ip);
    if (rec && rec.lockedUntil > Date.now()) {
      const retryAfter = Math.ceil((rec.lockedUntil - Date.now()) / 1000);
      throw new TooManyRequestsException(`Too many attempts. Try again in ${retryAfter}s.`);
    }
  }

  private recordFailure(ip: string): void {
    const now = Date.now();
    const rec = this.attempts.get(ip);
    if (!rec || now - rec.firstFailureAt > ATTEMPT_WINDOW_MS) {
      this.attempts.set(ip, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
      return;
    }
    rec.failures += 1;
    if (rec.failures >= MAX_FAILED_ATTEMPTS) rec.lockedUntil = now + LOCKOUT_MS;
    // Opportunistic cleanup so the map can't grow unbounded.
    if (this.attempts.size > 1000) {
      for (const [k, v] of this.attempts) {
        if (v.lockedUntil < now && now - v.firstFailureAt > ATTEMPT_WINDOW_MS) this.attempts.delete(k);
      }
    }
  }

  get enabled(): boolean {
    return isSuperDevEnabled({
      SUPERDEV_EMAIL: this.config.get('SUPERDEV_EMAIL', { infer: true }),
      SUPERDEV_PASSWORD: this.config.get('SUPERDEV_PASSWORD', { infer: true }),
      SUPERDEV_JWT_SECRET: this.config.get('SUPERDEV_JWT_SECRET', { infer: true }),
    });
  }

  /** Throw a 404 (not 403) when disabled so the feature is indistinguishable from "not there". */
  assertEnabled(): void {
    if (!this.enabled) throw new NotFoundException();
  }

  private get email(): string {
    return (this.config.get('SUPERDEV_EMAIL', { infer: true }) ?? '').toLowerCase();
  }

  private get secret(): string {
    return this.config.get('SUPERDEV_JWT_SECRET', { infer: true }) ?? '';
  }

  /** Constant-time credential check; returns a signed session token or throws. */
  login(email: string, password: string, ip = 'unknown'): { token: string; email: string } {
    this.assertEnabled();
    this.assertIpAllowed(ip);
    this.assertNotLocked(ip);
    const expectedPassword = this.config.get('SUPERDEV_PASSWORD', { infer: true }) ?? '';

    const emailOk = safeEqual(email.trim().toLowerCase(), this.email);
    const passwordOk = safeEqual(password, expectedPassword);
    // Evaluate both before branching so timing doesn't reveal which half failed.
    if (!emailOk || !passwordOk) {
      this.recordFailure(ip);
      throw new UnauthorizedException('Invalid super-dev credentials');
    }
    this.attempts.delete(ip); // success clears the throttle

    const payload: SuperDevJwtPayload = { scope: SUPERDEV_SCOPE, email: this.email };
    const token = this.jwt.sign(payload, {
      secret: this.secret,
      expiresIn: this.config.get('SUPERDEV_JWT_TTL', { infer: true }),
    });
    return { token, email: this.email };
  }

  /** Verify a session token; returns the payload or throws Unauthorized. */
  verify(token: string): SuperDevJwtPayload {
    this.assertEnabled();
    let payload: SuperDevJwtPayload;
    try {
      payload = this.jwt.verify<SuperDevJwtPayload>(token, { secret: this.secret });
    } catch {
      throw new UnauthorizedException('Invalid super-dev session');
    }
    if (payload.scope !== SUPERDEV_SCOPE || !safeEqual(payload.email ?? '', this.email)) {
      throw new UnauthorizedException('Invalid super-dev session');
    }
    return payload;
  }
}

/** Length-independent constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}
