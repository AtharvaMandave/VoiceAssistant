// ─── Voice Session State Machine ────────────────────────────────────────────
// Manages a single real-time voice conversation session.
// Handles audio accumulation, VAD, STT, RAG, streaming LLM, sentence-level
// TTS pipelining, and barge-in interruption.
// ─────────────────────────────────────────────────────────────────────────────

import type { WebSocket } from "ws";
import type {
  VoiceSessionState,
  RealtimeServerEvent,
  VoiceLatencyMetrics,
} from "@voiceflow/shared";
import { SentenceChunker } from "./sentenceChunker.js";
import { voiceService } from "../services/voice/voiceService.js";
import { searchKnowledge } from "../services/knowledge/vectorSearch.js";
import { synthesizePrompt } from "../services/llm/promptSynthesizer.js";
import { generateLLMResponseStream } from "../services/llm/llmGateway.js";
import { loadAgentTools, generateWithTools } from "../services/tools/toolExecutionService.js";
import { AgentModel } from "../models/Agent.js";
import { ConversationModel } from "../models/Conversation.js";
import { MessageModel } from "../models/Message.js";

export interface VoiceSessionConfig {
  sessionId: string;
  agentId: string;
  conversationId: string;
  organizationId: string;
  language: string;
  voice: string;
  sampleRate: number;
  chunkDurationMs: number;
}

export class VoiceSession {
  readonly sessionId: string;
  readonly agentId: string;
  readonly conversationId: string;
  readonly organizationId: string;

  private ws: WebSocket;
  private state: VoiceSessionState = "idle";
  private config: VoiceSessionConfig;

  // Audio accumulation
  private audioChunks: string[] = [];
  private speechStartTime = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly SILENCE_TIMEOUT_MS = 1200; // 1.2s of silence = end of utterance

  // Abort controllers for cancellation
  private currentAbortController: AbortController | null = null;
  private llmAbortController: AbortController | null = null;

  // Sentence chunker for pipelined TTS
  private sentenceChunker = new SentenceChunker(15);

  // Audio playback tracking
  private audioSeqCounter = 0;

  // Turn tracking
  private turnCount = 0;
  private turnStartTime = 0;

  constructor(ws: WebSocket, config: VoiceSessionConfig) {
    this.ws = ws;
    this.sessionId = config.sessionId;
    this.agentId = config.agentId;
    this.conversationId = config.conversationId;
    this.organizationId = config.organizationId;
    this.config = config;
  }

  getState(): VoiceSessionState {
    return this.state;
  }

  getTurnCount(): number {
    return this.turnCount;
  }

  /**
   * Handle an incoming audio chunk from the client.
   * Accumulates chunks and manages VAD-based turn detection.
   */
  async handleAudioChunk(base64Data: string, _seq?: number): Promise<void> {
    if (this.state === "processing" || this.state === "speaking") {
      // If agent is currently responding, treat audio as barge-in
      await this.interrupt("user_barge_in");
    }

    // Start listening state on first audio chunk
    if (this.state === "idle" || this.state === "interrupted") {
      this.setState("listening");
      this.speechStartTime = Date.now();
      this.audioChunks = [];
      this.audioSeqCounter = 0;
      this.turnStartTime = performance.now();
      this.sendEvent({ type: "speech.started", timestamp: Date.now() });
    }

    // Accumulate audio
    this.audioChunks.push(base64Data);

    // Reset silence timer — each chunk extends the "active speech" window
    this.resetSilenceTimer();
  }

  /**
   * Explicitly signal end of speech (push-to-talk release or manual stop).
   */
  async signalSpeechEnd(): Promise<void> {
    if (this.state !== "listening") return;
    this.clearSilenceTimer();
    await this.finalizeTranscription();
  }

  /**
   * Interrupt the current agent response (barge-in).
   * Cancels all in-flight STT/LLM/TTS work.
   */
  async interrupt(reason = "user_interrupt"): Promise<void> {
    this.setState("interrupted");

    // Cancel any in-flight LLM stream
    if (this.llmAbortController) {
      this.llmAbortController.abort();
      this.llmAbortController = null;
    }

    // Cancel any other pending work
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    this.clearSilenceTimer();
    this.sentenceChunker.reset();

    this.sendEvent({ type: "agent.interrupted", reason });
    this.setState("idle");
  }

