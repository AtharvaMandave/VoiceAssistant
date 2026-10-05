// ─── Tool Controller ────────────────────────────────────────────────────────
// CRUD operations for managing tools per agent.
// Includes a seed endpoint to auto-register built-in tools.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";
import { ToolModel } from "../models/Tool.js";
import { AgentModel } from "../models/Agent.js";
import { ApiError } from "../utils/ApiError.js";
import { sendSuccess, sendCreated, sendNoContent } from "../utils/response.js";
import {
  BUILT_IN_TOOL_DEFINITIONS,
  isBuiltInTool,
  getBuiltInToolNames,
} from "../services/tools/toolRegistry.js";

/**
 * GET /api/agents/:agentId/tools
 * List all tools registered for an agent.
 */
export async function listTools(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { agentId } = req.params;
    const organizationId = req.organizationId!;
    const { page = 1, limit = 20, enabled } = req.query;

    const agent = await AgentModel.findOne({
      _id: agentId,
      organizationId,
    });
    if (!agent) throw ApiError.notFound("Agent");

    const filter: Record<string, unknown> = {
      agentId: agent._id,
      organizationId,
    };
    if (enabled !== undefined) {
      filter.enabled = enabled;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [tools, total] = await Promise.all([
      ToolModel.find(filter)
        .sort({ isBuiltIn: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      ToolModel.countDocuments(filter),
    ]);

    sendSuccess(res, {
      tools,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/agents/:agentId/tools/:toolId
 * Get a specific tool by ID.
 */
export async function getTool(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { agentId, toolId } = req.params;
    const organizationId = req.organizationId!;

    const tool = await ToolModel.findOne({
      _id: toolId,
      agentId,
      organizationId,
    }).lean();

    if (!tool) throw ApiError.notFound("Tool");

    sendSuccess(res, tool);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/agents/:agentId/tools
 * Create a new custom tool for an agent.
 */
export async function createTool(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { agentId } = req.params;
    const organizationId = req.organizationId!;

    const agent = await AgentModel.findOne({
      _id: agentId,
      organizationId,
    });
    if (!agent) throw ApiError.notFound("Agent");

    // Check for duplicate tool name
    const existing = await ToolModel.findOne({
      agentId: agent._id,
      name: req.body.name,
    });
    if (existing) {
      throw ApiError.conflict(`Tool with name "${req.body.name}" already exists for this agent`);
    }

    const tool = await ToolModel.create({
      ...req.body,
      organizationId,
      agentId: agent._id,
      isBuiltIn: isBuiltInTool(req.body.name),
    });

    // Add tool ID to agent's toolIds array
    await AgentModel.findByIdAndUpdate(agent._id, {
      $addToSet: { toolIds: tool._id },
    });

    sendCreated(res, tool.toJSON());
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/agents/:agentId/tools/:toolId
 * Update an existing tool's configuration.
 */
export async function updateTool(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { agentId, toolId } = req.params;
    const organizationId = req.organizationId!;

    const tool = await ToolModel.findOneAndUpdate(
      { _id: toolId, agentId, organizationId },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!tool) throw ApiError.notFound("Tool");

    sendSuccess(res, tool.toJSON());
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/agents/:agentId/tools/:toolId
 * Delete a tool and remove it from the agent's toolIds.
 */
export async function deleteTool(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { agentId, toolId } = req.params;
    const organizationId = req.organizationId!;

    const tool = await ToolModel.findOneAndDelete({
      _id: toolId,
      agentId,
      organizationId,
    });

    if (!tool) throw ApiError.notFound("Tool");

    // Remove from agent's toolIds
    await AgentModel.findByIdAndUpdate(agentId, {
      $pull: { toolIds: tool._id },
    });

    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/agents/:agentId/tools/seed
 * Auto-register all built-in tools for an agent.
 * Skips tools that already exist. Idempotent operation.
 */
export async function seedBuiltInTools(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { agentId } = req.params;
    const organizationId = req.organizationId!;

    const agent = await AgentModel.findOne({
      _id: agentId,
      organizationId,
    });
    if (!agent) throw ApiError.notFound("Agent");

    const builtInNames = getBuiltInToolNames();
    const existingTools = await ToolModel.find({
      agentId: agent._id,
      name: { $in: builtInNames },
    }).select("name").lean();

    const existingNames = new Set(existingTools.map((t) => t.name));
    const toCreate = builtInNames.filter((n) => !existingNames.has(n));

    const created: any[] = [];
    for (const toolName of toCreate) {
      const def = BUILT_IN_TOOL_DEFINITIONS[toolName];
      if (!def) continue;

      const tool = await ToolModel.create({
        organizationId,
        agentId: agent._id,
        name: toolName,
        displayName: def.displayName,
        description: def.description,
        parameters: def.parameters,
        enabled: true,
        riskLevel: def.riskLevel,
        isBuiltIn: true,
      });

      // Add to agent's toolIds
      await AgentModel.findByIdAndUpdate(agent._id, {
        $addToSet: { toolIds: tool._id },
      });

      created.push(tool.toJSON());
    }

    sendSuccess(res, {
      message: `Seeded ${created.length} built-in tools (${existingNames.size} already existed)`,
      seeded: created,
      alreadyExisted: [...existingNames],
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/agents/:agentId/tools/:toolId/toggle
 * Toggle a tool's enabled/disabled state.
 */
export async function toggleTool(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { agentId, toolId } = req.params;
    const organizationId = req.organizationId!;

    const tool = await ToolModel.findOne({
      _id: toolId,
      agentId,
      organizationId,
    });

    if (!tool) throw ApiError.notFound("Tool");

    tool.enabled = !tool.enabled;
    await tool.save();

    sendSuccess(res, {
      id: tool._id.toString(),
      name: tool.name,
      enabled: tool.enabled,
    });
  } catch (err) {
    next(err);
  }
}
