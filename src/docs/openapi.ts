import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { config } from '@/config';

// ==================== Registry ====================
// Each module registers its schemas + routes here.
// When v2 is introduced, create a separate registry for it.
export const registry = new OpenAPIRegistry();

// ==================== Module Registrations ====================
// Each module's .docs.ts file imports `registry` and registers its schemas/routes.
// They are imported in app.ts to avoid circular dependency with this file.

// ==================== Security Schemes ====================
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'JWT token obtained from /auth/login',
});

// ==================== Version-aware Spec Builder ====================
// Build once per version at startup — not per-request (zero runtime overhead).

const VERSION_LABELS: Record<string, string> = {
  v1: '1.0.0',
};

export const buildOpenApiSpec = (version: string = 'v1') => {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  const semver = VERSION_LABELS[version] ?? '0.0.0';

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'MyMasjid API',
      version: semver,
      description:
        'Centralized platform for Islamic organizations — fundraising, community engagement, volunteer management, and governance. Protected endpoints validate that the account is active and that the current database role still matches the JWT. Role-restricted resources never permit access to another portal or Masjid.',
      contact: {
        name: 'MyMasjid Team',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.PORT}/api`,
        description: 'Frontend API base',
      },
      {
        url: `http://localhost:${config.PORT}/api/${version}`,
        description: 'Versioned compatibility base',
      },
    ],
  });
};

// Cached specs — one per version, built once, served many times.
const specCache = new Map<string, ReturnType<typeof buildOpenApiSpec>>();

export const getOpenApiSpec = (version: string = 'v1') => {
  if (!specCache.has(version)) {
    specCache.set(version, buildOpenApiSpec(version));
  }
  return specCache.get(version)!;
};
