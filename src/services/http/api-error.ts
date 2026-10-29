import type { ApiError as ApiErrorBody } from '../../../packages/contracts/src';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly requestId?: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
  }

  static from(status: number, body: ApiErrorBody) {
    return new ApiError(status, body.error.code, body.error.message, body.error.requestId, body.error.details);
  }
}
