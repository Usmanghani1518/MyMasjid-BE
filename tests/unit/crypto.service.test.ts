import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/audit.service', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
  AuditActions: { SENSITIVE_ENCRYPTED: 'SENSITIVE_ENCRYPTED', SENSITIVE_DECRYPTED: 'SENSITIVE_DECRYPTED' },
}));

import {
  encrypt,
  decrypt,
  hashToken,
  hashOtp,
  generateOtpCode,
  generateRandomToken,
  maskSensitive,
} from '@/services/crypto.service';

describe('crypto.service', () => {
  it('encrypts and decrypts a value round-trip', () => {
    const plaintext = '3520212345678';
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toContain(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces unique ciphertexts for identical input (random IV)', () => {
    expect(encrypt('same-value')).not.toBe(encrypt('same-value'));
  });

  it('throws when the ciphertext is tampered with', () => {
    const ciphertext = encrypt('secret-value');
    const tampered = ciphertext.slice(0, -2) + (ciphertext.endsWith('00') ? '11' : '00');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws on a malformed payload', () => {
    expect(() => decrypt('not-a-valid-payload')).toThrow();
  });

  it('hashes tokens and OTP codes deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
    expect(hashOtp('donor@example.com', '123456')).toBe(hashOtp('donor@example.com', '123456'));
    expect(hashOtp('donor@example.com', '123456')).not.toBe(hashOtp('donor@example.com', '654321'));
  });

  it('generates a numeric OTP of the requested length', () => {
    const code = generateOtpCode(6);
    expect(code).toMatch(/^\d{6}$/);
  });

  it('generates URL-safe random tokens', () => {
    const token = generateRandomToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('masks sensitive identifiers, keeping only the edges', () => {
    expect(maskSensitive('3520212345678')).toBe('35*********78');
    expect(maskSensitive('ab')).toBe('****');
  });
});
