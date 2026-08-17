import { apiReference } from '@scalar/express-api-reference';

// ==================== Scalar Configuration ====================
// Interactive API reference UI — factory creates one middleware per API version.
// Each version points Scalar at its own OpenAPI JSON endpoint.

export const createScalarMiddleware = (specUrl: string) =>
  apiReference({
    spec: { url: specUrl },
    theme: 'purple',
    layout: 'modern',
    showSidebar: true,
    darkMode: true,
    _integration: 'express',
  });
