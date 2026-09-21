import { Router } from 'express';
import { getOpenApiSpec } from '@/docs/openapi';
import { createScalarMiddleware } from '@/docs/scalar';









export const createDocsRouter = (version: string): Router => {
  const router = Router();

  router.get('/openapi.json', (_req, res) => {
    res.json(getOpenApiSpec(version));
  });

  router.use('/docs', createScalarMiddleware(`/api/${version}/openapi.json`));

  return router;
};
