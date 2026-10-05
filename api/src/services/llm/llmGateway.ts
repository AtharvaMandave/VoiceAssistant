// ─── LLM Gateway ─────────────────────────────────────────────────────────────
// Pluggable multi-provider gateway supporting Groq, OpenAI, Anthropic, and intelligent fallback.
// ─────────────────────────────────────────────────────────────────────────────

import { env } from "../../config/env.js";
import type { LLMMessage, LLMGenerateOptions, LLMResponse } from "./types.js";

/**
 * Generate completion across configured LLM provider with fallback support.
 */
export async function generateLLMResponse(
  messages: LLMMessage[],
  options: LLMGenerateOptions = {}
): Promise<LLMResponse> {
  const startTime = Date.now();
  const provider = options.provider || detectProvider(options.model);
  const model = options.model || getDefaultModel(provider);

  // 1. Try Groq if configured
  if (provider === "groq" && env.GROQ_API_KEY) {
    try {
      return await callGroq(messages, model, options, startTime);
    } catch (err: any) {
      console.warn(`[LLM Gateway] Groq error: ${err.message}. Falling back to mock generator.`);
    }
  }

  // 2. Try OpenAI if configured
  if (provider === "openai" && env.OPENAI_API_KEY) {
    try {
      return await callOpenAI(messages, model, options, startTime);
    } catch (err: any) {
      console.warn(`[LLM Gateway] OpenAI error: ${err.message}. Falling back to mock generator.`);
    }
  }

  // 3. Try Anthropic if configured
  if (provider === "anthropic" && env.ANTHROPIC_API_KEY) {
    try {
      return await callAnthropic(messages, model, options, startTime);
    } catch (err: any) {
      console.warn(`[LLM Gateway] Anthropic error: ${err.message}. Falling back to mock generator.`);
    }
  }

  // 4. Intelligent Contextual Mock / Local Generator
  return generateContextualMockResponse(messages, model, startTime);
}

function detectProvider(model?: string): "groq" | "openai" | "anthropic" | "mock" {
  if (!model) {
    if (env.GROQ_API_KEY) return "groq";
    if (env.OPENAI_API_KEY) return "openai";
    if (env.ANTHROPIC_API_KEY) return "anthropic";
    return "mock";
  }

  const m = model.toLowerCase();
  if (m.includes("llama") || m.includes("mixtral") || m.includes("gemma") || m.includes("groq")) {
    return "groq";
  }
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3")) {
    return "openai";
  }
  if (m.includes("claude")) {
    return "anthropic";
  }
  return "mock";
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case "groq":
      return "groq/compound";
    case "openai":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-3-5-haiku-20241022";
    default:
      return "groq/compound (mock)";
  }
}

/**
 * Call Groq OpenAI-compatible API with automatic fallback to groq/compound
 */
