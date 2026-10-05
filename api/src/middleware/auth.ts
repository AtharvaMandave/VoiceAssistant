// ─── Authentication Middleware ──────────────────────────────────────────────
// Verifies Bearer tokens (Firebase ID tokens or Dev tokens) and loads/creates
// the authenticated user record in MongoDB.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../config/firebase.js";
import { UserModel } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Missing or invalid Authorization header");
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw ApiError.unauthorized("Bearer token is empty");
    }

    const decoded = await verifyToken(token);

    // Find or bootstrap user record
    let user = await UserModel.findOne({ firebaseUid: decoded.uid });

    if (!user) {
      user = await UserModel.create({
        firebaseUid: decoded.uid,
        email: decoded.email || `${decoded.uid}@voiceflow.local`,
        name: decoded.name || "User",
        avatarUrl: decoded.picture || "",
      });
    }

    req.user = user;
    next();
  } catch (err: any) {
    if (err instanceof ApiError) {
      next(err);
    } else {
      next(ApiError.unauthorized(err.message || "Authentication failed"));
    }
  }
}
