import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/audit.service', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
  AuditActions: { FILE_UPLOADED: 'FILE_UPLOADED', FILE_UPLOAD_REJECTED: 'FILE_UPLOAD_REJECTED' },
}));

import { detectFileType, validateDocument } from '@/services/upload.service';
import { config } from '@/config';

const PDF_BUFFER = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
const PNG_BUFFER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest of png'),
]);
const JPEG_BUFFER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('rest of jpeg')]);
const MAX = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024;

describe('upload.service file validation', () => {
  it('detects the real type from magic bytes regardless of extension', () => {
    expect(detectFileType(PDF_BUFFER)?.mimeType).toBe('application/pdf');
    expect(detectFileType(PNG_BUFFER)?.mimeType).toBe('image/png');
    expect(detectFileType(JPEG_BUFFER)?.mimeType).toBe('image/jpeg');
  });

  it('returns null for unrecognized content', () => {
    expect(detectFileType(Buffer.from('hello world, definitely not a file type'))).toBeNull();
  });

  it('accepts a file whose declared MIME matches its magic bytes', () => {
    expect(() =>
      validateDocument({ originalname: 'cert.pdf', mimetype: 'application/pdf', size: PDF_BUFFER.length, buffer: PDF_BUFFER }),
    ).not.toThrow();
  });

  it('rejects a renamed file whose declared MIME does not match its magic bytes', () => {
    // A PNG pretending to be a PDF.
    expect(() =>
      validateDocument({ originalname: 'fake.pdf', mimetype: 'application/pdf', size: PNG_BUFFER.length, buffer: PNG_BUFFER }),
    ).toThrow(/content does not match/);
  });

  it('rejects a file whose declared MIME is not allowed', () => {
    expect(() =>
      validateDocument({ originalname: 'evil.txt', mimetype: 'text/plain', size: 10, buffer: Buffer.from('txt content') }),
    ).toThrow(/not allowed/);
  });

  it('rejects content that matches no known signature', () => {
    expect(() =>
      validateDocument({ originalname: 'x.png', mimetype: 'image/png', size: 16, buffer: Buffer.from('not really a png') }),
    ).toThrow(/does not match an allowed type/);
  });

  it('rejects files over the configured size limit', () => {
    expect(() =>
      validateDocument({ originalname: 'big.pdf', mimetype: 'application/pdf', size: MAX + 1, buffer: PDF_BUFFER }),
    ).toThrow(/limit/);
  });

  it('rejects an empty file', () => {
    expect(() =>
      validateDocument({ originalname: 'empty.pdf', mimetype: 'application/pdf', size: 0, buffer: Buffer.alloc(0) }),
    ).toThrow(/file is required/);
  });
});
