import crypto from 'node:crypto';

export const hashToken = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export const hashOtp = (email: string, code: string): string =>
  crypto.createHash('sha256').update(`${email.trim().toLowerCase()}:${code}`).digest('hex');

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
