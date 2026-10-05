// ─── Agent Controller ─────────────────────────────────────────────────────
// CRUD operations for Voice Agents with strict multi-tenant isolation.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { AgentModel } from "../models/Agent.js";
import { sendSuccess, sendCreated } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * GET /api/agents
 * List agents scoped to active organization with pagination & filtering.
 */
export async function listAgents(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const filter: Record<string, any> = { organizationId };

    if (status && ["draft", "active", "paused", "archived"].includes(status)) {
      filter.status = status;
    } else {
      // By default exclude archived agents unless explicitly asked
      filter.status = { $ne: "archived" };
    }

    if (search && search.trim()) {
      const sanitized = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: sanitized, $options: "i" } },
        { description: { $regex: sanitized, $options: "i" } },
      ];
    }

    const total = await AgentModel.countDocuments(filter);
    const agents = await AgentModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: agents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/agents/:id
 * Retrieve a single agent by ID within active tenant context.
 */
export async function getAgent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id);
    const organizationId = req.organizationId!;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest("Invalid agent ID format", "INVALID_AGENT_ID");
    }

    const agent = await AgentModel.findOne({ _id: id, organizationId });
    if (!agent) {
      throw ApiError.notFound("Agent");
    }

    sendSuccess(res, agent);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/agents
 * Create a new voice agent under active tenant.
 */
export async function createAgent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const payload = req.body;

    const agent = await AgentModel.create({
      ...payload,
      organizationId,
      status: payload.status || "draft",
    });

    sendCreated(res, agent);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/agents/:id
 * Update an existing agent within active tenant.
 */
export async function updateAgent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id);
    const organizationId = req.organizationId!;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest("Invalid agent ID format", "INVALID_AGENT_ID");
    }

    // Disallow altering organizationId
    delete updates.organizationId;
    delete updates.id;
    delete updates._id;

    const agent = await AgentModel.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!agent) {
      throw ApiError.notFound("Agent");
    }

    sendSuccess(res, agent);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/agents/:id
 * Soft-delete / archive an agent within active tenant.
 */
export async function deleteAgent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id);
    const organizationId = req.organizationId!;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest("Invalid agent ID format", "INVALID_AGENT_ID");
    }

    // Soft-delete to preserve conversation history and analytics
    const agent = await AgentModel.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: { status: "archived" } },
      { new: true }
    );

    if (!agent) {
      throw ApiError.notFound("Agent");
    }

    sendSuccess(res, { message: "Agent archived successfully", id });
  } catch (err) {
    next(err);
  }
}
