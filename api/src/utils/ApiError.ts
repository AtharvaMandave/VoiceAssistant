// ─── Custom API Error ───────────────────────────────────────────────────────
// Provides structured errors with HTTP status codes and machine-readable codes.
// ─────────────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = "ApiError";

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }

  // ─── Common factory methods ─────────────────────────────────────────────

  static badRequest(message: string, code = "BAD_REQUEST"): ApiError {
    return new ApiError(400, code, message);
  }

  static unauthorized(message = "Unauthorized", code = "UNAUTHORIZED"): ApiError {
    return new ApiError(401, code, message);
  }

  static forbidden(message = "Forbidden", code = "FORBIDDEN"): ApiError {
    return new ApiError(403, code, message);
  }

  static notFound(resource: string, code = "NOT_FOUND"): ApiError {
    return new ApiError(404, code, `${resource} not found`);
  }

  static conflict(message: string, code = "CONFLICT"): ApiError {
    return new ApiError(409, code, message);
  }

  static tooManyRequests(message = "Rate limit exceeded", code = "RATE_LIMITED"): ApiError {
    return new ApiError(429, code, message);
  }

  static internal(message = "Internal server error", code = "INTERNAL_ERROR"): ApiError {
    return new ApiError(500, code, message);
  }
}
