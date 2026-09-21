import { execSync } from 'node:child_process';
import dotenv from 'dotenv';






export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: '.env', quiet: true });

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    console.warn('\n⚠️  TEST_DATABASE_URL is not set — integration tests will be SKIPPED.\n');
    return;
  }

  console.log('🗄️  Preparing test schema (prisma db push)...');
  execSync(`npx prisma db push --url "${testUrl}"`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}
