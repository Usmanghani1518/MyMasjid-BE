import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { config } from '@/config';
import { errorHandler } from '@/middleware/errorHandler';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { createDocsRouter } from '@/docs/router';

// Register module docs (must come before specs are built)
import '@/modules/auth/auth.docs';
import '@/modules/donors/donor.docs';
import '@/modules/volunteers/volunteer.docs';
import '@/modules/masjids/masjid.docs';
import '@/modules/admin/admin.docs';
import '@/modules/uploads/upload.docs';

// Module routes
import authRoutes from '@/modules/auth/auth.routes';
import donorRoutes from '@/modules/donors/donor.routes';
import volunteerRoutes from '@/modules/volunteers/volunteer.routes';
import masjidRoutes from '@/modules/masjids/masjid.routes';
import adminRoutes from '@/modules/admin/admin.routes';
import uploadRoutes from '@/modules/uploads/upload.routes';

const app = express();

// ==================== Security Middleware ====================
app.disable('x-powered-by');
app.use(helmet());

// CORS — restricted to the configured frontend origin(s) only.
const allowedOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

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
if (config.ENABLE_API_DOCS) {
  // Scalar renders client-side: it loads its bundle from jsDelivr and runs an
  // inline <script> initializer. Both are blocked by the default (strict) Helmet
  // CSP, so relax the CSP ONLY for the docs page, leaving the API strict.
  const docsCspDirectives = helmet.contentSecurityPolicy.getDefaultDirectives();
  docsCspDirectives['script-src'] = ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"];
  docsCspDirectives['connect-src'] = ["'self'", 'https://cdn.jsdelivr.net'];
  const docsCsp = Object.entries(docsCspDirectives)
    .map(([key, value]) => `${key} ${(Array.isArray(value) ? value : [value]).join(' ')}`)
    .join('; ');

  app.use('/api/v1/docs', (_req, res, next) => {
    res.setHeader('Content-Security-Policy', docsCsp);
    next();
  });

  app.use('/api/v1', createDocsRouter('v1'));
  app.get('/docs', (_req, res) => {
    res.redirect('/api/v1/docs');
  });
}

// ==================== API Routes ====================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/registration/donors', donorRoutes);
app.use('/api/v1/registration/volunteers', volunteerRoutes);
app.use('/api/v1/registration/masjids', masjidRoutes);
app.use('/api/v1/admin/compliance', adminRoutes);
app.use('/api/v1/uploads', uploadRoutes);

// ==================== 404 Handler ====================
app.use((_req, _res, next) => {
  next(new AppError('Route not found', 404, true, ErrorCodes.ROUTE_NOT_FOUND));
});

// ==================== Global Error Handler ====================
app.use(errorHandler);

export { app };
