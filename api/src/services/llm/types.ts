// ─── LLM Service Types ────────────────────────────────────────────────────────
// Types and interfaces for multi-provider LLM gateway and prompt synthesis.
// ─────────────────────────────────────────────────────────────────────────────

import type { RetrievedChunkSnippet } from "@voiceflow/shared";

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

export interface LLMGenerateOptions {
  provider?: "groq" | "openai" | "anthropic" | "mock";
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  text: string;
  model: string;
  provider: string;
  usage: LLMUsage;
  latencyMs: number;
}

export interface AgentPromptContext {
  agentName: string;
  template: string;
  systemPrompt: string;
  businessProfile?: string;
  languages?: string[];
  channel?: string;
  retrievedKnowledge?: RetrievedChunkSnippet[];
  /** Names of enabled tools available for this agent */
  availableToolNames?: string[];
}

