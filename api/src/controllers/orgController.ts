// ─── Organization Controller ──────────────────────────────────────────────
// Handles multi-tenant organization creation, listing, and switching.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { OrganizationModel } from "../models/Organization.js";
import { MembershipModel } from "../models/Membership.js";
import { sendSuccess, sendCreated } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * GET /api/organizations
 * List all organizations the user is a member of.
 */
export async function listOrganizations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const memberships = await MembershipModel.find({ userId: user._id })
      .populate("organizationId")
      .lean();

    const data = memberships
      .filter((m: any) => m.organizationId)
      .map((m: any) => {
        const org = m.organizationId;
        return {
          id: org._id.toString(),
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          settings: org.settings,
          role: m.role,
          createdAt: org.createdAt?.toISOString(),
          updatedAt: org.updatedAt?.toISOString(),
        };
      });

    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/organizations
 * Creates a new organization and grants caller Owner role.
 */
export async function createOrganization(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const { name, slug: providedSlug } = req.body;

    let slug = providedSlug;
    if (!slug) {
      const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 30);
      const rand = Math.random().toString(36).substring(2, 6);
      slug = `${base}-${rand}`;
    }

    // Check slug collision
    const existing = await OrganizationModel.findOne({ slug });
    if (existing) {
      throw ApiError.conflict(`Organization slug '${slug}' is already in use`);
    }

    const org = await OrganizationModel.create({
      name,
      slug,
      plan: "free",
      settings: {
        defaultLanguage: "en-US",
        timezone: "UTC",
      },
    });

    const membership = await MembershipModel.create({
      organizationId: org._id,
      userId: user._id,
      role: "owner",
    });

    sendCreated(res, {
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      settings: org.settings,
      role: membership.role,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/organizations/switch
 * Validate access to an organization and return active membership context.
 */
export async function switchOrganization(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user!;
    const { organizationId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(organizationId)) {
      throw ApiError.badRequest("Invalid organization ID", "INVALID_ORG_ID");
    }

    const membership = await MembershipModel.findOne({
      userId: user._id,
      organizationId,
    }).populate("organizationId");

    if (!membership || !membership.organizationId) {
      throw ApiError.forbidden("You do not have access to this organization", "ORG_ACCESS_DENIED");
    }

    const org: any = membership.organizationId;
    sendSuccess(res, {
      organization: {
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        settings: org.settings,
        createdAt: org.createdAt?.toISOString(),
        updatedAt: org.updatedAt?.toISOString(),
      },
      role: membership.role,
    });
  } catch (err) {
    next(err);
  }
}
