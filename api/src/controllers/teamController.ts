// ─── Team & RBAC Controller ──────────────────────────────────────────────────
// Handles organization members, invitations, and role management.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { MembershipModel } from "../models/Membership.js";
import { UserModel } from "../models/User.js";
import { sendSuccess, sendCreated, sendNoContent } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";
import type { Role } from "@voiceflow/shared";

/**
 * GET /api/organizations/members
 * List all members of the current organization.
 */
export async function listTeamMembers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const memberships = await MembershipModel.find({ organizationId })
      .populate("userId")
      .sort({ createdAt: 1 })
      .lean();

    const members = memberships
      .filter((m: any) => m.userId)
      .map((m: any) => {
        const u = m.userId;
        return {
          id: m._id.toString(),
          userId: u._id.toString(),
          name: u.name || u.email.split("@")[0],
          email: u.email,
          avatarUrl: u.avatarUrl || null,
          role: m.role as Role,
          createdAt: m.createdAt.toISOString(),
        };
      });

    sendSuccess(res, members);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/organizations/members
 * Invite a member to the organization with a specified role.
 */
export async function inviteTeamMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { email, role, name } = req.body;

    // Find or create placeholder user
    let user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      user = await UserModel.create({
        firebaseUid: `invited_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        email: email.toLowerCase(),
        name: name || email.split("@")[0],
      });
    }

    // Check if membership already exists
    const existing = await MembershipModel.findOne({
      organizationId,
      userId: user._id,
    });

    if (existing) {
      throw ApiError.badRequest("This user is already a member of this organization");
    }

    const membership = await MembershipModel.create({
      organizationId,
      userId: user._id,
      role,
    });

    sendCreated(res, {
      id: membership._id.toString(),
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
      role: membership.role,
      createdAt: membership.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/organizations/members/:id
 * Update role of an existing member.
 */
export async function updateTeamMemberRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;
    const { role } = req.body;

    const membership = await MembershipModel.findOne({
      _id: id,
      organizationId,
    });

    if (!membership) {
      throw ApiError.notFound("Team member not found");
    }

    // Guard: Prevent demoting the last owner
    if (membership.role === "owner" && role !== "owner") {
      const ownerCount = await MembershipModel.countDocuments({
        organizationId,
        role: "owner",
      });
      if (ownerCount <= 1) {
        throw ApiError.badRequest("Cannot demote the only organization owner");
      }
    }

    membership.role = role;
    await membership.save();

    sendSuccess(res, {
      id: membership._id.toString(),
      role: membership.role,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/organizations/members/:id
 * Remove a member from the organization.
 */
export async function removeTeamMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;

    const membership = await MembershipModel.findOne({
      _id: id,
      organizationId,
    });

    if (!membership) {
      throw ApiError.notFound("Team member not found");
    }

    // Guard: Prevent removing the last owner
    if (membership.role === "owner") {
      const ownerCount = await MembershipModel.countDocuments({
        organizationId,
        role: "owner",
      });
      if (ownerCount <= 1) {
        throw ApiError.badRequest("Cannot remove the only organization owner");
      }
    }

    await membership.deleteOne();
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}
