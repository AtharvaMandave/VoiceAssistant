// ─── Centralized Error Handler ──────────────────────────────────────────────
// Catches all errors and returns a consistent JSON response.
// ApiError instances produce structured client-safe responses.
// Unknown errors produce a generic 500 to avoid leaking internals.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError.js";
import { env } from "../config/env.js";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  console.error(`[${req.requestId}] Error:`, {
    name: err.name,
    message: err.message,
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  });

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
      requestId: req.requestId,
    });
    return;
  }

  // Mongoose validation errors
  if (err.name === "ValidationError") {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: err.message,
      },
      requestId: req.requestId,
    });
    return;
  }

  // Default: internal server error — don't leak details in production
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message:
        env.NODE_ENV === "development"
          ? err.message
          : "An internal server error occurred",
    },
    requestId: req.requestId,
  });
}
