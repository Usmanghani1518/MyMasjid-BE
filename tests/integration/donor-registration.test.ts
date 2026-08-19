import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, prisma, describeIfDb, truncateAll, installEmailCapture } from '../helpers';

const BASE = '/api/v1/registration/donors';
const AUTH = '/api/v1/auth';
const PASSWORD = 'Passw0rd123!';

describeIfDb('Donor registration', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('completes the full 5-step donor registration (account in /auth)', async () => {
    const capture = installEmailCapture();
    const email = 'donor-flow@example.com';

    // Step 1 — Account (auth module, role-scoped)
    const account = await request(app)
      .post(`${AUTH}/register`)
      .send({ role: 'DONOR', email, password: PASSWORD, fullName: 'Ayesha Test' });
    expect(account.status).toBe(201);
    expect(account.body.success).toBe(true);
    expect(account.body.data.registrationToken).toBeTruthy();
    const auth = { Authorization: `Bearer ${account.body.data.registrationToken}` };

    // Step 2 — Profile (donor module; encrypted ID number must not be returned raw)
    const profile = await request(app).post(`${BASE}/profile`).set(auth).send({
      fullName: 'Ayesha Test',
      phoneCountryCode: '+92',
      phoneNumber: '0300 1231231',
      address: '1 Test Street',
      city: 'Lahore',
      country: 'PK',
      dateOfBirth: '1990-01-01',
      idType: 'NATIONAL_ID',
      idNumber: '3520211111111',
    });
    expect(profile.status).toBe(200);
    expect(profile.body.data.donor.registrationStep).toBe(2);
    expect(JSON.stringify(profile.body.data.donor)).not.toContain('3520211111111');
    expect(profile.body.data.donor.idNumberMasked).toBeTruthy();

    // Step 3 — Interests (donor module)
    const interests = await request(app).post(`${BASE}/interests`).set(auth).send({ interests: ['ZAKAT', 'SADAQAH'] });
    expect(interests.status).toBe(200);
    expect(interests.body.data.donor.registrationStep).toBe(3);

    // Step 4 — Email OTP (auth module)
    const send = await request(app).post(`${AUTH}/send-otp`).set(auth).send({});
    expect(send.status).toBe(200);

    const code = capture.getOtpCode();
    expect(code).toMatch(/^\d{6}$/);

    const verify = await request(app).post(`${AUTH}/verify-otp`).set(auth).send({ code });
    expect(verify.status).toBe(200);
    expect(verify.body.data.donor.emailVerified).toBe(true);
    expect(verify.body.data.donor.registrationStep).toBe(4);

    // Step 5 — Completion (auth module) returns the full token pair
    const complete = await request(app).post(`${AUTH}/complete`).set(auth).send({});
    expect(complete.status).toBe(201);
    expect(complete.body.data.accessToken).toBeTruthy();
    expect(complete.body.data.refreshToken).toBeTruthy();
    expect(complete.body.data.donor.status).toBe('ACTIVE');

    const stored = await prisma.donor.findFirst({ where: { user: { email } } });
    expect(stored?.status).toBe('ACTIVE');
    expect(stored?.completedAt).not.toBeNull();
  });

  it('rejects out-of-order steps with 409 REGISTRATION_STEP_INVALID', async () => {
    const account = await request(app)
      .post(`${AUTH}/register`)
      .send({ role: 'DONOR', email: 'order@example.com', password: PASSWORD, fullName: 'Order Test' });
    const auth = { Authorization: `Bearer ${account.body.data.registrationToken}` };

    // Interests before profile → step 2 not completed.
    const res = await request(app).post(`${BASE}/interests`).set(auth).send({ interests: ['ZAKAT'] });
    expect(res.status).toBe(409);
    expect(res.body.errors[0].code).toBe('REGISTRATION_STEP_INVALID');

    // Complete before OTP verification → blocked.
    const complete = await request(app).post(`${AUTH}/complete`).set(auth).send({});
    expect(complete.status).toBeGreaterThanOrEqual(400);
  });

  it('blocks duplicate emails on register', async () => {
    const body = { role: 'DONOR', email: 'dup@example.com', password: PASSWORD, fullName: 'Dup Test' };
    const first = await request(app).post(`${AUTH}/register`).send(body);
    expect(first.status).toBe(201);

    const second = await request(app).post(`${AUTH}/register`).send(body);
    expect(second.status).toBe(409);
    expect(second.body.errors[0].code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('returns field-level validation errors for a bad profile', async () => {
    const account = await request(app)
      .post(`${AUTH}/register`)
      .send({ role: 'DONOR', email: 'bad-profile@example.com', password: PASSWORD, fullName: 'Bad Test' });
    const auth = { Authorization: `Bearer ${account.body.data.registrationToken}` };

    const res = await request(app).post(`${BASE}/profile`).set(auth).send({
      phoneCountryCode: 'not-a-code',
      dateOfBirth: 'not-a-date',
      idNumber: '1234', // idType missing
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: { field: string }) => e.field === 'idType')).toBe(true);
    expect(res.body.errors.some((e: { field: string }) => e.field === 'dateOfBirth')).toBe(true);
  });
});
