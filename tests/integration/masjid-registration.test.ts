import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, prisma, describeIfDb, truncateAll, installEmailCapture, setupMasjid, PDF_BUFFER } from '../helpers';

const BASE = '/api/v1/registration/masjids';
const UPLOAD = '/api/v1/uploads/document';

describeIfDb('Masjid registration', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('completes all 5 steps and submits for review', async () => {
    const capture = installEmailCapture();
    const { auth, masjidId } = await setupMasjid('masjid-flow@example.com');

    // Welcome email at step 1.
    expect(capture.sent.some((m) => m.subject.includes('Welcome'))).toBe(true);

    // Upload a registration document.
    const upload = await request(app)
      .post(UPLOAD)
      .set(auth)
      .field('purpose', 'REGISTRATION_CERT')
      .field('masjidId', masjidId)
      .attach('file', PDF_BUFFER, { filename: 'cert.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(201);

    // Submit.
    const submit = await request(app).post(`${BASE}/submit`).set(auth).send({});
    expect(submit.status).toBe(200);
    expect(submit.body.data.masjid.status).toBe('PENDING_REVIEW');
    expect(capture.sent.some((m) => m.subject.includes('submitted'))).toBe(true);

    const stored = await prisma.masjid.findFirst({ where: { owner: { email: 'masjid-flow@example.com' } } });
    expect(stored?.status).toBe('PENDING_REVIEW');
    expect(stored?.submittedAt).not.toBeNull();
  });

  it('cannot submit without a document', async () => {
    const { auth } = await setupMasjid('masjid-nodoc@example.com');
    const submit = await request(app).post(`${BASE}/submit`).set(auth).send({});
    expect(submit.status).toBe(400);
    expect(submit.body.errors[0].code).toBe('AT_LEAST_ONE_DOCUMENT_REQUIRED');
  });

  it('prevents uploading documents to a masjid the user does not own', async () => {
    const { auth } = await setupMasjid('masjid-owner@example.com');
    const { masjidId: otherMasjidId } = await setupMasjid('masjid-other@example.com');

    const upload = await request(app)
      .post(UPLOAD)
      .set(auth)
      .field('purpose', 'REGISTRATION_CERT')
      .field('masjidId', otherMasjidId)
      .attach('file', PDF_BUFFER, { filename: 'cert.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(403);
  });

  it('rejects a wrong document type (magic-byte mismatch)', async () => {
    const { auth, masjidId } = await setupMasjid('masjid-fake@example.com');
    const pngPretendingToBePdf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const upload = await request(app)
      .post(UPLOAD)
      .set(auth)
      .field('purpose', 'REGISTRATION_CERT')
      .field('masjidId', masjidId)
      .attach('file', pngPretendingToBePdf, { filename: 'cert.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(400);
    expect(upload.body.errors[0].code).toBe('INVALID_FILE_SIGNATURE');
  });
});
