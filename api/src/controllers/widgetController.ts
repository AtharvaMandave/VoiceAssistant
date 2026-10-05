// ─── Widget Controller ──────────────────────────────────────────────────────
// Public-facing endpoints for the embeddable voice widget.
// No authentication required — origin validation replaces auth.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "../config/env.js";
import { AgentModel } from "../models/Agent.js";
import { ConversationModel } from "../models/Conversation.js";
import { MessageModel } from "../models/Message.js";
import { voiceService } from "../services/voice/voiceService.js";
import { searchKnowledge } from "../services/knowledge/vectorSearch.js";
import { synthesizePrompt } from "../services/llm/promptSynthesizer.js";
import { generateLLMResponse } from "../services/llm/llmGateway.js";
import { loadAgentTools, generateWithTools } from "../services/tools/toolExecutionService.js";
import { ApiError } from "../utils/ApiError.js";
import { sendSuccess, sendCreated } from "../utils/response.js";

/**
 * Validate the request origin against the agent's allowed domains.
 * Returns true if origin is allowed. An empty allowedDomains list allows any origin.
 */
function isOriginAllowed(origin: string | undefined, allowedDomains: string[]): boolean {
  // No domain restrictions configured — allow all (dev-friendly default)
  if (!allowedDomains || allowedDomains.length === 0) return true;

  if (!origin) return false;

  try {
    const hostname = new URL(origin).hostname;
    return allowedDomains.some((domain) => {
      const d = domain.trim().toLowerCase();
      const h = hostname.toLowerCase();
      // Exact match or wildcard subdomain match
      return h === d || h.endsWith(`.${d}`);
    });
  } catch {
    return false;
  }
}

/**
 * Check if the agent is available for widget interaction.
 * - Active agents: always allowed
 * - Draft agents: allowed during development, localhost testing, or when preview flag is set
 * - Paused agents: not allowed
 */
function isAgentAvailableForWidget(
  agent: { status: string },
  req: Request
): { allowed: boolean; reason?: string } {
  if (agent.status === "active") {
    return { allowed: true };
  }

  if (agent.status === "paused") {
    return {
      allowed: false,
      reason: "This agent is currently paused. Please activate it in the dashboard to resume.",
    };
  }

  // Agent is in draft mode:
  const origin = (req.headers.origin || req.headers.referer || "") as string;
  const isDevOrTest =
    env.NODE_ENV === "development" ||
    req.query.preview === "true" ||
    req.body?.preview === true ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1");

  if (isDevOrTest) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "Agent is in draft mode. Set status to Active in the dashboard to embed on external websites.",
  };
}

/**
 * GET /api/widget/config/:agentId
 * Returns the public, widget-safe agent configuration.
 * Never exposes system prompts, API keys, or internal IDs to external sites.
 */
