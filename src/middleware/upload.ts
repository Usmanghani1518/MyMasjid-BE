import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { config } from '@/config';
import { AppError } from '@/utils/helpers';
import { ErrorCodes } from '@/utils/errorCodes';
import { ALLOWED_MIME_TYPES } from '@/services/upload.service';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('File type not allowed', 400, true, ErrorCodes.FILE_TYPE_NOT_ALLOWED));
    }
  },
});

/**
 * Parses a single multipart `file` field into memory.
 * Multer errors (size limit, wrong field, etc.) are converted to envelope errors.
 */
export const uploadSingleDocument = (req: Request, res: Response, next: NextFunction): void => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(new AppError(`File exceeds the ${config.MAX_UPLOAD_SIZE_MB}MB limit`, 413, true, ErrorCodes.FILE_TOO_LARGE));
          return;
        }
        next(new AppError('Upload error', 400, true, ErrorCodes.INVALID_VALUE));
        return;
      }
      next(err);
      return;
    }
    next();
  });
};
