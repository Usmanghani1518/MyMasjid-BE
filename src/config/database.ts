import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/config';
import { logger } from '@/utils/helpers';

/**
 * The driver adapter does not honor the Prisma `?schema=` query param, so extract
 * it explicitly. Defaults to the public schema (dev). Test runs use `?schema=test`.
 */
const parseSchema = (url: string): string => {
  try {
    return new URL(url).searchParams.get('schema') ?? 'public';
  } catch {
    return 'public';
  }
};

const adapter = new PrismaPg(config.DATABASE_URL, { schema: parseSchema(config.DATABASE_URL) });

const prisma = new PrismaClient({
  adapter,
  log: config.PRISMA_QUERY_LOGS ? ['query', 'error', 'warn'] : ['error', 'warn'],
});

export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
  } catch (error) {
    logger.error({ err: error }, '❌ Database connection failed');
    process.exit(1);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  logger.info('🔌 Database disconnected');
};

export { prisma };
