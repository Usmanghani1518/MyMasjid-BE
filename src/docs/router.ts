import { Router } from 'express';
import { getOpenApiSpec } from '@/docs/openapi';
import { createScalarMiddleware } from '@/docs/scalar';

// ==================== Versioned Docs Router ====================
// Creates an Express Router that serves OpenAPI spec + Scalar UI for a given API version.
// Usage: app.use('/api/v1', createDocsRouter('v1'));
//
// To add v2 docs in the future:
//   1. Create src/docs/v2/openapi.ts with its own registry + schemas
//   2. Mount: app.use('/api/v2', createDocsRouter('v2'));

export const createDocsRouter = (version: string): Router => {
  const router = Router();

  router.get('/openapi.json', (_req, res) => {
    res.json(getOpenApiSpec(version));
  });

  router.use('/docs', createScalarMiddleware(`/api/${version}/openapi.json`));

  return router;
};
