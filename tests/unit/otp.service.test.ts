import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OtpPurpose } from '@/generated/prisma/enums';

// In-memory OTP store shared between the prisma mock and the tests.
const { store, sentCodes } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const sentCodes: string[] = [];
  return { store, sentCodes };
});

vi.mock('@/config/database', () => ({
  prisma: {
    otp: {
      findFirst: vi.fn(async ({ where }: { where: { email: string; purpose: string } }) => {
        const key = `${where.email}:${where.purpose}`;
        return store.get(key) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const key = `${data.email}:${data.purpose}`;
        const record = { id: `otp-${store.size + 1}`, attempts: 0, ...data, createdAt: new Date() };
        store.set(key, record);
        return record;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        for (const record of store.values()) {
          if (record.id === where.id) {
            Object.assign(record, data);
            return record;
          }
        }
        throw new Error('otp not found');
      }),
    },
  },
}));

vi.mock('@/services/email.service', () => ({
  sendDonorOtpEmail: vi.fn(async (_to: string, opts: { code: string }) => {
    sentCodes.push(opts.code);
  }),
  sendVolunteerOtpEmail: vi.fn(async (_to: string, opts: { code: string }) => {
    sentCodes.push(opts.code);
  }),
  sendResendOtpEmail: vi.fn(async (_to: string, opts: { code: string }) => {
    sentCodes.push(opts.code);
  }),
}));

vi.mock('@/services/audit.service', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
  AuditActions: { OTP_GENERATED: 'OTP_GENERATED', OTP_RESENT: 'OTP_RESENT', OTP_VERIFIED: 'OTP_VERIFIED', OTP_VERIFY_FAILED: 'OTP_VERIFY_FAILED', OTP_LOCKED: 'OTP_LOCKED' },
}));

import { sendOtp, verifyOtp } from '@/services/otp.service';

const EMAIL = 'donor@example.com';
const PURPOSE = OtpPurpose.DONOR_REGISTRATION;
const KEY = `${EMAIL}:${PURPOSE}`;

const lastCode = (): string => sentCodes[sentCodes.length - 1];
const record = () => store.get(KEY);

/** Backdates the last-sent timestamp so the resend cooldown is satisfied. */
const expireCooldown = (): void => {
  if (record()) record()!.lastSentAt = new Date(0);
};

describe('otp.service', () => {
  beforeEach(() => {
    store.clear();
    sentCodes.length = 0;
  });

  it('sends a 6-digit code and stores a hash, not the plaintext', async () => {
    await sendOtp(EMAIL, PURPOSE);
    expect(lastCode()).toMatch(/^\d{6}$/);
    expect(record()!.codeHash).not.toBe(lastCode());
    expect(String(record()!.codeHash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('enforces the resend cooldown', async () => {
    await sendOtp(EMAIL, PURPOSE);
    const res = sendOtp(EMAIL, PURPOSE);
    await expect(res).rejects.toMatchObject({ code: 'OTP_COOLDOWN' });
  });

  it('allows a resend after the cooldown and increments resendCount', async () => {
    await sendOtp(EMAIL, PURPOSE);
    expireCooldown();
    await sendOtp(EMAIL, PURPOSE);
    expect(record()!.resendCount).toBe(1);
  });

  it('blocks resends beyond the maximum', async () => {
    await sendOtp(EMAIL, PURPOSE);
    expireCooldown();
    const rec = record()!;
    rec.resendCount = 5; // 5 resends already used
    await expect(sendOtp(EMAIL, PURPOSE)).rejects.toMatchObject({ code: 'OTP_MAX_RESENDS' });
  });

  it('verifies a correct code', async () => {
    await sendOtp(EMAIL, PURPOSE);
    await verifyOtp(EMAIL, PURPOSE, lastCode());
    expect(record()!.verifiedAt).toBeInstanceOf(Date);
  });

  it('rejects an incorrect code and increments the attempt counter', async () => {
    await sendOtp(EMAIL, PURPOSE);
    await expect(verifyOtp(EMAIL, PURPOSE, '000000')).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect(record()!.attempts).toBe(1);
  });

  it('locks the email after 5 failed attempts', async () => {
    await sendOtp(EMAIL, PURPOSE);
    for (let i = 0; i < 4; i += 1) {
      await expect(verifyOtp(EMAIL, PURPOSE, '000000')).rejects.toMatchObject({ code: 'OTP_INVALID' });
    }
    // 5th failure triggers the lockout.
    await expect(verifyOtp(EMAIL, PURPOSE, '000000')).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect(record()!.lockUntil).toBeInstanceOf(Date);

    // Even a correct code is now rejected while locked.
    await expect(verifyOtp(EMAIL, PURPOSE, lastCode())).rejects.toMatchObject({ code: 'OTP_LOCKED' });
  });

  it('rejects an expired code', async () => {
    await sendOtp(EMAIL, PURPOSE);
    record()!.expiresAt = new Date(Date.now() - 60_000);
    await expect(verifyOtp(EMAIL, PURPOSE, lastCode())).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });
});
