import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, describeIfDb, truncateAll, installEmailCapture, registerDonor } from '../helpers';

const SEND = '/api/v1/auth/send-otp';
const VERIFY = '/api/v1/auth/verify-otp';

describeIfDb('OTP security', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('locks verification after 5 failed attempts for 15 minutes', async () => {
    const capture = installEmailCapture();
    const { auth } = await registerDonor('otp-lock@example.com');
    await request(app).post(SEND).set(auth).send({});
    const realCode = capture.getOtpCode();

    for (let i = 0; i < 5; i += 1) {
      const wrong = await request(app).post(VERIFY).set(auth).send({ code: '000000' });
      expect(wrong.status).toBe(400);
      expect(wrong.body.errors[0].code).toBe('OTP_INVALID');
    }

    // Even the correct code is now rejected while locked.
    const locked = await request(app).post(VERIFY).set(auth).send({ code: realCode });
    expect(locked.status).toBe(429);
    expect(locked.body.errors[0].code).toBe('OTP_LOCKED');
  });

  it('enforces the 60-second resend cooldown', async () => {
    installEmailCapture();
    const { auth } = await registerDonor('otp-cooldown@example.com');

    const first = await request(app).post(SEND).set(auth).send({});
    expect(first.status).toBe(200);

    const second = await request(app).post(SEND).set(auth).send({});
    expect(second.status).toBe(429);
    expect(second.body.errors[0].code).toBe('OTP_COOLDOWN');
  });

  it('blocks resends after the maximum number of resends', async () => {
    installEmailCapture();
    const { auth } = await registerDonor('otp-resends@example.com');

    // Bypass the cooldown by backdating the last record in the DB.
    const prisma = (await import('@/config/database')).prisma;
    const seed = await request(app).post(SEND).set(auth).send({});
    expect(seed.status).toBe(200);

    for (let i = 0; i < 5; i += 1) {
      await prisma.otp.updateMany({
        where: { email: 'otp-resends@example.com' },
        data: { lastSentAt: new Date(Date.now() - 120_000), resendCount: i },
      });
      const res = await request(app).post(SEND).set(auth).send({});
      expect(res.status).toBe(200);
    }

    // Set resendCount to the max → the next send is rejected.
    await prisma.otp.updateMany({ where: { email: 'otp-resends@example.com' }, data: { resendCount: 5 } });
    const blocked = await request(app).post(SEND).set(auth).send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.errors[0].code).toBe('OTP_MAX_RESENDS');
  });

  it('rejects an expired code', async () => {
    const capture = installEmailCapture();
    const { auth } = await registerDonor('otp-expiry@example.com');
    await request(app).post(SEND).set(auth).send({});
    const code = capture.getOtpCode();

    const prisma = (await import('@/config/database')).prisma;
    await prisma.otp.updateMany({ where: { email: 'otp-expiry@example.com' }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    const res = await request(app).post(VERIFY).set(auth).send({ code });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].code).toBe('OTP_EXPIRED');
  });
});
