export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class StepUpRequiredError extends ApiError {
  constructor(message = 'Recent authentication required for this action.') {
    super(message, 403, 'STEP_UP_REQUIRED');
    this.name = 'StepUpRequiredError';
  }
}

export class SessionExpiredError extends ApiError {
  constructor(message = 'Session expired. Please log in again.') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'SessionExpiredError';
  }
}
