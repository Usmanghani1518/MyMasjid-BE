import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, prisma, describeIfDb, truncateAll, installEmailCapture, setupMasjid, submitMasjid, createUser, login } from '../helpers';

const ADMIN_EMAIL = 'admin-test@example.com';
const ADMIN_PASSWORD = 'Passw0rd123!';

describeIfDb('Masjid admin/compliance review', () => {
  beforeEach(async () => {
    await truncateAll();
    await createUser(ADMIN_EMAIL, { password: ADMIN_PASSWORD });
  });

  const adminAuth = async () => {
    const { accessToken } = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    return { Authorization: `Bearer ${accessToken}` };
  };

  it('lists pending applications and views one', async () => {
    const session = await setupMasjid('pending-list@example.com');
    await submitMasjid(session);

    const auth = await adminAuth();

    const list = await request(app).get('/api/v1/admin/compliance/applications').set(auth).query({ status: 'PENDING_REVIEW' });
    expect(list.status).toBe(200);
    expect(list.body.data.items.some((m: { name: string }) => m.name === 'Masjid Test')).toBe(true);

    const detail = await request(app).get(`/api/v1/admin/compliance/applications/${session.masjidId}`).set(auth);
    expect(detail.status).toBe(200);
    expect(detail.body.data.application.status).toBe('PENDING_REVIEW');
    // Sensitive trustee data must be masked.
    expect(JSON.stringify(detail.body.data.application)).not.toContain('3520212222222');
  });

  it('approves a pending application and emails the owner', async () => {
    const capture = installEmailCapture();
    const session = await setupMasjid('approve-me@example.com');
    await submitMasjid(session);
    const auth = await adminAuth();

    const res = await request(app).post(`/api/v1/admin/compliance/applications/${session.masjidId}/approve`).set(auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.application.status).toBe('APPROVED');
    expect(capture.sent.some((m) => m.subject.includes('approved'))).toBe(true);

    const stored = await prisma.masjid.findUniqueOrThrow({ where: { id: session.masjidId } });
    expect(stored.status).toBe('APPROVED');
    expect(stored.reviewedAt).not.toBeNull();
  });

  it('denies a pending application with structured reasons', async () => {
    const capture = installEmailCapture();
    const session = await setupMasjid('deny-me@example.com');
    await submitMasjid(session);
    const auth = await adminAuth();

    const res = await request(app)
      .post(`/api/v1/admin/compliance/applications/${session.masjidId}/deny`)
      .set(auth)
      .send({
        reasons: [
          { field: 'registrationNumber', code: 'INVALID_DOCUMENT', message: 'Registration certificate is illegible.' },
          { field: 'trustees', code: 'INCOMPLETE_TRUSTEES', message: 'At least two trustees are required.' },
        ],
        note: 'Please re-upload and resubmit.',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.application.status).toBe('DENIED');
    expect(res.body.data.application.denialReasons).toHaveLength(2);
    expect(capture.sent.some((m) => m.subject.includes('not approved') || m.subject.includes('requires changes'))).toBe(true);

    const stored = await prisma.masjid.findUniqueOrThrow({ where: { id: session.masjidId } });
    expect(stored.status).toBe('DENIED');
  });

  it('lets the owner resubmit a denied application', async () => {
    const session = await setupMasjid('resubmit-me@example.com');
    await submitMasjid(session);
    const auth = await adminAuth();

    await request(app).post(`/api/v1/admin/compliance/applications/${session.masjidId}/deny`).set(auth).send({
      reasons: [{ field: 'address', code: 'INVALID_VALUE', message: 'Address looks incomplete.' }],
    });

    // Owner reopens with the registration token.
    const reopen = await request(app).post('/api/v1/registration/masjids/resubmit').set(session.auth).send({});
    expect(reopen.status).toBe(200);
    expect(reopen.body.data.masjid.status).toBe('DRAFT');
    expect(reopen.body.data.masjid.denialReasons).toBeNull();

    // And can re-submit for a fresh review.
    await submitMasjid(session);
    const stored = await prisma.masjid.findUniqueOrThrow({ where: { id: session.masjidId } });
    expect(stored.status).toBe('PENDING_REVIEW');
    expect(stored.denialReasons).toBeNull();
  });

  it('rejects approving an application that is not pending', async () => {
    const session = await setupMasjid('already-approved@example.com');
    await submitMasjid(session);
    const auth = await adminAuth();

    await request(app).post(`/api/v1/admin/compliance/applications/${session.masjidId}/approve`).set(auth).send({});
    const again = await request(app).post(`/api/v1/admin/compliance/applications/${session.masjidId}/approve`).set(auth).send({});
    expect(again.status).toBe(409);
    expect(again.body.errors[0].code).toBe('REGISTRATION_NOT_PENDING');
  });

  it('enforces role-based access on admin endpoints', async () => {
    const session = await setupMasjid('rbac-masjid@example.com');
    await submitMasjid(session);

    // A regular donor must be forbidden.
    await createUser('donor-rbac@example.com');
    const donor = await login('donor-rbac@example.com', 'Passw0rd123!');
    const donorAuth = { Authorization: `Bearer ${donor.accessToken}` };

    const list = await request(app).get('/api/v1/admin/compliance/applications').set(donorAuth);
    expect(list.status).toBe(403);
    expect(list.body.errors[0].code).toBe('FORBIDDEN');

    const approve = await request(app)
      .post(`/api/v1/admin/compliance/applications/${session.masjidId}/approve`)
      .set(donorAuth)
      .send({});
    expect(approve.status).toBe(403);

    // Unauthenticated must be 401.
    const unauth = await request(app).get('/api/v1/admin/compliance/applications');
    expect(unauth.status).toBe(401);
  });
});
