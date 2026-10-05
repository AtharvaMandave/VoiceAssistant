// ─── Auth Controller ────────────────────────────────────────────────────────
// Handles authentication sessions, profile resolution, and tenant bootstrap.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { MembershipModel } from "../models/Membership.js";
import { OrganizationModel } from "../models/Organization.js";
import { sendSuccess } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * POST /api/auth/session
 * Establishes or syncs user session from auth token, resolves active organization.
 */
export async function getSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const organizationId = req.organizationId!;
    const membership = req.membership!;

    const activeOrganization = await OrganizationModel.findById(organizationId);
    if (!activeOrganization) {
      throw ApiError.notFound("Organization");
    }

    // Load all memberships with populated organization info
    const allMemberships = await MembershipModel.find({ userId: user._id })
      .populate("organizationId")
      .lean();

    const formattedMemberships = allMemberships
      .filter((m: any) => m.organizationId)
      .map((m: any) => {
        const org = m.organizationId;
        return {
          organization: {
            id: org._id.toString(),
            name: org.name,
            slug: org.slug,
            plan: org.plan,
            settings: org.settings,
            createdAt: org.createdAt?.toISOString(),
            updatedAt: org.updatedAt?.toISOString(),
          },
          role: m.role,
        };
      });

    sendSuccess(res, {
      user: {
        id: user._id.toString(),
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      activeOrganization: {
        id: activeOrganization._id.toString(),
        name: activeOrganization.name,
        slug: activeOrganization.slug,
        plan: activeOrganization.plan,
        settings: activeOrganization.settings,
        createdAt: activeOrganization.createdAt.toISOString(),
        updatedAt: activeOrganization.updatedAt.toISOString(),
      },
      role: membership.role,
      memberships: formattedMemberships,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Retrieves current authenticated user context and accessible organizations.
 */
export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  return getSession(req, res, next);
}
