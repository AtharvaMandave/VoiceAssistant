// ─── Billing & Usage Controller ──────────────────────────────────────────────
// Manages organization plan tiers, quotas, usage summaries, and upgrades.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { OrganizationModel } from "../models/Organization.js";
import { AgentModel } from "../models/Agent.js";
import { MembershipModel } from "../models/Membership.js";
import { ConversationModel } from "../models/Conversation.js";
import { sendSuccess } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";
import type { OrgPlan, OrgUsageSummary } from "@voiceflow/shared";

// Plan limits definition
const PLAN_LIMITS: Record<
  OrgPlan,
  {
    voiceMinutes: number;
    tokens: number;
    agents: number;
    teamMembers: number;
    storageMb: number;
  }
> = {
  free: {
    voiceMinutes: 30,
    tokens: 100000,
    agents: 2,
    teamMembers: 2,
    storageMb: 25,
  },
  pro: {
    voiceMinutes: 300,
    tokens: 2000000,
    agents: 10,
    teamMembers: 10,
    storageMb: 500,
  },
  enterprise: {
    voiceMinutes: 5000,
    tokens: 25000000,
    agents: 100,
    teamMembers: 50,
    storageMb: 5000,
  },
};

/**
 * GET /api/billing/usage
 * Get the current organization's usage, quotas, and plan tier.
 */
export async function getUsageAndBilling(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const org = await OrganizationModel.findById(organizationId);
    if (!org) {
      throw ApiError.notFound("Organization not found");
    }

    const plan = (org.plan || "free") as OrgPlan;
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // 1. Current active agents count
    const agentCount = await AgentModel.countDocuments({
      organizationId,
      status: { $ne: "archived" },
    });

    // 2. Current team members count
    const memberCount = await MembershipModel.countDocuments({
      organizationId,
    });

    // 3. Conversation & voice seconds aggregation
    const convStats = await ConversationModel.aggregate([
      { $match: { organizationId: org._id } },
      {
        $group: {
          _id: null,
          totalDurationSeconds: { $sum: "$metrics.durationSeconds" },
          totalTurns: { $sum: "$metrics.turnCount" },
        },
      },
    ]);

    const totalSeconds = convStats[0]?.totalDurationSeconds || 0;
    const usedVoiceMinutes = Math.round((totalSeconds / 60) * 10) / 10;
    const estimatedTokens = (convStats[0]?.totalTurns || 0) * 350;

    // Storage estimation
    const storageUsedMb = Math.round((agentCount * 1.5 + 2.5) * 10) / 10;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const summary: OrgUsageSummary = {
      organizationId: org._id.toString(),
      plan,
      voiceMinutes: {
        used: usedVoiceMinutes,
        limit: limits.voiceMinutes,
        percentage: Math.min(100, Math.round((usedVoiceMinutes / limits.voiceMinutes) * 100)),
      },
      tokens: {
        used: estimatedTokens,
        limit: limits.tokens,
        percentage: Math.min(100, Math.round((estimatedTokens / limits.tokens) * 100)),
      },
      agents: {
        used: agentCount,
        limit: limits.agents,
        percentage: Math.min(100, Math.round((agentCount / limits.agents) * 100)),
      },
      teamMembers: {
        used: memberCount,
        limit: limits.teamMembers,
        percentage: Math.min(100, Math.round((memberCount / limits.teamMembers) * 100)),
      },
      storageMb: {
        used: storageUsedMb,
        limit: limits.storageMb,
        percentage: Math.min(100, Math.round((storageUsedMb / limits.storageMb) * 100)),
      },
      periodStart: startOfMonth.toISOString(),
      periodEnd: endOfMonth.toISOString(),
    };

    sendSuccess(res, summary);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/billing/plan
 * Update plan tier (upgrade / downgrade).
 */
export async function updatePlan(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const org = await OrganizationModel.findById(organizationId);
    if (!org) {
      throw ApiError.notFound("Organization not found");
    }

    const { plan } = req.body;
    org.plan = plan;
    await org.save();

    sendSuccess(res, {
      message: `Organization plan updated to ${plan}`,
      plan: org.plan,
    });
  } catch (err) {
    next(err);
  }
}
