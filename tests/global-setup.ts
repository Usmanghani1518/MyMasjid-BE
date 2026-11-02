import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: '.env', quiet: true });

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    console.warn('\n⚠️  TEST_DATABASE_URL is not set — integration tests will be SKIPPED.\n');
    return;
  }

  const testDatabase = new URL(testUrl);
  if (testDatabase.protocol !== 'postgres:' && testDatabase.protocol !== 'postgresql:') {
    throw new Error('TEST_DATABASE_URL must be a PostgreSQL URL.');
  }
  const testSchema = testDatabase.searchParams.get('schema');
  if (!testSchema || !/^test(?:$|[_-])/i.test(testSchema)) {
    throw new Error('TEST_DATABASE_URL must use an isolated schema named test or prefixed with test_ or test-.');
  }

  const mainUrl = process.env.DATABASE_URL;
  if (mainUrl) {
    const mainDatabase = new URL(mainUrl);
    const sameDatabase = testDatabase.host === mainDatabase.host && testDatabase.pathname === mainDatabase.pathname;
    const mainSchema = mainDatabase.searchParams.get('schema') ?? 'public';
    if (sameDatabase && testSchema === mainSchema) {
      throw new Error('TEST_DATABASE_URL must not point at the primary database schema.');
    }
  }

  console.log('🗄️  Preparing test schema (prisma db push)...');
  execFileSync('npx', ['prisma', 'db', 'push'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}
