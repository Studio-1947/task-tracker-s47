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
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
});


export type Env = z.infer<typeof envSchema>;

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
