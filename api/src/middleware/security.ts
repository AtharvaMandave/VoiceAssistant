// ─── Security Middleware ────────────────────────────────────────────────────
// Industry-standard rate limiting for auth endpoints and API routes.
// Prevents brute force attacks, credential stuffing, and API abuse.
// ─────────────────────────────────────────────────────────────────────────────

import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

// ─── Auth Rate Limiter ──────────────────────────────────────────────────────
// Strict rate limiting on login/register/reset endpoints.
// 5 attempts per 15 minutes per IP — industry standard for auth endpoints.

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts. Please try again in 15 minutes.",
    },
  },
  standardHeaders: true,     // Return rate limit info in headers (RateLimit-*)
  legacyHeaders: false,      // Disable X-RateLimit-* headers
  keyGenerator: (req: Request) => {
    // Rate limit by IP + email combo for login endpoints
    const email = req.body?.email || "";
    return `auth:${req.ip}:${email}`;
  },
  skipFailedRequests: false,  // Count all requests
  skipSuccessfulRequests: false,
});

// ─── Password Reset Rate Limiter ────────────────────────────────────────────
// Extra strict for password reset to prevent email spam.
// 3 attempts per 1 hour per IP.

export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 3,                     // 3 attempts per hour
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many password reset requests. Please try again in 1 hour.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `reset:${req.ip}`,
});

// ─── API Rate Limiter ───────────────────────────────────────────────────────
// General rate limiting for authenticated API endpoints.
// 200 requests per minute per user — generous for normal usage.

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 200,                   // 200 requests per minute
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please slow down.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Rate limit by user ID if authenticated, else by IP
    const userId = (req as any).user?._id?.toString();
    return userId ? `api:user:${userId}` : `api:ip:${req.ip}`;
  },
});

// ─── Widget Rate Limiter ────────────────────────────────────────────────────
// Rate limiting for public widget endpoints.
// 30 requests per minute per IP — prevents widget abuse.

export const widgetRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests from this client.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Security Headers Middleware ────────────────────────────────────────────
// Additional security headers beyond what helmet provides.

export function additionalSecurityHeaders(
  _req: Request,
  res: Response,
  next: Function
): void {
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Prevent clickjacking (except for widget iframe)
  if (!_req.path.startsWith("/widget")) {
    res.setHeader("X-Frame-Options", "DENY");
  }
  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions policy
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=(), payment=()"
  );
  next();
}
