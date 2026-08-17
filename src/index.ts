import { app } from '@/app';
import { config } from '@/config';
import { connectDatabase, disconnectDatabase } from '@/config/database';
import { logger } from '@/utils/helpers';

const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();

    // Start HTTP server
    const server = app.listen(config.PORT, () => {
      logger.info(`🚀 Server running on port ${config.PORT}`);
      logger.info(`📍 Environment: ${config.NODE_ENV}`);
      logger.info(`🏥 Health check: http://localhost:${config.PORT}/api/v1/health`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDatabase();
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error({ reason }, 'Unhandled Rejection');
      server.close(() => process.exit(1));
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
