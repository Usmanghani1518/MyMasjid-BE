import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/docs/openapi';

extendZodWithOpenApi(z);

const apiErrorSchema = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.nullable(z.unknown()),
    errors: z.array(z.object({ field: z.string().optional(), code: z.string(), message: z.string() })),
  })
  .openapi('ApiErrorResponse');

const profileSkillsRequestSchema = z
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
    bio: z.string().optional(),
    skills: z.array(z.string()).min(1),
  })
  .openapi('VolunteerProfileSkillsRequest');

const interestsAvailabilityRequestSchema = z
  .object({
    interests: z.array(z.string()).min(1),
    availabilityDays: z.array(z.string()).min(1),
    availabilityTimes: z.array(z.string()).min(1),
  })
  .openapi('VolunteerInterestsAvailabilityRequest');

const volunteerStepResponses = {
  200: { description: 'Volunteer step completed' },
  400: { description: 'Validation error', content: { 'application/json': { schema: apiErrorSchema } } },
  401: { description: 'Registration token required', content: { 'application/json': { schema: apiErrorSchema } } },
  409: { description: 'Step out of order', content: { 'application/json': { schema: apiErrorSchema } } },
};

registry.registerPath({
  method: 'post',
  path: '/registration/volunteers/profile-skills',
  tags: ['Volunteer Registration'],
  summary: 'Step 2 — Save profile and skills (requires registration token from /auth/register)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: profileSkillsRequestSchema } } } },
  responses: volunteerStepResponses,
});

registry.registerPath({
  method: 'post',
  path: '/registration/volunteers/interests-availability',
  tags: ['Volunteer Registration'],
  summary: 'Step 3 — Save interests and availability',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: interestsAvailabilityRequestSchema } } } },
  responses: volunteerStepResponses,
});
