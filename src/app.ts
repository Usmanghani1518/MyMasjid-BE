import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { config } from '@/config';
import { errorHandler } from '@/middleware/errorHandler';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { createDocsRouter } from '@/docs/router';


import '@/modules/auth/auth.docs';
import '@/modules/admin/admin.docs';
import '@/modules/campaign/campaign.docs';
import '@/modules/project/project.docs';
import '@/modules/project/tracking.docs';


import authRoutes from '@/modules/auth/auth.routes';
import adminRoutes from '@/modules/admin/admin.routes';
import campaignRoutes from '@/modules/campaign/campaign.routes';
import projectRoutes from '@/modules/project/project.routes';
import projectTrackingRoutes from '@/modules/project/tracking.routes';

const app = express();


app.disable('x-powered-by');
app.use(helmet());


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


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'MyMasjid API is running',
    timestamp: new Date().toISOString(),
  });
});


if (config.ENABLE_API_DOCS) {
  
  
  
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


app.use('/api/v1/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/v1/admin/compliance', adminRoutes);
app.use('/api/v1/masjid/campaigns', campaignRoutes);
app.use('/api/masjid/campaigns', campaignRoutes);
app.use('/api/v1/masjid/projects', projectTrackingRoutes, projectRoutes);
app.use('/api/masjid/projects', projectTrackingRoutes, projectRoutes);


app.use((_req, _res, next) => {
  next(new AppError('Route not found', 404, true, ErrorCodes.ROUTE_NOT_FOUND));
});


app.use(errorHandler);

export { app };
