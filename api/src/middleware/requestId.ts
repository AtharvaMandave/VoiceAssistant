// ─── Request ID Middleware ───────────────────────────────────────────────────
// Attaches a unique request ID to every incoming request for tracing.
// The ID is also set as a response header for client-side correlation.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers["x-request-id"] as string) || `req_${uuidv4()}`;
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
