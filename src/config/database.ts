import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '@/config';
import { logger } from '@/utils/helpers';

const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });

const prisma = new PrismaClient({
  adapter,
  log:
    config.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
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
