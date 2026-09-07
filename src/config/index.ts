import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Test database (optional). Used by integration tests. If omitted, integration tests are skipped.
  TEST_DATABASE_URL: z.string().optional(),

  // ==================== JWT / Tokens ====================
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  REFRESH_TOKEN_SECRET: z.string().optional(),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),

  // ==================== OTP ====================
  OTP_LENGTH: z.coerce.number().default(6),
  OTP_EXPIRES_MINUTES: z.coerce.number().default(10),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().default(60),
  OTP_MAX_RESENDS: z.coerce.number().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  OTP_LOCK_MINUTES: z.coerce.number().default(15),

  // ==================== CORS ====================
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // ==================== Email ====================
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('MyMasjid <no-reply@mymasjid.org>'),
  SMTP_CONNECTION_TIMEOUT_MS: z.coerce.number().default(5000),
  SMTP_GREETING_TIMEOUT_MS: z.coerce.number().default(5000),
  SMTP_SOCKET_TIMEOUT_MS: z.coerce.number().default(8000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // ==================== Misc ====================
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  PRISMA_QUERY_LOGS: z.coerce.boolean().default(false),
  ENABLE_API_DOCS: z.coerce.boolean().default(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
