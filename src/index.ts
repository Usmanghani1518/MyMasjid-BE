import { app } from '@/app';
import { config } from '@/config';
import { connectDatabase, disconnectDatabase } from '@/config/database';
import { logger } from '@/utils/helpers';

const startServer = async () => {
  try {
    await connectDatabase();

    const server = app.listen(config.PORT, () => {
      logger.info({ port: config.PORT, healthPath: '/api/v1/health' }, 'Server started');
    });

    let shuttingDown = false;
    const gracefulShutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, 'Shutting down gracefully');

      const forceExit = setTimeout(() => {
        logger.error({ signal }, 'Graceful shutdown timed out');
        process.exit(1);
      }, 10_000);
      forceExit.unref();

      server.close(async (closeError) => {
        try {
          if (closeError) throw closeError;
          await disconnectDatabase();
          logger.info({ signal }, 'Server closed');
          process.exit(0);
        } catch (error) {
          logger.error({ err: error, signal }, 'Server shutdown failed');
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('unhandledRejection', (reason: unknown) => {
      if (reason instanceof Error) logger.error({ err: reason }, 'Unhandled rejection');
      else logger.error({ reason }, 'Unhandled rejection');
      void gracefulShutdown('unhandledRejection');
    });

    process.on('uncaughtException', (error: Error) => {
      logger.fatal({ err: error }, 'Uncaught exception');
      void gracefulShutdown('uncaughtException');
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
