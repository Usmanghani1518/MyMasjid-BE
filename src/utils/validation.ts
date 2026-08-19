import { ZodError } from 'zod';
import { AppError } from '@/utils/helpers';
import { ApiError } from '@/utils/response';
import { ErrorCodes } from '@/utils/errorCodes';

/**
 * Converts a Zod v4 error into field-level API errors with stable codes.
 * `field` is the dotted path (e.g. "profile.phoneNumber"), codes come from ErrorCodes.
 */
export const toApiErrors = (error: ZodError): ApiError[] =>
  error.issues.map((issue): ApiError => {
    // The request schemas wrap input as { body, query, params }; strip that prefix
    // so field names in errors match the API payload (e.g. "email", not "body.email").
    const rawField = issue.path.join('.');
    const field = rawField.replace(/^(body|query|params)\./, '');
    const message = issue.message;

    switch (issue.code) {
      case 'invalid_type':
        if (issue.input === undefined) {
          return { field, code: ErrorCodes.FIELD_REQUIRED, message };
        }
        if (issue.expected === 'date') {
          return { field, code: ErrorCodes.INVALID_DATE_OF_BIRTH, message };
        }
        return { field, code: ErrorCodes.INVALID_TYPE, message };

      case 'too_small':
        return {
          field,
          code: field === 'password' ? ErrorCodes.PASSWORD_TOO_SHORT : ErrorCodes.TOO_SMALL,
          message,
        };

      case 'too_big':
        return {
          field,
          code: field === 'password' ? ErrorCodes.PASSWORD_TOO_LONG : ErrorCodes.TOO_BIG,
          message,
        };

      case 'invalid_format':
        if (field === 'password' && issue.format === 'regex') {
          return { field, code: ErrorCodes.PASSWORD_REQUIREMENTS, message };
        }
        if (issue.format === 'email') {
          return { field, code: ErrorCodes.INVALID_EMAIL, message };
        }
        if (issue.format === 'url') {
          return { field, code: ErrorCodes.INVALID_FORMAT, message };
        }
        return { field, code: ErrorCodes.INVALID_FORMAT, message };

      case 'invalid_value':
        return { field, code: ErrorCodes.INVALID_ENUM, message };

      case 'unrecognized_keys':
        return {
          field,
          code: ErrorCodes.INVALID_VALUE,
          message: `Unrecognized field${issue.keys.length > 1 ? 's' : ''}: ${issue.keys.join(', ')}`,
        };

      case 'custom': {
        // Schemas may attach a stable code via `params: { code }`.
        const customCode = (issue.params as { code?: string } | undefined)?.code;
        return { field, code: customCode ?? ErrorCodes.VALIDATION_FAILED, message };
      }

      default:
        return { field, code: ErrorCodes.VALIDATION_FAILED, message };
    }
  });

/**
 * Error carrying field-level validation failures. The error handler renders it
 * as `{ success: false, message, data: null, errors: ApiError[] }` with HTTP 400.
 */
export class ValidationError extends AppError {
  public readonly errors: ApiError[];

  constructor(errors: ApiError[], message = 'Validation failed') {
    super(message, 400);
    this.errors = errors;
  }
}
