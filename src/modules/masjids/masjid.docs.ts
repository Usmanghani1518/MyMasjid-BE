import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/docs/openapi';

extendZodWithOpenApi(z);

// ==================== Schemas ====================

export const createMasjidSchema = z
  .object({
    name: z.string().min(1).describe('Masjid name'),
    address: z.string().min(1).describe('Street address'),
    city: z.string().min(1).describe('City'),
    state: z.string().optional().describe('State or province'),
    country: z.string().default('PK').describe('Country code (ISO 3166-1)'),
    latitude: z.number().min(-90).max(90).optional().describe('Latitude coordinate'),
    longitude: z.number().min(-180).max(180).optional().describe('Longitude coordinate'),
    description: z.string().optional().describe('Brief description of the masjid'),
  })
  .openapi('CreateMasjidRequest', {
    description: 'Create a new masjid',
    example: {
      name: 'Masjid Al-Noor',
      address: '123 Main Street',
      city: 'Lahore',
      state: 'Punjab',
      country: 'PK',
      latitude: 31.5204,
      longitude: 74.3587,
      description: 'A community masjid in the heart of Lahore',
    },
  });

export const masjidResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    address: z.string(),
    city: z.string(),
    state: z.string().nullable(),
    country: z.string(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    description: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('MasjidResponse');

export const masjidListResponseSchema = z
  .object({
    data: z.array(masjidResponseSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
  })
  .openapi('MasjidListResponse');

export const errorResponseSchema = z
  .object({
    status: z.string(),
    message: z.string(),
  })
  .openapi('MasjidErrorResponse');

// ==================== Routes ====================

registry.registerPath({
  method: 'get',
  path: '/masjids',
  tags: ['Masjids'],
  summary: 'List all masjids',
  description: 'Get a paginated list of all registered masjids (public endpoint)',
  security: [],
  request: {
    query: z.object({
      page: z.coerce.number().min(1).default(1).optional(),
      limit: z.coerce.number().min(1).max(100).default(20).optional(),
      city: z.string().optional().describe('Filter by city'),
      country: z.string().optional().describe('Filter by country code'),
      search: z.string().optional().describe('Search by name or address'),
    }),
  },
  responses: {
    200: {
      description: 'List of masjids',
      content: {
        'application/json': {
          schema: masjidListResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/masjids/{id}',
  tags: ['Masjids'],
  summary: 'Get masjid by ID',
  description: 'Get detailed information about a specific masjid (public endpoint)',
  security: [],
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    200: {
      description: 'Masjid details',
      content: {
        'application/json': {
          schema: masjidResponseSchema,
        },
      },
    },
    404: {
      description: 'Masjid not found',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/masjids',
  tags: ['Masjids'],
  summary: 'Create a masjid',
  description: 'Register a new masjid (requires admin authentication)',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: createMasjidSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Masjid created successfully',
      content: {
        'application/json': {
          schema: masjidResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/masjids/{id}',
  tags: ['Masjids'],
  summary: 'Update a masjid',
  description: 'Update masjid details (requires admin authentication)',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
    body: {
      content: {
        'application/json': {
          schema: createMasjidSchema.partial(),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Masjid updated successfully',
      content: {
        'application/json': {
          schema: masjidResponseSchema,
        },
      },
    },
    404: {
      description: 'Masjid not found',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/masjids/{id}',
  tags: ['Masjids'],
  summary: 'Delete a masjid',
  description: 'Soft-delete a masjid (requires admin authentication)',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Masjid deleted successfully',
    },
    404: {
      description: 'Masjid not found',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
});
