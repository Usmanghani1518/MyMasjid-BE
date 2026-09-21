import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { config } from '@/config';




export const registry = new OpenAPIRegistry();






registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'JWT token obtained from /auth/login',
});




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


const specCache = new Map<string, ReturnType<typeof buildOpenApiSpec>>();

export const getOpenApiSpec = (version: string = 'v1') => {
  if (!specCache.has(version)) {
    specCache.set(version, buildOpenApiSpec(version));
  }
  return specCache.get(version)!;
};
