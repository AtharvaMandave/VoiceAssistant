// ─── Tenant Resolution & RBAC Middleware ─────────────────────────────────────
// Enforces multi-tenant data isolation by resolving and validating the active
// organization context for the authenticated user.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import type { Role } from "@voiceflow/shared";
import { MembershipModel } from "../models/Membership.js";
import { OrganizationModel } from "../models/Organization.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Ensures req.organizationId and req.membership are resolved.
 * If user does not belong to any organization yet, creates a default organization.
 */
export async function resolveTenant(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw ApiError.unauthorized("User is not authenticated");
    }

    const requestedOrgId = (req.headers["x-organization-id"] as string) || (req.query.organizationId as string);

    let membership = null;

    if (requestedOrgId) {
      if (!mongoose.Types.ObjectId.isValid(requestedOrgId)) {
        throw ApiError.badRequest("Invalid organization ID format", "INVALID_ORG_ID");
      }

      membership = await MembershipModel.findOne({
        userId: user._id,
        organizationId: requestedOrgId,
      });

      if (!membership) {
        throw ApiError.forbidden("Access denied to requested organization", "ORG_ACCESS_DENIED");
      }
    } else {
      // Find default or first membership
      membership = await MembershipModel.findOne({ userId: user._id }).sort({ createdAt: 1 });

      if (!membership) {
        // Auto-provision initial organization for new user
        const baseSlug = user.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 30) || "workspace";
        const uniqueSuffix = Math.random().toString(36).substring(2, 6);
        const slug = `${baseSlug}-${uniqueSuffix}`;

        const org = await OrganizationModel.create({
          name: `${user.name}'s Team`,
          slug,
          plan: "free",
          settings: {
            defaultLanguage: "en-US",
            timezone: "UTC",
          },
        });

        membership = await MembershipModel.create({
          organizationId: org._id,
          userId: user._id,
          role: "owner",
        });
      }
    }

    req.organizationId = membership.organizationId.toString();
    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * RBAC authorization guard.
 */
export function requireRole(allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.membership) {
      return next(ApiError.unauthorized("No active membership found"));
    }

    if (!allowedRoles.includes(req.membership.role)) {
      return next(
        ApiError.forbidden(
          `Insufficient role permissions. Required one of: ${allowedRoles.join(", ")}`,
          "INSUFFICIENT_ROLE"
        )
      );
    }

    next();
  };
}
