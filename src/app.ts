import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { config } from '@/config';
import { errorHandler } from '@/middleware/errorHandler';
import { AppError } from '@/utils/helpers';
import { createDocsRouter } from '@/docs/router';

// Register module docs (must come before specs are built)
import '@/modules/auth/auth.docs';
import '@/modules/masjids/masjid.docs';

const app = express();

// ==================== Security Middleware ====================
app.use(helmet());
app.use(cors());
app.use(compression());

// ==================== Body Parsing ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================== Health Check ====================
app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'MyMasjid API is running',
    timestamp: new Date().toISOString(),
  });
});

// ==================== API Documentation ====================
// Versioned docs: each API version gets its own spec + Scalar UI.
// URLs: /api/v1/openapi.json, /api/v1/docs
// Convenience: /docs redirects to the latest version.
if (config.ENABLE_API_DOCS) {
  app.use('/api/v1', createDocsRouter('v1'));

  // Redirect /docs → latest version docs
  app.get('/docs', (_req, res) => {
    res.redirect('/api/v1/docs');
  });
}

// ==================== API Routes ====================
// TODO: Register module routes here
// app.use('/api/v1/auth', authRoutes);
// app.use('/api/v1/masjids', masjidRoutes);

// ==================== 404 Handler ====================
app.use((_req, _res, next) => {
  next(new AppError('Route not found', 404));
});

// ==================== Global Error Handler ====================
app.use(errorHandler);

export { app };
