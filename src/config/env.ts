import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4001),
  TURSO_URL: z.string().min(1, 'TURSO_URL is required'),
  TURSO_AUTH_TOKEN: z.string().min(1, 'TURSO_AUTH_TOKEN is required'),
  OWLIN_ADMIN_KEY: z.string().min(8, 'OWLIN_ADMIN_KEY must be at least 8 chars'),
  CORS_ORIGINS: z.string().default('http://localhost:4000,http://localhost:5173,http://localhost:5174'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  _env = result.data;
  return _env;
}

export function getEnv(): Env {
  if (!_env) throw new Error('Environment not loaded yet. Call loadEnv() first.');
  return _env;
}
