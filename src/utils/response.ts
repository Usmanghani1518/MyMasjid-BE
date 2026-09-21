import { Response } from 'express';






export interface ApiError {
  
  field?: string;
  
  code: string;
  
  message: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
  errors: ApiError[];
  error?: Record<string, unknown>;
}


export const sendSuccess = <T>(
  res: Response,
  data: T = null as T,
  message = 'Success',
  status = 200,
): Response => res.status(status).json({ success: true, message, data, errors: [] } satisfies ApiResponse<T>);


export const errorBody = (
  message: string,
  errors: ApiError[] = [{ code: 'INTERNAL_SERVER_ERROR', message }],
  extra: Record<string, unknown> = {},
): ApiResponse<null> => ({
  success: false,
  message,
  data: null,
  errors,
  error: {
    code: errors.some((e) => e.field) ? 'VALIDATION_ERROR' : errors[0]?.code ?? 'SERVER_ERROR',
    fields: Object.fromEntries(errors.filter((e) => e.field).map((e) => [e.field, e.message])),
    ...extra,
  },
});


export const errorBodyFromCode = (code: string, message: string): ApiResponse<null> =>
  errorBody(message, [{ code, message }]);
