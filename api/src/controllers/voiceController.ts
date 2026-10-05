import type { Request, Response, NextFunction } from "express";
import { VoiceTurnSchema, SynthesizeSpeechSchema } from "@voiceflow/shared";
import type { VoiceTurnResponse, VoiceLatencyMetrics } from "@voiceflow/shared";
import { AgentModel } from "../models/Agent.js";
import { ConversationModel } from "../models/Conversation.js";
import { MessageModel } from "../models/Message.js";
import { voiceService } from "../services/voice/voiceService.js";
import { searchKnowledge } from "../services/knowledge/vectorSearch.js";
import { synthesizePrompt } from "../services/llm/promptSynthesizer.js";
import { generateLLMResponse } from "../services/llm/llmGateway.js";
import { ApiError } from "../utils/ApiError.js";
import { sendSuccess } from "../utils/response.js";

/**
 * POST /api/agents/:agentId/conversations/:id/voice-turn
 * Executes a full voice-in / voice-out turn:
 * 1. Transcribes incoming audio using STT (Groq Whisper / Faster-Whisper)
 * 2. Grounded knowledge retrieval (RAG)
 * 3. Master prompt synthesis & LLM reasoning
 * 4. Lifelike neural speech synthesis (TTS)
 * 5. Returns transcript, grounded answer, audio base64, and granular latency metrics
 */
export async function handleVoiceTurn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const turnStartTime = performance.now();
  try {
    const organizationId = req.organizationId!;
    const { agentId, id: conversationId } = req.params;

    // 1. Validate request payload
    const parsed = VoiceTurnSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(`Invalid voice turn payload: ${JSON.stringify(parsed.error.format())}`);
    }
    const { audioBase64, mimeType, language } = parsed.data;

    // 2. Validate agent and conversation ownership
    const agent = await AgentModel.findOne({ _id: agentId, organizationId });
    if (!agent) {
      throw ApiError.notFound(`Agent "${agentId}" not found`);
    }

    const conversation = await ConversationModel.findOne({
      _id: conversationId,
      agentId,
      organizationId,
    });
    if (!conversation) {
      throw ApiError.notFound(`Conversation "${conversationId}" not found`);
    }
    if (conversation.status === "ended") {
      throw ApiError.badRequest("Cannot send voice turn to an ended conversation");
    }

    // 3. STT: Transcribe user voice audio
    const { result: sttResult, latencyMs: sttMs } = await voiceService.transcribeAudio({
      audioBase64,
      mimeType,
      language: language || (agent.languages?.[0] || "en"),
    });

    const userTranscript = sttResult.text.trim() || "(inaudible speech)";

    // 4. Persist User Message
    const userMessage = await MessageModel.create({
      conversationId: conversation._id,
      role: "user",
      content: userTranscript,
    });

    // 5. Fetch previous conversation history for context
    const previousMessages = await MessageModel.find({
      conversationId: conversation._id,
      _id: { $ne: userMessage._id },
    })
      .sort({ createdAt: 1 })
      .limit(10);

    // 6. RAG Grounding Search
    let retrievedChunks: any[] = [];
    try {
      const searchResult = await searchKnowledge({
        agentId: agent._id.toString(),
        organizationId,
        query: userTranscript,
        topK: 3,
        minScore: 0.15,
      });
      retrievedChunks = searchResult.chunks;
    } catch (ragErr) {
      console.warn("[Voice Turn] Vector search failed during turn:", ragErr);
    }

    // 7. Master Prompt Synthesis
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
      previousMessages,
      userTranscript
    );

    // 8. LLM Reasoning
    const llmStartTime = performance.now();
    const llmResponse = await generateLLMResponse(prompt.messages, {
      model: agent.llmConfig?.model,
      temperature: agent.llmConfig?.temperature,
      maxTokens: agent.llmConfig?.maxTokens || 256,
    });
    const llmMs = Math.round(performance.now() - llmStartTime);

    // 9. TTS: Neural Speech Synthesis
    const voiceId = agent.voice?.voiceId || "en-US-AriaNeural";
    const speed = agent.voice?.speed || 1.0;
    const pitch = agent.voice?.pitch || 1.0;

    const { result: ttsResult, latencyMs: ttsMs } = await voiceService.synthesizeSpeech({
      text: llmResponse.text,
      voice: voiceId,
      speed,
      pitch,
    });

    const totalMs = Math.round(performance.now() - turnStartTime);
    const latencies: VoiceLatencyMetrics = {
      sttMs,
      llmMs,
      ttsMs,
      totalMs,
    };

    // 10. Persist Assistant Response Message
    const assistantMessage = await MessageModel.create({
      conversationId: conversation._id,
      role: "assistant",
      content: llmResponse.text,
      tokens: llmResponse.usage.completionTokens,
      latencyMs: totalMs,
      llmModel: llmResponse.model,
      retrievedChunks: retrievedChunks.length > 0 ? retrievedChunks : undefined,
      audioBase64: ttsResult.audioBase64,
      audioDurationMs: Math.round((ttsResult.durationSeconds || 1) * 1000),
      latencyMetrics: latencies,
    });

    // 11. Update conversation stats
    conversation.messageCount += 2;
    conversation.totalTokens += llmResponse.usage.totalTokens;
    await conversation.save();

    const responsePayload: VoiceTurnResponse = {
      userMessage: {
        id: userMessage._id.toString(),
        conversationId: conversation._id.toString(),
        role: "user",
        content: userMessage.content,
        createdAt: userMessage.createdAt.toISOString(),
      },
      assistantMessage: {
        id: assistantMessage._id.toString(),
        conversationId: conversation._id.toString(),
        role: "assistant",
        content: assistantMessage.content,
        tokens: assistantMessage.tokens,
        latencyMs: assistantMessage.latencyMs,
        model: assistantMessage.llmModel,
        retrievedChunks: assistantMessage.retrievedChunks,
        audioBase64: ttsResult.audioBase64,
        audioDurationMs: Math.round((ttsResult.durationSeconds || 1) * 1000),
        latencyMetrics: latencies as any,
        createdAt: assistantMessage.createdAt.toISOString(),
      },
      audioBase64: ttsResult.audioBase64,
      audioFormat: ttsResult.format,
      latencies,
    };

    sendSuccess(res, responsePayload);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/voice/synthesize
 * Preview voice synthesis for agent configuration.
 */
export async function handleSynthesize(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = SynthesizeSpeechSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(`Invalid synthesis payload: ${JSON.stringify(parsed.error.format())}`);
    }

    const { text, voice, speed, pitch } = parsed.data;
    const { result, latencyMs } = await voiceService.synthesizeSpeech({
      text,
      voice,
      speed,
      pitch,
    });

    sendSuccess(res, {
      ...result,
      latencyMs,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/voice/voices
 * Return available neural voices.
 */
export async function handleListVoices(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const voices = await voiceService.listVoices();
    sendSuccess(res, {
      voices,
      default: "en-US-AriaNeural",
    });
  } catch (err) {
    next(err);
  }
}
