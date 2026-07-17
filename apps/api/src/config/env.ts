import { z } from 'zod';

/** Validated, typed environment. Fail fast at boot if misconfigured (PRD §11.7). */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** Directory for uploaded files (avatars, attachments); relative paths resolve against cwd. */
  UPLOAD_DIR: z.string().default('uploads'),

  // --- Super-dev (hidden developer console) ---
  // The super-dev identity lives ONLY in env — never in the users table — so it is
  // invisible to the admin/member surfaces. All three must be set to enable the
  // /super-dev endpoints; if any is missing the whole feature stays dark (404).
  SUPERDEV_EMAIL: z.string().email().optional(),
  SUPERDEV_PASSWORD: z.string().min(8).optional(),
  /** Dedicated signing secret — cryptographically isolated from the user JWT secrets. */
  SUPERDEV_JWT_SECRET: z.string().min(16).optional(),
  SUPERDEV_JWT_TTL: z.string().default('8h'),
  /**
   * Optional comma-separated IP/CIDR allowlist for the super-dev console (e.g.
   * "203.0.113.4, 10.0.0.0/8"). When set, requests from any other IP are treated as
   * if the console doesn't exist (404). Empty/unset = no IP restriction.
   */
  SUPERDEV_ALLOWED_IPS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** True only when a complete super-dev credential set is configured. */
export function isSuperDevEnabled(env: Pick<Env, 'SUPERDEV_EMAIL' | 'SUPERDEV_PASSWORD' | 'SUPERDEV_JWT_SECRET'>): boolean {
  return Boolean(env.SUPERDEV_EMAIL && env.SUPERDEV_PASSWORD && env.SUPERDEV_JWT_SECRET);
}

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
