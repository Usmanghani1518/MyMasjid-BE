import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, prisma, describeIfDb, truncateAll, installEmailCapture } from '../helpers';

const BASE = '/api/v1/registration/volunteers';
const AUTH = '/api/v1/auth';
const PASSWORD = 'Passw0rd123!';

describeIfDb('Volunteer registration', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('completes the full 4-step volunteer registration (account in /auth)', async () => {
    const capture = installEmailCapture();
    const email = 'volunteer-flow@example.com';

    // Step 1 — Account (auth module, role-scoped)
    const account = await request(app)
      .post(`${AUTH}/register`)
      .send({ role: 'VOLUNTEER', email, password: PASSWORD, fullName: 'Omar Test' });
    expect(account.status).toBe(201);
    const auth = { Authorization: `Bearer ${account.body.data.registrationToken}` };

    // Step 2 — Profile & Skills (volunteer module)
    const profile = await request(app).post(`${BASE}/profile-skills`).set(auth).send({
      bio: 'Available on weekends for food drives.',
      skills: ['TEACHING', 'EVENT_MANAGEMENT'],
      city: 'Karachi',
      country: 'PK',
    });
    expect(profile.status).toBe(200);
    expect(profile.body.data.volunteer.skills).toEqual(['TEACHING', 'EVENT_MANAGEMENT']);
    expect(profile.body.data.volunteer.registrationStep).toBe(2);

    // Step 3 — Interests & Availability (volunteer module)
    const interests = await request(app).post(`${BASE}/interests-availability`).set(auth).send({
      interests: ['EDUCATION'],
      availabilityDays: ['SATURDAY'],
      availabilityTimes: ['MORNING'],
    });
    expect(interests.status).toBe(200);
    expect(interests.body.data.volunteer.registrationStep).toBe(3);

    // Step 4 — OTP + completion (auth module)
    await request(app).post(`${AUTH}/send-otp`).set(auth).send({});
    const code = capture.getOtpCode();
    const verify = await request(app).post(`${AUTH}/verify-otp`).set(auth).send({ code });
    expect(verify.status).toBe(200);

    const complete = await request(app).post(`${AUTH}/complete`).set(auth).send({});
    expect(complete.status).toBe(201);
    expect(complete.body.data.volunteer.status).toBe('ACTIVE');
    expect(complete.body.data.accessToken).toBeTruthy();

    const stored = await prisma.volunteer.findFirst({ where: { user: { email } } });
    expect(stored?.status).toBe('ACTIVE');
  });

  it('requires skills (step 2) before advancing', async () => {
    const account = await request(app)
      .post(`${AUTH}/register`)
      .send({ role: 'VOLUNTEER', email: 'skills@example.com', password: PASSWORD, fullName: 'Skills Test' });
    const auth = { Authorization: `Bearer ${account.body.data.registrationToken}` };

    const res = await request(app).post(`${BASE}/profile-skills`).set(auth).send({ skills: [] });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: { field: string }) => e.field === 'skills')).toBe(true);
  });
});
