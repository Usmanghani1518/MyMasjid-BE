import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/docs/openapi';

extendZodWithOpenApi(z);

// ==================== Shared schemas ====================

const apiErrorSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.nullable(z.unknown()),
    errors: z.array(
      z.object({ field: z.string().optional(), code: z.string(), message: z.string() }),
    ),
  })
  .openapi('ApiErrorResponse', { description: 'Uniform error envelope' });

const profileRequestSchema = z
  .object({
    fullName: z.string().optional(),
    phoneCountryCode: z.string().optional(),
    phoneNumber: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    dateOfBirth: z.string().optional(),
    idType: z.string().optional(),
    idNumber: z.string().optional(),
  })
  .openapi('DonorProfileRequest');

const interestsRequestSchema = z
  .object({ interests: z.array(z.string()).min(1) })
  .openapi('DonorInterestsRequest');

const donorStepResponses = {
  200: { description: 'Donor step completed' },
  400: { description: 'Validation error', content: { 'application/json': { schema: apiErrorSchema } } },
  401: { description: 'Registration token required', content: { 'application/json': { schema: apiErrorSchema } } },
  409: { description: 'Step out of order', content: { 'application/json': { schema: apiErrorSchema } } },
};

registry.registerPath({
  method: 'post',
  path: '/registration/donors/profile',
  tags: ['Donor Registration'],
  summary: 'Step 2 — Save donor profile (requires registration token from /auth/register)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: profileRequestSchema } } } },
  responses: donorStepResponses,
});

registry.registerPath({
  method: 'post',
  path: '/registration/donors/interests',
  tags: ['Donor Registration'],
  summary: 'Step 3 — Save donor interests',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: interestsRequestSchema } } } },
  responses: donorStepResponses,
});