export async function handleGetWidgetConfig(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { agentId } = req.params;
    if (!agentId) throw ApiError.badRequest("Agent ID is required");

    const agent = await AgentModel.findById(agentId).lean();
    if (!agent) throw ApiError.notFound("Agent");

    const availability = isAgentAvailableForWidget(agent, req);
    if (!availability.allowed) {
      throw ApiError.forbidden(availability.reason || "Agent is not active", "AGENT_INACTIVE");
    }

    // Validate origin
    const origin = req.headers.origin || req.headers.referer;
    if (!isOriginAllowed(origin as string, agent.widget.allowedDomains)) {
      throw ApiError.forbidden(
        "This domain is not authorized to embed this agent",
        "ORIGIN_NOT_ALLOWED"
      );
    }

    // Return only widget-safe fields — no system prompts, no org secrets
    sendSuccess(res, {
      agentId: agent._id.toString(),
      name: agent.name,
      voice: {
        engine: agent.voice.engine,
        voiceId: agent.voice.voiceId,
        speed: agent.voice.speed,
        language: agent.voice.language,
      },
      widget: {
        primaryColor: agent.widget.primaryColor,
        position: agent.widget.position,
        title: agent.widget.title,
        welcomeMessage: agent.widget.welcomeMessage,
      },
      languages: agent.languages,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/widget/session
 * Creates an ephemeral conversation session for the widget.
 * Returns a short-lived session token that authorizes WebSocket connections.
 */
export async function handleCreateWidgetSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { agentId, visitorId, pageUrl, pageTitle } = req.body;
    if (!agentId) throw ApiError.badRequest("agentId is required");

    const agent = await AgentModel.findById(agentId).lean();
    if (!agent) throw ApiError.notFound("Agent");

    const availability = isAgentAvailableForWidget(agent, req);
    if (!availability.allowed) {
      throw ApiError.forbidden(availability.reason || "Agent is not active", "AGENT_INACTIVE");
    }

    // Validate origin
    const origin = req.headers.origin || req.headers.referer;
    if (!isOriginAllowed(origin as string, agent.widget.allowedDomains)) {
      throw ApiError.forbidden(
        "This domain is not authorized",
        "ORIGIN_NOT_ALLOWED"
      );
    }

    // Generate a unique session ID and ephemeral token
    const sessionId = `ws_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    const sessionToken = crypto.randomBytes(32).toString("hex");

    // Create a conversation record
    const conversation = await ConversationModel.create({
      organizationId: agent.organizationId,
      agentId: agent._id,
      sessionId,
      visitorId: visitorId || `anon_${crypto.randomBytes(6).toString("hex")}`,
      channel: "widget",
      status: "active",
      metadata: {
        pageUrl: pageUrl || "",
        pageTitle: pageTitle || "",
        origin: origin || "",
        userAgent: req.headers["user-agent"] || "",
      },
    });

    sendCreated(res, {
      sessionId,
      sessionToken,
      conversationId: conversation._id.toString(),
      agentConfig: {
        name: agent.name,
        voice: {
          engine: agent.voice.engine,
          voiceId: agent.voice.voiceId,
          speed: agent.voice.speed,
          language: agent.voice.language,
        },
        widget: {
          primaryColor: agent.widget.primaryColor,
          position: agent.widget.position,
          title: agent.widget.title,
          welcomeMessage: agent.widget.welcomeMessage,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/widget/turn
 * Process a user turn (text or voice) from the embeddable widget.
 * Origin-validated, public session turn without requiring SaaS user JWT.
 */
export async function handleWidgetTurn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const turnStartTime = performance.now();
  try {
    const { agentId, text, audioBase64, mimeType, voice, speed, pitch, language } = req.body;
    let { conversationId } = req.body;

    if (!agentId) {
      throw ApiError.badRequest("agentId is required");
    }
    if (!text && !audioBase64) {
      throw ApiError.badRequest("Either text or audioBase64 must be provided");
    }

    const agent = await AgentModel.findById(agentId);
    if (!agent) throw ApiError.notFound("Agent");

    const availability = isAgentAvailableForWidget(agent, req);
    if (!availability.allowed) {
      throw ApiError.forbidden(availability.reason || "Agent is not active", "AGENT_INACTIVE");
    }

    // Validate origin
    const origin = req.headers.origin || req.headers.referer;
    if (!isOriginAllowed(origin as string, agent.widget.allowedDomains)) {
      throw ApiError.forbidden("This domain is not authorized to embed this agent", "ORIGIN_NOT_ALLOWED");
    }

    // Find existing conversation or gracefully create one on the fly
    let conversation = null;
    if (conversationId) {
      try {
        conversation = await ConversationModel.findOne({
          _id: conversationId,
          agentId: agent._id,
        });
      } catch {
        // invalid ObjectId format
      }
    }

    if (!conversation) {
      const sessionId = `ws_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
      conversation = await ConversationModel.create({
        organizationId: agent.organizationId,
        agentId: agent._id,
        sessionId,
        visitorId: `anon_${crypto.randomBytes(6).toString("hex")}`,
        channel: "widget",
        status: "active",
        metadata: {
          origin: origin || "",
          userAgent: req.headers["user-agent"] || "",
        },
      });
    }

    if (conversation.status === "ended") {
      throw ApiError.badRequest("Cannot send message to an ended conversation");
    }

    // 1. Resolve User Input (STT if voice, or raw text)
    let userText = "";
    let sttMs = 0;

    if (audioBase64) {
      const sttRes = await voiceService.transcribeAudio({
        audioBase64,
        mimeType: mimeType || "audio/webm",
        language: language || agent.languages?.[0] || "en",
      });
      userText = sttRes.result.text.trim() || "(inaudible speech)";
      sttMs = sttRes.latencyMs;
    } else {
      userText = (text || "").trim();
    }

    // 2. Persist User Message
    const userMessage = await MessageModel.create({
      conversationId: conversation._id,
      role: "user",
      content: userText,
    });

    // 3. Fetch recent conversation history
    const previousMessages = await MessageModel.find({
      conversationId: conversation._id,
      _id: { $ne: userMessage._id },
    })
      .sort({ createdAt: 1 })
      .limit(10);

    // 4. Grounded RAG search
    let retrievedChunks: any[] = [];
    try {
      const searchResult = await searchKnowledge({
        agentId: agent._id.toString(),
        organizationId: agent.organizationId.toString(),
        query: userText,
        topK: 3,
        minScore: 0.15,
      });
      retrievedChunks = searchResult.chunks;
    } catch (ragErr) {
      console.warn("[Widget Turn] RAG search skipped:", ragErr);
    }

    // 5. Load available tools (early, so we can inform the prompt)
    let agentToolData: { toolDocs: any[]; llmTools: any[] } = { toolDocs: [], llmTools: [] };
    try {
      agentToolData = await loadAgentTools(agent._id.toString());
    } catch (toolLoadErr) {
      console.warn("[Widget Turn] Failed to load tools:", toolLoadErr);
    }

    // 6. Master Prompt Synthesis
    const prompt = synthesizePrompt(
      {
        agentName: agent.name,
        template: agent.template,
        systemPrompt: agent.systemPrompt,
        businessProfile: agent.businessProfile,
        languages: agent.languages,
        channel: "widget",
        retrievedKnowledge: retrievedChunks.length > 0 ? retrievedChunks : undefined,
        availableToolNames: agentToolData.toolDocs.length > 0
          ? agentToolData.toolDocs.map((t: any) => t.name)
          : undefined,
      },
      previousMessages,
      userText
    );

    // 7. LLM Reasoning (with optional Tool Calling)
    const llmStartTime = performance.now();

    // Load tools for this agent (if any)
    let llmResponse: { text: string; model: string; provider: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; latencyMs?: number };
    let toolCallRecords: any[] = [];
    let usedTools = false;

    try {
      if (agentToolData.llmTools.length > 0) {
        // Tool-augmented generation: LLM ↔ Tool calling loop
        const toolResult = await generateWithTools(
          prompt.messages,
          agentToolData.toolDocs,
          agentToolData.llmTools,
          {
            agentId: agent._id.toString(),
            organizationId: agent.organizationId.toString(),
            conversationId: conversation._id.toString(),
          },
          {
            model: agent.llmConfig?.model,
            temperature: agent.llmConfig?.temperature,
            maxTokens: agent.llmConfig?.maxTokens || 256,
          }
        );
        llmResponse = toolResult;
        toolCallRecords = toolResult.toolCalls;
        usedTools = toolResult.usedTools;
      } else {
        // Standard LLM generation (no tools)
        llmResponse = await generateLLMResponse(prompt.messages, {
          model: agent.llmConfig?.model,
          temperature: agent.llmConfig?.temperature,
          maxTokens: agent.llmConfig?.maxTokens || 256,
        });
      }
    } catch (llmErr) {
      console.error("[Widget Turn] LLM/Tool generation error:", llmErr);
      // Fallback to standard LLM
      llmResponse = await generateLLMResponse(prompt.messages, {
        model: agent.llmConfig?.model,
        temperature: agent.llmConfig?.temperature,
        maxTokens: agent.llmConfig?.maxTokens || 256,
      });
    }

    const llmMs = Math.round(performance.now() - llmStartTime);

    // 7. TTS: Speech Synthesis
    const selectedVoice = voice || agent.voice?.voiceId || "af_heart";
    const selectedSpeed = speed || agent.voice?.speed || 1.0;
    const selectedPitch = pitch || agent.voice?.pitch || 1.0;

    const { result: ttsResult, latencyMs: ttsMs } = await voiceService.synthesizeSpeech({
      text: llmResponse.text,
      voice: selectedVoice,
      speed: selectedSpeed,
      pitch: selectedPitch,
    });

    const totalMs = Math.round(performance.now() - turnStartTime);
    const latencies = {
      sttMs,
      llmMs,
      ttsMs,
      totalMs,
    };

    // 8. Persist Assistant Response (including tool calls if any)
    await MessageModel.create({
      conversationId: conversation._id,
      role: "assistant",
      content: llmResponse.text,
      tokens: llmResponse.usage.completionTokens,
      latencyMs: totalMs,
      llmModel: llmResponse.model,
      toolCalls: toolCallRecords.length > 0 ? toolCallRecords : undefined,
      retrievedChunks: retrievedChunks.length > 0 ? retrievedChunks : undefined,
      audioBase64: ttsResult.audioBase64,
      audioDurationMs: Math.round((ttsResult.durationSeconds || 1) * 1000),
      latencyMetrics: latencies,
    });

    // 9. Update conversation stats
    conversation.messageCount += 2;
    conversation.totalTokens += llmResponse.usage.totalTokens;
    await conversation.save();

    sendSuccess(res, {
      conversationId: conversation._id.toString(),
      transcribedText: userText,
      responseText: llmResponse.text,
      audioBase64: ttsResult.audioBase64,
      audioFormat: ttsResult.format,
      latencies,
      toolCalls: toolCallRecords.length > 0 ? toolCallRecords : undefined,
      usedTools,
    });
  } catch (err) {
    next(err);
  }
}

