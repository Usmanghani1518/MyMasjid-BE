import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '@/config';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { audit, AuditActions } from '@/services/audit.service';

export type DocumentPurpose = 'TRUSTEE_ID' | 'REGISTRATION_CERT' | 'CONSTITUTION' | 'OTHER';

interface FileSignature {
  mimeType: string;
  extension: string;
  match: (buffer: Buffer) => boolean;
}

/** Magic-byte signatures for the allowed document types. */
const SIGNATURES: FileSignature[] = [
  {
    mimeType: 'application/pdf',
    extension: 'pdf',
    match: (b) => b.length >= 5 && b.subarray(0, 5).toString('ascii') === '%PDF-',
  },
  {
    mimeType: 'image/png',
    extension: 'png',
    match: (b) =>
      b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    match: (b) => b.length >= 3 && b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  },
];

export const ALLOWED_MIME_TYPES = SIGNATURES.map((s) => s.mimeType);

export interface DocumentInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface DetectedType {
  mimeType: string;
  extension: string;
}

/** Identifies the real file type from its signature bytes (independent of the declared MIME). */
export const detectFileType = (buffer: Buffer): DetectedType | null => {
  const match = SIGNATURES.find((s) => s.match(buffer));
  return match ? { mimeType: match.mimeType, extension: match.extension } : null;
};

/**
 * Validates a document by size, declared MIME type, AND magic bytes.
 * The declared MIME must match the detected signature — a `.pdf` that is really
 * a script (renamed) is rejected by the signature check.
 */
export const validateDocument = (file: DocumentInput): DetectedType => {
  if (!file?.buffer || file.size === 0) {
    throw new AppError('A file is required', 400, true, ErrorCodes.FILE_REQUIRED);
  }
  const maxBytes = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new AppError(`File exceeds the ${config.MAX_UPLOAD_SIZE_MB}MB limit`, 413, true, ErrorCodes.FILE_TOO_LARGE);
  }
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new AppError('File type not allowed', 400, true, ErrorCodes.FILE_TYPE_NOT_ALLOWED);
  }

  const detected = detectFileType(file.buffer);
  if (!detected) {
    throw new AppError('File content does not match an allowed type', 400, true, ErrorCodes.INVALID_FILE_SIGNATURE);
  }
  if (detected.mimeType !== file.mimetype) {
    throw new AppError('File content does not match its declared type', 400, true, ErrorCodes.INVALID_FILE_SIGNATURE);
  }

  return detected;
};

export interface SaveDocumentMeta {
  uploaderId: string;
  masjidId?: string;
  purpose?: DocumentPurpose;
}

/**
 * Validates + stores an uploaded document with a randomized filename and
 * registers it in the database. Returns the created UploadedDocument record.
 */
export const saveDocument = async (
  file: DocumentInput,
  meta: SaveDocumentMeta,
): Promise<Awaited<ReturnType<typeof prisma.uploadedDocument.create>>> => {
  const { extension } = validateDocument(file);
  const storedName = `${crypto.randomUUID()}.${extension}`;
  const filePath = path.join(config.UPLOAD_DIR, storedName);

  await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
  await fs.writeFile(filePath, file.buffer);

  try {
    const doc = await prisma.uploadedDocument.create({
      data: {
        originalName: file.originalname,
        storedName,
        mimeType: file.mimetype,
        size: file.size,
        purpose: meta.purpose,
        filePath,
        uploaderId: meta.uploaderId,
        masjidId: meta.masjidId,
      },
    });

    void audit({
      action: AuditActions.FILE_UPLOADED,
      actorId: meta.uploaderId,
      entityType: 'UploadedDocument',
      entityId: doc.id,
      metadata: { originalName: file.originalname, mimeType: file.mimetype, size: file.size, purpose: meta.purpose, masjidId: meta.masjidId },
    });

    return doc;
  } catch (err) {
    // Roll back the file write if the DB record fails.
    await fs.unlink(filePath).catch(() => undefined);
    throw err;
  }
};

/** Removes a stored document file (e.g. on record deletion). Safe to call on missing files. */
export const deleteStoredFile = async (filePath: string): Promise<void> => {
  await fs.unlink(filePath).catch(() => undefined);
};
