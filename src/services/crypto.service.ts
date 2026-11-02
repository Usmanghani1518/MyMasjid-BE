import crypto from 'node:crypto';
import { config } from '@/config';

const ENCRYPTED_VALUE_PREFIX = 'enc:v1:';

const encryptionKey = (keyMaterial = config.ENCRYPTION_KEY): Buffer => {
  if (!keyMaterial) throw new Error('ENCRYPTION_KEY must be configured to store sensitive identifiers');
  return crypto.createHash('sha256').update(keyMaterial).digest();
};

export const isEncryptedSensitiveValue = (value: string): boolean => value.startsWith('enc:');

export const encryptSensitive = (value: string, keyMaterial?: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(keyMaterial), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_VALUE_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
};

export const decryptSensitive = (value: string, keyMaterial?: string): string => {
  if (!value.startsWith('enc:')) return value;

  const [prefix, version, ivValue, tagValue, ciphertextValue, ...extra] = value.split(':');
  if (prefix !== 'enc' || version !== 'v1' || !ivValue || !tagValue || ciphertextValue === undefined || extra.length) {
    throw new Error('Unsupported encrypted identifier format');
  }

  const iv = Buffer.from(ivValue, 'base64url');
  const tag = Buffer.from(tagValue, 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted identifier format');

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(keyMaterial), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

export const hashToken = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export const hashOtp = (email: string, code: string): string =>
  crypto
    .createHmac('sha256', config.ENCRYPTION_KEY ?? config.JWT_SECRET)
    .update(`otp:v1:${email.trim().toLowerCase()}:${code}`)
    .digest('hex');

export const generateRandomToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString('base64url');

export const generateOtpCode = (length: number): string => {
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(crypto.randomInt(min, max)).padStart(length, '0');
};

export const maskSensitive = (value: string): string => {
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`;
};
