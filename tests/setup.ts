import dotenv from 'dotenv';

dotenv.config({ path: '.env', quiet: true });

process.env.NODE_ENV = 'test';





if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export const testDbAvailable = Boolean(process.env.TEST_DATABASE_URL);