async function callGroq(
  messages: LLMMessage[],
  model: string,
  options: LLMGenerateOptions,
  startTime: number
): Promise<LLMResponse> {
  const targetModel = model.includes("mock") ? "groq/compound" : model;

  const attemptCall = async (modelToUse: string) => {
    return await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 512,
      }),
    });
  };

  let res = await attemptCall(targetModel);

  // If requested model is not found (404), gracefully retry with verified available model groq/compound
  if (!res.ok && res.status === 404 && targetModel !== "groq/compound") {
    console.warn(`[LLM Gateway] Groq model "${targetModel}" not found on account. Retrying with "groq/compound"...`);
    res = await attemptCall("groq/compound");
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq API returned ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as any;
  const text = data.choices?.[0]?.message?.content || "";
  const usage = data.usage || {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  return {
    text,
    model: data.model || targetModel,
    provider: "groq",
    usage: {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Call OpenAI Chat API
 */
async function callOpenAI(
  messages: LLMMessage[],
  model: string,
  options: LLMGenerateOptions,
  startTime: number
): Promise<LLMResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: model.includes("mock") ? "gpt-4o-mini" : model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 512,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API returned ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as any;
  const text = data.choices?.[0]?.message?.content || "";
  const usage = data.usage || {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  return {
    text,
    model: data.model || model,
    provider: "openai",
    usage: {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Call Anthropic Messages API
 */
async function callAnthropic(
  messages: LLMMessage[],
  model: string,
  options: LLMGenerateOptions,
  startTime: number
): Promise<LLMResponse> {
  // Anthropic requires system prompt to be passed separately
  const systemMsg = messages.find((m) => m.role === "system");
  const conversationMsgs = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model.includes("mock") ? "claude-3-5-haiku-20241022" : model,
      system: systemMsg?.content || "",
      messages: conversationMsgs,
      max_tokens: options.maxTokens ?? 512,
      temperature: options.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic API returned ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as any;
  const text = data.content?.[0]?.text || "";
  const usage = data.usage || { input_tokens: 0, output_tokens: 0 };

  return {
    text,
    model: data.model || model,
    provider: "anthropic",
    usage: {
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
      totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    },
    latencyMs: Date.now() - startTime,
  };
}

/**
 * High-quality contextual offline / fallback engine when no keys are provided.
 * Understands user intent, agent persona, and produces natural conversational replies.
 */
async function generateContextualMockResponse(
  messages: LLMMessage[],
  model: string,
  startTime: number
): Promise<LLMResponse> {
  // Simulate realistic network latency (150ms - 220ms)
  await new Promise((resolve) => setTimeout(resolve, 160));

  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const userMsg =
    [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const userLower = userMsg.toLowerCase().trim();

  let reply = "";

  // Check agent template / persona from system prompt
  const isAppointment =
    systemMsg.toLowerCase().includes("appointment") ||
    systemMsg.toLowerCase().includes("clinic") ||
    systemMsg.toLowerCase().includes("doctor") ||
    systemMsg.toLowerCase().includes("schedule");

  const isSales =
    systemMsg.toLowerCase().includes("sales") ||
    systemMsg.toLowerCase().includes("product") ||
    systemMsg.toLowerCase().includes("pricing");

  const isSupport =
    systemMsg.toLowerCase().includes("support") ||
    systemMsg.toLowerCase().includes("helpdesk") ||
    systemMsg.toLowerCase().includes("service");

  // If retrieved knowledge is present in the prompt, synthesize answer from it
  if (systemMsg.includes("[RETRIEVED BUSINESS KNOWLEDGE")) {
    const knowledgeBlock =
      systemMsg
        .split("[RETRIEVED BUSINESS KNOWLEDGE (REFERENCE DATA)]")[1]
        ?.split("[GROUNDING POLICY]")[0] || "";

    if (knowledgeBlock) {
      const lines = knowledgeBlock
        .split("\n")
        .map((l) => l.trim())
        .filter(
          (l) =>
            l.length > 20 &&
            !l.startsWith("[Source") &&
            !l.startsWith("The following")
        );

      if (lines.length > 0) {
        const queryWords = userLower.split(/\s+/).filter((w) => w.length > 3);
        const matchedLine =
          lines.find((l) => {
            const lLower = l.toLowerCase();
            return queryWords.some((w) => lLower.includes(w));
          }) || lines[0];

        const cleanAnswer = matchedLine.replace(/^[#\-\*]+\s*/, "");
        reply = `Based on our verified company policy: ${cleanAnswer} Please let me know if you need any further assistance!`;
      }
    }
  }

  if (!reply) {
    if (
      userLower.includes("hello") ||
      userLower.includes("hi") ||
      userLower.includes("hey") ||
      userLower === "start"
    ) {
    if (isAppointment) {
      reply =
        "Hello! Welcome to our clinic. I would be happy to assist you with scheduling or rescheduling an appointment today. What date or service are you inquiring about?";
    } else if (isSales) {
      reply =
        "Hi there! Thanks for reaching out. I would love to learn more about your business needs and walk you through our solutions. How can I help you today?";
    } else if (isSupport) {
      reply =
        "Hello! I am here to help you resolve any issues or answer questions about our services. Could you please describe what you are experiencing?";
    } else {
      reply =
        "Hello! I'm your AI voice assistant. I am ready to help you. What would you like to discuss today?";
    }
  } else if (
    userLower.includes("book") ||
    userLower.includes("appointment") ||
    userLower.includes("schedule") ||
    userLower.includes("dental") ||
    userLower.includes("checkup") ||
    userLower.includes("doctor")
  ) {
    reply =
      "I can certainly help you book that appointment. We have openings available tomorrow at 10:00 AM and 2:30 PM. Would either of those times work for you?";
  } else if (
    userLower.includes("tomorrow") ||
    userLower.includes("10") ||
    userLower.includes("2:30") ||
    userLower.includes("confirm") ||
    userLower.includes("yes") ||
    userLower.includes("sounds good")
  ) {
    reply =
      "Wonderful! I have reserved that time slot for you. Could you please provide your full name and preferred phone number to finalize the confirmation?";
  } else if (
    userLower.includes("pricing") ||
    userLower.includes("cost") ||
    userLower.includes("price") ||
    userLower.includes("how much")
  ) {
    reply =
      "Our flexible tiers start with a Starter plan for growing teams, and Custom Enterprise options for high-volume voice streaming. Would you like a tailored quote for your organization?";
  } else if (
    userLower.includes("who are you") ||
    userLower.includes("what can you do") ||
    userLower.includes("help")
  ) {
    reply =
      "I am an intelligent conversational voice assistant powered by VoiceFlow AI. I can answer inquiries, schedule appointments, handle customer support, and route requests instantly.";
  } else if (
    userLower.includes("thank") ||
    userLower.includes("bye") ||
    userLower.includes("goodbye")
  ) {
    reply =
      "You are very welcome! It was a pleasure assisting you today. Have a wonderful day!";
  } else {
    // Contextual generic response acknowledging user input
    reply = `Thank you for sharing that. Based on our configuration, I can certainly assist you with that request. Could you clarify a few more details so I can take care of it for you?`;
  }
}

  const promptTokens = Math.ceil(
    messages.reduce((acc, m) => acc + m.content.length / 4, 0)
  );
  const completionTokens = Math.ceil(reply.length / 4);

  return {
    text: reply,
    model: `${model} (Dev Mode)`,
    provider: "mock",
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    latencyMs: Date.now() - startTime,
  };
}

// ─── Streaming LLM Generation (Phase 5) ───────────────────────────────────

export interface LLMStreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string, usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void;
  onError: (error: Error) => void;
}

/**
 * Generate a streaming LLM response. Calls onToken for each token delta,
 * enabling pipelined TTS synthesis at sentence boundaries.
 * Returns an AbortController so callers can cancel mid-stream (barge-in).
 */
export function generateLLMResponseStream(
  messages: LLMMessage[],
  options: LLMGenerateOptions = {},
  callbacks: LLMStreamCallbacks
): AbortController {
  const abortController = new AbortController();
  const startTime = Date.now();
  const provider = options.provider || detectProvider(options.model);
  const model = options.model || getDefaultModel(provider);

  const run = async () => {
    // Try Groq streaming
    if (provider === "groq" && env.GROQ_API_KEY) {
      try {
        await streamGroq(messages, model, options, abortController.signal, callbacks);
        return;
      } catch (err: any) {
        if (abortController.signal.aborted) return;
        console.warn(`[LLM Gateway] Groq stream error: ${err.message}. Falling back to mock.`);
      }
    }

    // Try OpenAI streaming
    if (provider === "openai" && env.OPENAI_API_KEY) {
      try {
        await streamOpenAI(messages, model, options, abortController.signal, callbacks);
        return;
      } catch (err: any) {
        if (abortController.signal.aborted) return;
        console.warn(`[LLM Gateway] OpenAI stream error: ${err.message}. Falling back to mock.`);
      }
    }

    // Mock streaming fallback
    if (!abortController.signal.aborted) {
      await streamMock(messages, model, startTime, abortController.signal, callbacks);
    }
  };

  run().catch((err) => {
    if (!abortController.signal.aborted) {
      callbacks.onError(err);
    }
  });

  return abortController;
}

/**
 * Stream from Groq's OpenAI-compatible SSE endpoint.
 */
async function streamGroq(
  messages: LLMMessage[],
  model: string,
  options: LLMGenerateOptions,
  signal: AbortSignal,
  callbacks: LLMStreamCallbacks
): Promise<void> {
  const targetModel = model.includes("mock") ? "groq/compound" : model;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: targetModel,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 512,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    // If model not found, retry with groq/compound
    if (res.status === 404 && targetModel !== "groq/compound") {
      return streamGroq(messages, "groq/compound", options, signal, callbacks);
    }
    const errorText = await res.text();
    throw new Error(`Groq streaming API returned ${res.status}: ${errorText}`);
  }

  await processSSEStream(res, signal, callbacks);
}

/**
 * Stream from OpenAI's SSE endpoint.
 */
async function streamOpenAI(
  messages: LLMMessage[],
  model: string,
  options: LLMGenerateOptions,
  signal: AbortSignal,
  callbacks: LLMStreamCallbacks
): Promise<void> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: model.includes("mock") ? "gpt-4o-mini" : model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 512,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI streaming API returned ${res.status}: ${errorText}`);
  }

  await processSSEStream(res, signal, callbacks);
}

/**
 * Process an SSE stream from OpenAI-compatible APIs (Groq/OpenAI).
 */
async function processSSEStream(
  res: Response,
  signal: AbortSignal,
  callbacks: LLMStreamCallbacks
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body for streaming");

  const decoder = new TextDecoder();
  let fullText = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let buffer = "";

  try {
    while (true) {
      if (signal.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete last line in buffer

      for (const line of lines) {
        if (signal.aborted) break;

        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          callbacks.onDone(fullText, { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens });
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            callbacks.onToken(delta);
          }

          // Capture usage if available (some providers include in final chunk)
          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens || 0;
            completionTokens = parsed.usage.completion_tokens || 0;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // If we exited the loop without [DONE], finalize
    if (!signal.aborted && fullText.length > 0) {
      if (!promptTokens) promptTokens = Math.ceil(fullText.length / 4);
      if (!completionTokens) completionTokens = Math.ceil(fullText.length / 4);
      callbacks.onDone(fullText, { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens });
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Mock streaming fallback — simulates token-by-token generation for offline dev.
 */
async function streamMock(
  messages: LLMMessage[],
  model: string,
  startTime: number,
  signal: AbortSignal,
  callbacks: LLMStreamCallbacks
): Promise<void> {
  // Generate full mock response
  const mockResponse = await generateContextualMockResponse(messages, model, startTime);
  const words = mockResponse.text.split(" ");

  let fullText = "";
  for (let i = 0; i < words.length; i++) {
    if (signal.aborted) return;

    const token = (i === 0 ? "" : " ") + words[i];
    fullText += token;
    callbacks.onToken(token);

    // Simulate ~30ms per token
    await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 10));
  }

  if (!signal.aborted) {
    callbacks.onDone(fullText, mockResponse.usage);
  }
}
