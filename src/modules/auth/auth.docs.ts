import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/docs/openapi';

// Extend Zod with OpenAPI .meta() for descriptions/examples
extendZodWithOpenApi(z);

// ==================== Schemas ====================

export const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
    role: z.enum(['USER', 'ADMIN']).default('USER'),
  })
  .openapi('RegisterRequest', {
    description: 'User registration request',
    example: {
      email: 'ahmad@example.com',
      password: 'securePass123',
      name: 'Ahmad Khan',
      role: 'USER',
    },
  });

export const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string(),
  })
  .openapi('LoginRequest', {
    description: 'User login request',
    example: {
      email: 'ahmad@example.com',
      password: 'securePass123',
    },
  });

export const tokenResponseSchema = z
  .object({
    token: z.string(),
    user: z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      name: z.string(),
      role: z.string(),
    }),
  })
  .openapi('TokenResponse', {
    description: 'JWT token and user profile',
  });

export const errorResponseSchema = z
  .object({
    status: z.string(),
    message: z.string(),
  })
  .openapi('ErrorResponse');

// ==================== Routes ====================

registry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags: ['Authentication'],
  summary: 'Register a new user',
  description: 'Create a new account (donor, volunteer, or admin)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: registerSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'User registered successfully',
      content: {
        'application/json': {
          schema: tokenResponseSchema,
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
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: ['Authentication'],
  summary: 'Login with email and password',
  description: 'Authenticate and receive a JWT token',
  request: {
    body: {
      content: {
        'application/json': {
          schema: loginSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Login successful',
      content: {
        'application/json': {
          schema: tokenResponseSchema,
        },
      },
    },
    401: {
      description: 'Invalid credentials',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: ['Authentication'],
  summary: 'Get current user profile',
  description: 'Returns the authenticated user profile (requires JWT)',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Current user profile',
      content: {
        'application/json': {
          schema: tokenResponseSchema.pick({ user: true }),
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
