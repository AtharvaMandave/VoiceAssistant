// ─── 404 Not Found Handler ──────────────────────────────────────────────────
// Catches requests that don't match any registered route.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response } from "express";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
    requestId: req.requestId,
  });
}
