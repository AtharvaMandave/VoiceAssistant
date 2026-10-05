// ─── Conversation Controller ──────────────────────────────────────────────────
// Session lifecycle, message exchange, prompt synthesis & LLM orchestration.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import { AgentModel } from "../models/Agent.js";
import { ConversationModel } from "../models/Conversation.js";
import { MessageModel } from "../models/Message.js";
import { synthesizePrompt } from "../services/llm/promptSynthesizer.js";
import { generateLLMResponse } from "../services/llm/llmGateway.js";
import { searchKnowledge } from "../services/knowledge/vectorSearch.js";
import { evaluateConversationTranscript } from "../services/evaluation/qualityEvaluator.js";
import { ApiError } from "../utils/ApiError.js";
import { sendSuccess, sendCreated } from "../utils/response.js";
import {
  CreateConversationSchema,
  SendMessageSchema,
  ConversationQuerySchema,
  type RetrievedChunkSnippet,
} from "@voiceflow/shared";

/**
 * POST /api/agents/:agentId/conversations
 * Create a new conversation session for an agent within the active organization.
 */
export async function createConversation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { agentId } = req.params;

    const validated = CreateConversationSchema.parse(req.body);

    const agent = await AgentModel.findOne({
      _id: agentId,
      organizationId,
      status: { $ne: "archived" },
    });

    if (!agent) {
      throw ApiError.notFound(`Agent with ID "${agentId}" not found`);
    }

    const conversation = await ConversationModel.create({
      organizationId,
      agentId: agent._id,
      channel: validated.channel,
      status: "active",
      messageCount: 0,
      totalTokens: 0,
      metadata: validated.metadata || {},
    });

    sendCreated(res, conversation);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/conversations/:id/messages
 * Send a message into an active conversation, run prompt synthesizer & LLM,
 * and persist both user and assistant message records.
 */
