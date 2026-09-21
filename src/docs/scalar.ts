import { apiReference } from '@scalar/express-api-reference';





export const createScalarMiddleware = (specUrl: string) =>
  apiReference({
    spec: { url: specUrl },
    theme: 'purple',
    layout: 'modern',
    showSidebar: true,
    darkMode: true,
    _integration: 'express',
  });
