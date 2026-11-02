import { describe, it, expect } from 'vitest';

import {
  hashToken,
  hashOtp,
  generateOtpCode,
  generateRandomToken,
  maskSensitive,
  encryptSensitive,
  decryptSensitive,
  isEncryptedSensitiveValue,
} from '@/services/crypto.service';

describe('crypto.service', () => {
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

  it('encrypts sensitive identifiers and detects tampering', () => {
    const key = 'unit-test-encryption-key-material-long-enough';
    const encrypted = encryptSensitive('3520212345678', key);
    expect(encrypted).not.toContain('3520212345678');
    expect(isEncryptedSensitiveValue(encrypted)).toBe(true);
    expect(decryptSensitive(encrypted, key)).toBe('3520212345678');
    const parts = encrypted.split(':');
    const tag = Buffer.from(parts[3], 'base64url');
    tag[0] ^= 1;
    parts[3] = tag.toString('base64url');
    expect(() => decryptSensitive(parts.join(':'), key)).toThrow();
  });
});
