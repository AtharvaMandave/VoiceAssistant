// ─── Response Helpers ───────────────────────────────────────────────────────
// Standardized response functions matching the API contract:
// { success: true, data, requestId } or { success: false, error, requestId }
// ─────────────────────────────────────────────────────────────────────────────

import type { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200
): void {
  res.status(statusCode).json({
    success: true,
    data,
    requestId: res.req.requestId,
  });
}

export function sendCreated<T>(res: Response, data: T): void {
  sendSuccess(res, data, 201);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string
): void {
  res.status(statusCode).json({
    success: false,
    error: { code, message },
    requestId: res.req.requestId,
  });
}

export function sendNoContent(res: Response): void {
  res.status(204).send();
}