  /**
   * Clean up session resources.
   */
  async cleanup(): Promise<void> {
    this.clearSilenceTimer();
    if (this.llmAbortController) {
      this.llmAbortController.abort();
    }
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.setState("closed");
  }

  // ─── Private Methods ───────────────────────────────────────────────────

  private setState(newState: VoiceSessionState): void {
    console.log(`[VoiceSession:${this.sessionId}] ${this.state} → ${newState}`);
    this.state = newState;
  }

  private sendEvent(event: RealtimeServerEvent): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      if (this.state === "listening") {
        this.finalizeTranscription().catch((err) => {
          console.error(`[VoiceSession:${this.sessionId}] Finalization error:`, err);
          this.sendEvent({
            type: "error",
            code: "FINALIZATION_ERROR",
            message: err.message || "Failed to finalize transcription",
          });
        });
      }
    }, this.SILENCE_TIMEOUT_MS);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Finalize accumulated audio → STT → RAG → streaming LLM → streaming TTS
   */
  private async finalizeTranscription(): Promise<void> {
    if (this.audioChunks.length === 0) {
      this.setState("idle");
      return;
    }

    const speechDurationMs = Date.now() - this.speechStartTime;
    this.sendEvent({ type: "speech.ended", durationMs: speechDurationMs });
    this.setState("processing");

    // Merge accumulated audio chunks into single buffer
    const combinedAudio = this.mergeAudioChunks(this.audioChunks);
    this.audioChunks = [];

    this.currentAbortController = new AbortController();
    this.turnCount++;

    try {
      // ── Step 1: STT ──────────────────────────────────────────────────
      const sttStartTime = performance.now();
      const { result: sttResult } = await voiceService.transcribeAudio({
        audioBase64: combinedAudio,
        language: this.config.language,
        mimeType: "audio/webm",
      });
      const sttMs = Math.round(performance.now() - sttStartTime);

      const userTranscript = sttResult.text.trim();
      if (!userTranscript || userTranscript === "(inaudible speech)") {
        this.sendEvent({
          type: "transcript.final",
          text: "",
          confidence: 0,
        });
        this.setState("idle");
        return;
      }

      this.sendEvent({
        type: "transcript.final",
        text: userTranscript,
        language: sttResult.language,
        confidence: sttResult.confidence,
      });

      // ── Step 2: Persist user message ──────────────────────────────────
      const userMessage = await MessageModel.create({
        conversationId: this.conversationId,
        role: "user",
        content: userTranscript,
      });

      // ── Step 3: RAG knowledge retrieval ───────────────────────────────
      this.sendEvent({ type: "agent.thinking", query: userTranscript });

      const agent = await AgentModel.findById(this.agentId);
      const conversation = await ConversationModel.findById(this.conversationId);
      if (!agent || !conversation) {
        throw new Error("Agent or conversation not found");
      }

      let retrievedChunks: any[] = [];
      try {
        const searchResult = await searchKnowledge({
          agentId: this.agentId,
          organizationId: this.organizationId,
          query: userTranscript,
          topK: 3,
          minScore: 0.15,
        });
        retrievedChunks = searchResult.chunks;
      } catch {
        // Non-fatal
      }

      // ── Step 4: Fetch conversation history ────────────────────────────
      const previousMessages = await MessageModel.find({
        conversationId: this.conversationId,
        _id: { $ne: userMessage._id },
      })
        .sort({ createdAt: 1 })
        .limit(10);

      // ── Step 5: Load agent tools & prompt synthesis ───────────────────
      let agentToolData: { toolDocs: any[]; llmTools: any[] } = { toolDocs: [], llmTools: [] };
      try {
        agentToolData = await loadAgentTools(this.agentId);
      } catch (err: any) {
        console.warn(`[VoiceSession] Failed to load tools: ${err.message}`);
      }

      const prompt = synthesizePrompt(
        {
          agentName: agent.name,
          template: agent.template,
          systemPrompt: agent.systemPrompt,
          businessProfile: agent.businessProfile,
          languages: agent.languages,
          channel: conversation.channel,
          retrievedKnowledge: retrievedChunks.length > 0 ? retrievedChunks : undefined,
          availableToolNames:
            agentToolData.toolDocs.length > 0
              ? agentToolData.toolDocs.map((t: any) => t.name)
              : undefined,
        },
        previousMessages,
        userTranscript
      );

      // ── Step 6: LLM + pipelined TTS (with Tool Calling support) ───────
      const llmStartTime = performance.now();
      let firstAudioSentTime = 0;
      let totalTtsMs = 0;
      let ttsChunkCount = 0;
      let fullResponseText = "";
      let toolCallRecords: any[] = [];

      this.sentenceChunker.reset();
      this.setState("speaking");

      const voiceId = agent.voice?.voiceId || "en-US-AriaNeural";
      const speed = agent.voice?.speed || 1.0;
      const pitch = agent.voice?.pitch || 1.0;

      if (agentToolData.llmTools.length > 0) {
        // Tool-augmented generation loop
        const toolResult = await generateWithTools(
          prompt.messages,
          agentToolData.toolDocs,
          agentToolData.llmTools,
          {
            agentId: this.agentId,
            organizationId: this.organizationId,
            conversationId: this.conversationId,
          },
          {
            model: agent.llmConfig?.model,
            temperature: agent.llmConfig?.temperature,
            maxTokens: agent.llmConfig?.maxTokens || 256,
            onToolStart: (toolName, args, toolCallId) => {
              this.sendEvent({
                type: "tool.started",
                toolName,
                toolCallId,
                args,
              });
            },
            onToolComplete: (record) => {
              this.sendEvent({
                type: "tool.completed",
                toolName: record.toolName,
                toolCallId: record.toolId,
                success: record.status === "success",
                result: record.output,
                error: record.error,
                durationMs: record.durationMs,
              });
            },
          }
        );

        fullResponseText = toolResult.text;
        toolCallRecords = toolResult.toolCalls;
        const llmMs = Math.round(performance.now() - llmStartTime);

        // Send text to client
        this.sendEvent({ type: "response.text.delta", text: fullResponseText, isFinal: true });

        // Synthesize speech for the response
        try {
          const ttsStartTime = performance.now();
          const ttsMs = await this.synthesizeAndSendAudio(fullResponseText, voiceId, speed, pitch);
          totalTtsMs = ttsMs;
          ttsChunkCount = 1;
          firstAudioSentTime = ttsStartTime;
        } catch (ttsErr: any) {
          console.warn(`[VoiceSession] TTS error: ${ttsErr.message}`);
        }

        const totalMs = Math.round(performance.now() - this.turnStartTime);
        const latencies: VoiceLatencyMetrics = {
          sttMs,
          llmMs,
          ttsMs: totalTtsMs,
          totalMs,
          timeToFirstAudioMs: firstAudioSentTime
            ? Math.round(firstAudioSentTime - this.turnStartTime)
            : undefined,
        };

        // Persist assistant message
        try {
          const assistantMessage = await MessageModel.create({
            conversationId: this.conversationId,
            role: "assistant",
            content: fullResponseText,
            tokens: toolResult.usage.completionTokens,
            latencyMs: totalMs,
            latencyMetrics: latencies,
            toolCalls: toolCallRecords.length > 0 ? toolCallRecords : undefined,
            retrievedChunks: retrievedChunks.length > 0 ? retrievedChunks : undefined,
          });

          // Update conversation stats
          conversation.messageCount += 2;
          conversation.totalTokens += toolResult.usage.totalTokens;
          await conversation.save();

          this.sendEvent({
            type: "response.done",
            messageId: assistantMessage._id.toString(),
            latencies,
          });
        } catch (err: any) {
          console.error(`[VoiceSession] Failed to persist message: ${err.message}`);
        }

        this.setState("idle");
      } else {
        // Standard streaming generation (no tools)
        await new Promise<void>((resolve, reject) => {
          this.llmAbortController = generateLLMResponseStream(
            prompt.messages,
            {
              model: agent.llmConfig?.model,
              temperature: agent.llmConfig?.temperature,
              maxTokens: agent.llmConfig?.maxTokens || 256,
            },
            {
              onToken: (token) => {
                // Send text delta to client
                this.sendEvent({ type: "response.text.delta", text: token });

                // Feed into sentence chunker
                const sentences = this.sentenceChunker.addToken(token);
                for (const sentence of sentences) {
                  this.synthesizeAndSendAudio(sentence, voiceId, speed, pitch).then(
                    (ttsMs) => {
                      totalTtsMs += ttsMs;
                      ttsChunkCount++;
                      if (!firstAudioSentTime) {
                        firstAudioSentTime = performance.now();
                      }
                    }
                  ).catch((err) => {
                    console.warn(`[VoiceSession] TTS error for sentence: ${err.message}`);
                  });
                }
              },
              onDone: async (text, usage) => {
                fullResponseText = text;
                const llmMs = Math.round(performance.now() - llmStartTime);

                // Flush remaining text in sentence buffer
                const remaining = this.sentenceChunker.flush();
                if (remaining) {
                  try {
                    const ttsMs = await this.synthesizeAndSendAudio(remaining, voiceId, speed, pitch);
                    totalTtsMs += ttsMs;
                    ttsChunkCount++;
                  } catch {
                    // Non-fatal
                  }
                }

                // Send final text delta
                this.sendEvent({ type: "response.text.delta", text: "", isFinal: true });

                const totalMs = Math.round(performance.now() - this.turnStartTime);
                const latencies: VoiceLatencyMetrics = {
                  sttMs,
                  llmMs,
                  ttsMs: ttsChunkCount > 0 ? Math.round(totalTtsMs / ttsChunkCount) : 0,
                  totalMs,
                  timeToFirstAudioMs: firstAudioSentTime
                    ? Math.round(firstAudioSentTime - this.turnStartTime)
                    : undefined,
                };

                // Persist assistant message
                try {
                  const assistantMessage = await MessageModel.create({
                    conversationId: this.conversationId,
                    role: "assistant",
                    content: fullResponseText,
                    tokens: usage.completionTokens,
                    latencyMs: totalMs,
                    latencyMetrics: latencies,
                    retrievedChunks: retrievedChunks.length > 0 ? retrievedChunks : undefined,
                  });

                  // Update conversation stats
                  conversation.messageCount += 2;
                  conversation.totalTokens += usage.totalTokens;
                  await conversation.save();

                  this.sendEvent({
                    type: "response.done",
                    messageId: assistantMessage._id.toString(),
                    latencies,
                  });
                } catch (err: any) {
                  console.error(`[VoiceSession] Failed to persist message: ${err.message}`);
                }

                this.setState("idle");
                resolve();
              },
              onError: (err) => {
                this.sendEvent({
                  type: "error",
                  code: "LLM_ERROR",
                  message: err.message || "LLM generation failed",
                });
                this.setState("idle");
                reject(err);
              },
            }
          );
        });
      }
    } catch (err: any) {
      if (this.currentAbortController?.signal.aborted) return;
      console.error(`[VoiceSession:${this.sessionId}] Turn error:`, err);
      this.sendEvent({
        type: "error",
        code: "TURN_ERROR",
        message: err.message || "Voice turn processing failed",
      });
      this.setState("idle");
    }
  }

  /**
   * Synthesize a sentence to audio and send it as an audio chunk.
   */
  private async synthesizeAndSendAudio(
    text: string,
    voice: string,
    speed: number,
    pitch: number
  ): Promise<number> {
    const { result, latencyMs } = await voiceService.synthesizeSpeech({
      text,
      voice,
      speed,
      pitch,
    });

    this.audioSeqCounter++;
    this.sendEvent({
      type: "response.audio.chunk",
      data: result.audioBase64,
      seq: this.audioSeqCounter,
      format: result.format,
    });

    return latencyMs;
  }

  /**
   * Merge multiple base64 audio chunks into a single base64 string.
   * For WebM/Opus, we concatenate the raw binary buffers.
   */
  private mergeAudioChunks(chunks: string[]): string {
    if (chunks.length === 1) return chunks[0];

    const buffers = chunks.map((c) => Buffer.from(c, "base64"));
    const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
    const merged = Buffer.alloc(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      buf.copy(merged, offset);
      offset += buf.length;
    }
    return merged.toString("base64");
  }
}
