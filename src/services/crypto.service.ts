import crypto from 'node:crypto';
import { config } from '@/config';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { audit, AuditActions } from '@/services/audit.service';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

/** Derives a deterministic 32-byte key from the configured secret. */
const getKey = (): Buffer => crypto.createHash('sha256').update(config.ENCRYPTION_KEY).digest();

interface CryptoContext {
  entityType?: string;
  entityId?: string;
}

/**
 * AES-256-GCM encryption with a random 12-byte IV and authentication tag.
 * Output format: `aes-256-gcm:v1:<iv-b64>:<tag-b64>:<ciphertext-b64>` (versioned
 * so the format can evolve without breaking stored ciphertexts).
 */
export const encrypt = (plaintext: string, context?: CryptoContext): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = [ALGORITHM, VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');

  void audit({
    action: AuditActions.SENSITIVE_ENCRYPTED,
    entityType: context?.entityType,
    entityId: context?.entityId,
    metadata: { algorithm: ALGORITHM },
  });

  return payload;
};

/** Decrypts a value produced by {@link encrypt}. Throws on tampering/wrong key. */
export const decrypt = (payload: string, context?: CryptoContext): string => {
  const [algo, version, ivB64, tagB64, dataB64] = payload.split(':');
  if (algo !== ALGORITHM || version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new AppError('Invalid encrypted payload', 500, true, ErrorCodes.INTERNAL_SERVER_ERROR);
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);

    void audit({
      action: AuditActions.SENSITIVE_DECRYPTED,
      entityType: context?.entityType,
      entityId: context?.entityId,
    });

    return decrypted.toString('utf8');
  } catch {
    throw new AppError('Failed to decrypt sensitive data', 500, true, ErrorCodes.INTERNAL_SERVER_ERROR);
  }
};

/** SHA-256 hex digest (used for opaque refresh tokens + OTP codes). */
export const hashToken = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

/** Domain-separated OTP hash so the same code under different emails yields different hashes. */
export const hashOtp = (email: string, code: string): string =>
  crypto.createHash('sha256').update(`${email.toLowerCase()}:${code}`).digest('hex');

/** Cryptographically random token (base64url, no padding). */
export const generateRandomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');

/** Cryptographically random numeric OTP code of the given length. */
export const generateOtpCode = (length: number): string => {
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(crypto.randomInt(min, max)).padStart(length, '0');
};

/** Masks a sensitive identifier for safe display, e.g. "12345-6789012-3" → "12**********-3". */
export const maskSensitive = (value: string): string => {
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`;
};
