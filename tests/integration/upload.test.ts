import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, describeIfDb, truncateAll, installEmailCapture, setupMasjid, PDF_BUFFER } from '../helpers';

const UPLOAD = '/api/v1/uploads/document';

const PNG_BUFFER = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);

describeIfDb('Document uploads', () => {
  beforeEach(async () => {
    await truncateAll();
    installEmailCapture();
  });

  it('accepts a valid PDF', async () => {
    const { auth, masjidId } = await setupMasjid('upload-ok@example.com');
    const res = await request(app)
      .post(UPLOAD)
      .set(auth)
      .field('purpose', 'REGISTRATION_CERT')
      .field('masjidId', masjidId)
      .attach('file', PDF_BUFFER, { filename: 'cert.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.data.document.mimeType).toBe('application/pdf');
  });

  it('rejects an unpermitted MIME type', async () => {
    const { auth, masjidId } = await setupMasjid('upload-mime@example.com');
    const res = await request(app)
      .post(UPLOAD)
      .set(auth)
      .field('purpose', 'REGISTRATION_CERT')
      .field('masjidId', masjidId)
      .attach('file', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('rejects a file whose magic bytes do not match its declared type', async () => {
    const { auth, masjidId } = await setupMasjid('upload-magic@example.com');
    const res = await request(app)
      .post(UPLOAD)
      .set(auth)
      .field('purpose', 'REGISTRATION_CERT')
      .field('masjidId', masjidId)
      .attach('file', PNG_BUFFER, { filename: 'cert.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('INVALID_FILE_SIGNATURE');
  });

  it('rejects a file over the size limit', async () => {
    const { auth, masjidId } = await setupMasjid('upload-big@example.com');
    const big = Buffer.alloc(11 * 1024 * 1024); // 11 MB > 10 MB limit
    const res = await request(app)
      .post(UPLOAD)
      .set(auth)
      .field('purpose', 'REGISTRATION_CERT')
      .field('masjidId', masjidId)
      .attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(413);
    expect(res.body.errors[0].code).toBe('FILE_TOO_LARGE');
  });

  it('requires authentication', async () => {
    const res = await request(app).post(UPLOAD).attach('file', PDF_BUFFER, { filename: 'c.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(401);
  });
});
