export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "not_found");
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that") {
    super(message, 403, "forbidden");
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "Please sign in") {
    super(message, 401, "unauthorized");
  }
}
export class ValidationError extends AppError {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message, 400, "validation");
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "conflict");
  }
}
export class RateLimitError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(`Too many requests. Try again in ${retryAfterSeconds} seconds.`, 429, "rate_limited");
  }
}

/** Message safe to show users; internal errors are not leaked. */
export function publicMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  return "Something went wrong. Please try again.";
}
