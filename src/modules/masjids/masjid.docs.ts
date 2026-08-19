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

const trusteeResponseSchema = z
  .object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
    phoneNumber: z.string().nullable(),
    role: z.string(),
    idType: z.string().nullable(),
    idNumberMasked: z.string().nullable(),
  })
  .openapi('TrusteeResponse');

const masjidResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    owner: z.object({ id: z.string().uuid(), email: z.string().email(), name: z.string().nullable(), role: z.string() }),
    registrationNumber: z.string().nullable(),
    organizationType: z.string().nullable(),
    charityNumber: z.string().nullable(),
    email: z.string().nullable(),
    phoneNumber: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    country: z.string(),
    website: z.string().nullable(),
    establishedYear: z.number().nullable(),
    description: z.string().nullable(),
    missionStatement: z.string().nullable(),
    operatingHours: z.string().nullable(),
    services: z.array(z.string()),
    handlesZakat: z.boolean(),
    handlesGiftAid: z.boolean(),
    hasCharityRegistration: z.boolean(),
    acceptsOnlineDonations: z.boolean(),
    complianceNotes: z.string().nullable(),
    registrationStep: z.number(),
    status: z.string(),
    submittedAt: z.string().datetime().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    reviewNote: z.string().nullable(),
    denialReasons: z.nullable(z.unknown()),
    emailVerified: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    trustees: z.array(trusteeResponseSchema),
    documents: z.array(z.object({ id: z.string().uuid(), originalName: z.string(), mimeType: z.string(), size: z.number(), purpose: z.string().nullable() })),
  })
  .openapi('MasjidResponse', { description: 'Masjid registration draft (safe fields)' });

const orgProfileRequestSchema = z
  .object({
    description: z.string().min(10),
    missionStatement: z.string().min(10),
    operatingHours: z.string().optional(),
  })
  .openapi('MasjidOrganizationProfileRequest');

const servicesComplianceRequestSchema = z
  .object({
    services: z.array(z.string()).min(1),
    handlesZakat: z.boolean(),
    handlesGiftAid: z.boolean(),
    hasCharityRegistration: z.boolean(),
    acceptsOnlineDonations: z.boolean(),
    complianceNotes: z.string().optional(),
  })
  .openapi('MasjidServicesComplianceRequest');

const trusteesRequestSchema = z
  .object({
    trustees: z.array(
      z.object({
        fullName: z.string(),
        email: z.string().email(),
        phoneNumber: z.string().optional(),
        role: z.string(),
        idType: z.string().optional(),
        idNumber: z.string().optional(),
      }),
    ),
  })
  .openapi('MasjidTrusteesRequest');

const registerMasjidStep = (
  step: 'organization-profile' | 'services-compliance' | 'trustees' | 'submit' | 'resubmit',
  summary: string,
  requestBody?: { content: { 'application/json': { schema: z.ZodSchema } } },
) => {
  registry.registerPath({
    method: 'post',
    path: `/registration/masjids/${step}`,
    tags: ['Masjid Registration'],
    summary,
    security: [{ bearerAuth: [] }],
    request: requestBody ? { body: requestBody } : undefined,
    responses: {
      200: { description: summary },
      400: { description: 'Validation error', content: { 'application/json': { schema: apiErrorSchema } } },
      401: { description: 'Not authenticated', content: { 'application/json': { schema: apiErrorSchema } } },
      409: { description: 'Conflict / step order', content: { 'application/json': { schema: apiErrorSchema } } },
    },
  });
};

registry.registerPath({
  method: 'get',
  path: '/registration/masjids/me',
  tags: ['Masjid Registration'],
  summary: 'Get current masjid registration draft',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Current draft', content: { 'application/json': { schema: masjidResponseSchema } } },
    401: { description: 'Not authenticated', content: { 'application/json': { schema: apiErrorSchema } } },
  },
});

registerMasjidStep('organization-profile', 'Step 2 — Save organization profile', {
  content: { 'application/json': { schema: orgProfileRequestSchema } },
});
registerMasjidStep('services-compliance', 'Step 3 — Save services and compliance flags', {
  content: { 'application/json': { schema: servicesComplianceRequestSchema } },
});
registerMasjidStep('trustees', 'Step 4 — Replace trustees', {
  content: { 'application/json': { schema: trusteesRequestSchema } },
});
registerMasjidStep('submit', 'Step 5 — Submit for review');
registerMasjidStep('resubmit', 'Reopen a denied application for editing');
