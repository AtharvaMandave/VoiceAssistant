// ─── API Key Controller ───────────────────────────────────────────────────────
// Handles generation, listing, and revocation of organization API keys.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { ApiKeyModel } from "../models/ApiKey.js";
import { sendSuccess, sendCreated, sendNoContent } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * GET /api/api-keys
 * List all active API keys for the current organization.
 */
export async function listApiKeys(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const keys = await ApiKeyModel.find({ organizationId })
      .sort({ createdAt: -1 })
      .lean();

    sendSuccess(
      res,
      keys.map((k: any) => ({
        id: k._id.toString(),
        organizationId: k.organizationId.toString(),
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        lastUsedAt: k.lastUsedAt?.toISOString() || null,
        expiresAt: k.expiresAt?.toISOString() || null,
        createdAt: k.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/api-keys
 * Generate a new scoped API key. Returns the plaintext secret key once.
 */
export async function createApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const user = req.user!;
    const { name, scopes, expiresInDays } = req.body;

    // Generate random 24-byte secret
    const rawEntropy = crypto.randomBytes(24).toString("hex");
    const secretKey = `vf_live_${rawEntropy}`;
    const keyPrefix = `vf_live_${rawEntropy.slice(0, 6)}...${rawEntropy.slice(-4)}`;
    
    // Hash key with SHA-256 for secure storage
    const keyHash = crypto.createHash("sha256").update(secretKey).digest("hex");

    let expiresAt: Date | undefined;
    if (expiresInDays) {
      expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    }

    const doc = await ApiKeyModel.create({
      organizationId,
      createdBy: user._id,
      name,
      keyPrefix,
      keyHash,
      scopes: scopes || ["*"],
      expiresAt,
    });

    sendCreated(res, {
      apiKey: {
        id: doc._id.toString(),
        organizationId: doc.organizationId.toString(),
        name: doc.name,
        keyPrefix: doc.keyPrefix,
        scopes: doc.scopes,
        expiresAt: doc.expiresAt?.toISOString() || null,
        createdAt: doc.createdAt.toISOString(),
      },
      secretKey, // Returned only ONCE upon creation
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/api-keys/:id
 * Revokes / deletes an API key.
 */
export async function revokeApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;

    const result = await ApiKeyModel.findOneAndDelete({
      _id: id,
      organizationId,
    });

    if (!result) {
      throw ApiError.notFound("API key not found");
    }

    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}
