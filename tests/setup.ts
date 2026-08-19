import dotenv from 'dotenv';

dotenv.config({ path: '.env', quiet: true });

process.env.NODE_ENV = 'test';

/**
 * When a TEST_DATABASE_URL is configured, point the app at it BEFORE any
 * module that reads config/env is imported (config reads env at import time).
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export const testDbAvailable = Boolean(process.env.TEST_DATABASE_URL);