export async function sendMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { id: conversationId } = req.params;
    const validated = SendMessageSchema.parse(req.body);

    // 1. Verify conversation belongs to tenant
    const conversation = await ConversationModel.findOne({
      _id: conversationId,
      organizationId,
    });

    if (!conversation) {
      throw ApiError.notFound(`Conversation "${conversationId}" not found`);
    }

    if (conversation.status === "ended") {
      throw ApiError.badRequest("Cannot send messages to an ended conversation session");
    }

    // 2. Load agent config
    const agent = await AgentModel.findOne({
      _id: conversation.agentId,
      organizationId,
    });

    if (!agent) {
      throw ApiError.notFound("Associated agent not found");
    }

    // 3. Persist User Message
    const userMessage = await MessageModel.create({
      conversationId: conversation._id,
      role: "user",
      content: validated.content,
      tokens: Math.ceil(validated.content.length / 4),
    });

    // 4. Fetch prior history for context window
    const history = await MessageModel.find({
      conversationId: conversation._id,
      _id: { $ne: userMessage._id },
    })
      .sort({ createdAt: 1 })
      .limit(20);

    // 4.5. Retrieve contextual knowledge chunks from agent's vector store (RAG)
    let retrievedChunks: RetrievedChunkSnippet[] = [];
    try {
      const searchResult = await searchKnowledge({
        agentId: agent._id.toString(),
        organizationId,
        query: validated.content,
        topK: 3,
        minScore: 0.15,
      });
      retrievedChunks = searchResult.chunks;
    } catch (ragErr) {
      console.warn("[RAG] Vector search failed during message processing:", ragErr);
    }

    // 5. Synthesize master prompt and message array with RAG grounding
    const prompt = synthesizePrompt(
      {
        agentName: agent.name,
        template: agent.template,
        systemPrompt: agent.systemPrompt,
        businessProfile: agent.businessProfile,
        languages: agent.languages,
        channel: conversation.channel,
        retrievedKnowledge: retrievedChunks.length > 0 ? retrievedChunks : undefined,
      },
      history,
      validated.content
    );

    // 6. Invoke LLM Gateway
    const llmResponse = await generateLLMResponse(prompt.messages, {
      model: agent.llmConfig?.model,
      temperature: agent.llmConfig?.temperature,
      maxTokens: agent.llmConfig?.maxTokens,
    });

    // 7. Persist Assistant Response Message with citation tracking
    const assistantMessage = await MessageModel.create({
      conversationId: conversation._id,
      role: "assistant",
      content: llmResponse.text,
      tokens: llmResponse.usage.completionTokens,
      latencyMs: llmResponse.latencyMs,
      llmModel: llmResponse.model,
      retrievedChunks: retrievedChunks.length > 0 ? retrievedChunks : undefined,
    });

    // 8. Update conversation counters
    conversation.messageCount += 2;
    conversation.totalTokens += llmResponse.usage.totalTokens;
    await conversation.save();

    sendSuccess(res, {
      userMessage,
      assistantMessage,
      conversation,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/conversations/:id
 * Retrieve a conversation and its chronological message history, with quality analysis.
 */
export async function getConversation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;

    const conversation = await ConversationModel.findOne({
      _id: id,
      organizationId,
    }).populate<{ agentId: { _id: any; name: string; template: string } }>("agentId", "name template");

    if (!conversation) {
      throw ApiError.notFound(`Conversation "${id}" not found`);
    }

    const messages = await MessageModel.find({ conversationId: conversation._id }).sort({
      createdAt: 1,
    });

    // Auto-evaluate sentiment & metrics if not yet evaluated or newly updated
    let evaluation;
    if (messages.length > 0) {
      const evalResult = evaluateConversationTranscript(messages, conversation as any);
      evaluation = evalResult;
      if (!conversation.sentiment || conversation.sentiment === "neutral" || evalResult.escalated) {
        conversation.sentiment = evalResult.sentiment;
        conversation.sentimentScore = evalResult.sentimentScore;
        if (evalResult.escalated && !conversation.escalated) {
          conversation.escalated = true;
          conversation.escalationReason = evalResult.escalationReason;
        }
        if (evalResult.avgLatencyMs > 0) {
          conversation.avgLatencyMs = evalResult.avgLatencyMs;
        }
        conversation.durationMs = evalResult.durationMs;
        await conversation.save().catch(() => {});
      }
    }

    const conversationData = {
      ...conversation.toJSON(),
      agentName: (conversation.agentId as any)?.name || "Agent",
    };

    sendSuccess(res, {
      conversation: conversationData,
      messages,
      evaluation,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/agents/:agentId/conversations
 * List conversation sessions for a specific agent with pagination.
 */
export async function listAgentConversations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { agentId } = req.params;
    const query = ConversationQuerySchema.parse(req.query);

    const filter: Record<string, any> = {
      organizationId,
      agentId,
    };

    if (query.status) {
      filter.status = query.status;
    }
    if (query.channel) {
      filter.channel = query.channel;
    }

    const total = await ConversationModel.countDocuments(filter);
    const conversations = await ConversationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit);

    res.status(200).json({
      success: true,
      data: conversations,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/conversations/:id/end
 * End an active conversation session.
 */
export async function endConversation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;

    const conversation = await ConversationModel.findOne({
      _id: id,
      organizationId,
    });

    if (!conversation) {
      throw ApiError.notFound(`Conversation "${id}" not found`);
    }

    conversation.status = "ended";
    await conversation.save();

    sendSuccess(res, conversation);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/agents/:agentId/prompt-preview
 * Inspect the synthesized prompt for an agent to assist in debugging/testing.
 */
export async function getPromptPreview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { agentId } = req.params;

    const agent = await AgentModel.findOne({
      _id: agentId,
      organizationId,
      status: { $ne: "archived" },
    });

    if (!agent) {
      throw ApiError.notFound(`Agent with ID "${agentId}" not found`);
    }

    const testQuery = (req.query.query as string) || "";
    let retrievedChunks: RetrievedChunkSnippet[] = [];
    if (testQuery.trim()) {
      try {
        const searchResult = await searchKnowledge({
          agentId: agent._id.toString(),
          organizationId,
          query: testQuery.trim(),
          topK: 3,
          minScore: 0.15,
        });
        retrievedChunks = searchResult.chunks;
      } catch (e) {
        // Continue without preview chunks
      }
    }

    const preview = synthesizePrompt(
      {
        agentName: agent.name,
        template: agent.template,
        systemPrompt: agent.systemPrompt,
        businessProfile: agent.businessProfile,
        languages: agent.languages,
        channel: "playground",
        retrievedKnowledge: retrievedChunks.length > 0 ? retrievedChunks : undefined,
      },
      [],
      testQuery.trim() || undefined
    );

    sendSuccess(res, {
      agentId: agent.id,
      agentName: agent.name,
      testQuery: testQuery || undefined,
      retrievedChunks,
      masterSystemPrompt: preview.masterSystemPrompt,
      sampleMessages: preview.messages,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/conversations
 * Organization-wide conversation listing with search, filtering, and pagination.
 */
export async function listAllConversations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const query = ConversationQuerySchema.parse(req.query);

    const filter: Record<string, any> = { organizationId };

    if (query.agentId) filter.agentId = query.agentId;
    if (query.status) filter.status = query.status;
    if (query.channel) filter.channel = query.channel;
    if (query.sentiment) filter.sentiment = query.sentiment;
    if (query.escalated !== undefined) filter.escalated = query.escalated;

    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
    }

    const total = await ConversationModel.countDocuments(filter);
    const rawConversations = await ConversationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate<{ agentId: { _id: any; name: string; template: string } }>("agentId", "name template")
      .lean();

    const conversations = rawConversations.map((c: any) => ({
      ...c,
      id: c._id.toString(),
      agentName: c.agentId?.name || "Unknown Agent",
      agentId: c.agentId?._id?.toString() || c.agentId?.toString(),
    }));

    res.status(200).json({
      success: true,
      data: conversations,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/conversations/stats
 * Quality evaluation metrics and aggregate stats across conversations.
 */
export async function getConversationStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;

    const [totalConversations, totalMessagesAgg, escalatedCount, sentimentStats, latencyAgg] =
      await Promise.all([
        ConversationModel.countDocuments({ organizationId }),
        ConversationModel.aggregate([
          { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
          { $group: { _id: null, total: { $sum: "$messageCount" } } },
        ]),
        ConversationModel.countDocuments({ organizationId, escalated: true }),
        ConversationModel.aggregate([
          { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
          { $group: { _id: "$sentiment", count: { $sum: 1 } } },
        ]),
        ConversationModel.aggregate([
          {
            $match: {
              organizationId: new mongoose.Types.ObjectId(organizationId),
              avgLatencyMs: { $gt: 0 },
            },
          },
          { $group: { _id: null, avgLatency: { $avg: "$avgLatencyMs" } } },
        ]),
      ]);

    const sentimentBreakdown = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };

    for (const s of sentimentStats) {
      if (s._id === "positive") sentimentBreakdown.positive = s.count;
      else if (s._id === "negative") sentimentBreakdown.negative = s.count;
      else sentimentBreakdown.neutral += s.count;
    }

    const totalMessages = totalMessagesAgg[0]?.total || 0;
    const avgLatencyMs = Math.round(latencyAgg[0]?.avgLatency || 380);
    const escalationRate =
      totalConversations > 0
        ? Math.round((escalatedCount / totalConversations) * 100)
        : 0;

    sendSuccess(res, {
      totalConversations,
      totalMessages,
      avgLatencyMs,
      escalationCount: escalatedCount,
      escalationRate,
      sentimentBreakdown,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/conversations/:id/evaluate
 * Trigger quality and sentiment evaluation on a specific conversation session.
 */
export async function evaluateConversation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;

    const conversation = await ConversationModel.findOne({
      _id: id,
      organizationId,
    });
    if (!conversation) throw ApiError.notFound("Conversation");

    const messages = await MessageModel.find({ conversationId: conversation._id }).sort({
      createdAt: 1,
    });

    const evalResult = evaluateConversationTranscript(messages, conversation);

    conversation.sentiment = evalResult.sentiment;
    conversation.sentimentScore = evalResult.sentimentScore;
    conversation.escalated = evalResult.escalated;
    if (evalResult.escalationReason) {
      conversation.escalationReason = evalResult.escalationReason;
    }
    if (evalResult.avgLatencyMs > 0) {
      conversation.avgLatencyMs = evalResult.avgLatencyMs;
    }
    conversation.durationMs = evalResult.durationMs;
    await conversation.save();

    sendSuccess(res, {
      conversation,
      evaluation: evalResult,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/conversations/:id/escalate
 * Toggle escalation status (escalate to human or mark resolved).
 */
export async function toggleEscalation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;
    const { escalated, reason } = req.body || {};

    const conversation = await ConversationModel.findOne({
      _id: id,
      organizationId,
    });
    if (!conversation) throw ApiError.notFound("Conversation");

    conversation.escalated =
      typeof escalated === "boolean" ? escalated : !conversation.escalated;
    if (reason) conversation.escalationReason = reason;
    if (conversation.escalated) {
      conversation.status = "escalated";
    } else if (conversation.status === "escalated") {
      conversation.status = "active";
    }
    await conversation.save();

    sendSuccess(res, conversation);
  } catch (err) {
    next(err);
  }
}
