// ─── Tool Execution Service ─────────────────────────────────────────────────
// Orchestrates the LLM ↔ Tool calling loop:
// 1. Sends tool definitions to the LLM via the `tools` parameter.
// 2. Detects `tool_calls` in LLM response.
// 3. Executes each tool securely via the Tool Registry.
// 4. Feeds tool results back to the LLM for a natural voice-friendly response.
// ─────────────────────────────────────────────────────────────────────────────

import { env } from "../../config/env.js";
import { ToolModel, type IToolDocument } from "../../models/Tool.js";
import {
  executeTool,
  toolDocsToLLMDefinitions,
  type ToolExecutionContext,
} from "./toolRegistry.js";
import type {
  ToolExecutionRecord,
  LLMToolDefinition,
} from "@voiceflow/shared";
import type { LLMMessage } from "../llm/types.js";

/** Maximum number of tool-calling iterations (prevents infinite loops) */
const MAX_TOOL_ITERATIONS = 5;

/** Timeout for the entire tool-augmented generation (30 seconds) */
const TOOL_LOOP_TIMEOUT_MS = 30_000;

export interface ToolAugmentedResponse {
  /** Final assistant text after all tool calls resolve */
  text: string;
  /** Model used for generation */
  model: string;
  /** Provider (groq, openai, etc.) */
  provider: string;
  /** Token usage across all iterations */
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  /** Total latency including tool executions */
  latencyMs: number;
  /** Ordered list of tool calls performed during this turn */
  toolCalls: ToolExecutionRecord[];
  /** Whether any tools were actually called */
  usedTools: boolean;
}

/**
 * Load all enabled tools for an agent and convert them to LLM tool definitions.
 */
export async function loadAgentTools(agentId: string): Promise<{
  toolDocs: IToolDocument[];
  llmTools: LLMToolDefinition[];
}> {
  const toolDocs = await ToolModel.find({
    agentId,
    enabled: true,
  }).lean() as unknown as IToolDocument[];

  const llmTools = toolDocsToLLMDefinitions(toolDocs);
  return { toolDocs, llmTools };
}

/**
 * Generate an LLM response with tool calling support.
 * Implements the full tool-calling loop: LLM → tool_calls → execute → feed back → final response.
 */
export async function generateWithTools(
  messages: LLMMessage[],
  toolDocs: IToolDocument[],
  llmTools: LLMToolDefinition[],
  context: ToolExecutionContext,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onToolStart?: (toolName: string, args: Record<string, unknown>, toolCallId?: string) => void;
    onToolComplete?: (record: ToolExecutionRecord) => void;
  } = {}
): Promise<ToolAugmentedResponse> {
  const startTime = Date.now();
  const toolCalls: ToolExecutionRecord[] = [];
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  // Build a lookup map for tool documents by name
  const toolDocMap = new Map<string, IToolDocument>();
  for (const doc of toolDocs) {
    toolDocMap.set(doc.name, doc);
  }

  // Working copy of messages to append tool results
  const workingMessages = [...messages];

  // Determine provider and API key
  const provider = detectToolProvider(options.model);
  const model = options.model || getToolDefaultModel(provider);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    // Timeout check
    if (Date.now() - startTime > TOOL_LOOP_TIMEOUT_MS) {
      console.warn("[Tool Service] Tool loop timeout reached, returning last state");
      break;
    }

    // Call LLM with tools
    const llmResult = await callLLMWithTools(
      workingMessages,
      llmTools,
      provider,
      model,
      options
    );

    // Accumulate usage
    totalUsage.promptTokens += llmResult.usage.promptTokens;
    totalUsage.completionTokens += llmResult.usage.completionTokens;
    totalUsage.totalTokens += llmResult.usage.totalTokens;

    // Case 1: No tool calls — LLM returned a final text response
    if (!llmResult.toolCalls || llmResult.toolCalls.length === 0) {
      return {
        text: llmResult.text,
        model: llmResult.model,
        provider,
        usage: totalUsage,
        latencyMs: Date.now() - startTime,
        toolCalls,
        usedTools: toolCalls.length > 0,
      };
    }

    // Case 2: LLM requested tool calls — execute each one
    // Add the assistant message with tool_calls to history
    workingMessages.push({
      role: "assistant",
      content: llmResult.text || "",
      // Store raw tool call data for the next iteration
      name: "__tool_calls__",
    });

    for (const tc of llmResult.toolCalls) {
      const toolDoc = toolDocMap.get(tc.functionName);

      if (!toolDoc) {
        // Tool not found — feed error back to LLM
        const errorRecord: ToolExecutionRecord = {
          toolName: tc.functionName,
          toolId: "unknown",
          input: tc.arguments,
          status: "error",
          error: `Tool "${tc.functionName}" is not registered for this agent`,
          durationMs: 0,
          riskLevel: "low",
          timestamp: new Date().toISOString(),
        };
        toolCalls.push(errorRecord);

        workingMessages.push({
          role: "tool",
          content: JSON.stringify({ error: errorRecord.error }),
          name: tc.functionName,
        });
        continue;
      }

      // Notify tool start
      if (options.onToolStart) {
        try {
          options.onToolStart(tc.functionName, tc.arguments, tc.id);
        } catch {
          // Non-fatal
        }
      }

      // Execute the tool
      console.log(`[Tool Service] Executing tool "${tc.functionName}" with params:`, tc.arguments);
      const result = await executeTool(tc.functionName, tc.arguments, toolDoc, context);

      const record: ToolExecutionRecord = {
        toolName: tc.functionName,
        toolId: toolDoc._id?.toString() || "unknown",
        input: tc.arguments,
        output: result.data,
        status: result.success ? "success" : "error",
        error: result.error,
        durationMs: result.durationMs,
        riskLevel: toolDoc.riskLevel,
        timestamp: new Date().toISOString(),
      };
      toolCalls.push(record);

      // Notify tool complete
      if (options.onToolComplete) {
        try {
          options.onToolComplete(record);
        } catch {
          // Non-fatal
        }
      }

      // Update execution stats (non-blocking)
      ToolModel.findByIdAndUpdate(toolDoc._id, {
        $inc: { executionCount: 1 },
        lastExecutedAt: new Date(),
      }).catch((err) => console.warn("[Tool Service] Stats update failed:", err));

      // Feed tool result back to the LLM
      workingMessages.push({
        role: "tool",
        content: JSON.stringify(result.success ? result.data : { error: result.error }),
        name: tc.functionName,
      });
    }
  }

  // If we exhausted iterations, generate a final response without tools
  console.warn("[Tool Service] Max tool iterations reached, generating final response");
  const finalResult = await callLLMWithTools(workingMessages, [], provider, model, options);

  return {
    text: finalResult.text,
    model: finalResult.model,
    provider,
    usage: {
      promptTokens: totalUsage.promptTokens + finalResult.usage.promptTokens,
      completionTokens: totalUsage.completionTokens + finalResult.usage.completionTokens,
      totalTokens: totalUsage.totalTokens + finalResult.usage.totalTokens,
    },
    latencyMs: Date.now() - startTime,
    toolCalls,
    usedTools: toolCalls.length > 0,
  };
}

// ─── Internal: LLM API calls with tool support ──────────────────────────────

interface LLMToolCallResult {
  text: string;
  model: string;
  toolCalls?: Array<{
    id: string;
    functionName: string;
    arguments: Record<string, unknown>;
  }>;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

function detectToolProvider(model?: string): "groq" | "openai" {
  if (!model) {
    if (env.GROQ_API_KEY) return "groq";
    if (env.OPENAI_API_KEY) return "openai";
    return "groq"; // default
  }
  const m = model.toLowerCase();
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3")) return "openai";
  return "groq";
}

function getToolDefaultModel(provider: string): string {
  return provider === "openai" ? "gpt-4o-mini" : "llama-3.3-70b-versatile";
}

async function callLLMWithTools(
  messages: LLMMessage[],
  tools: LLMToolDefinition[],
  provider: string,
  model: string,
  options: { temperature?: number; maxTokens?: number }
): Promise<LLMToolCallResult> {
  const apiKey = provider === "openai" ? env.OPENAI_API_KEY : env.GROQ_API_KEY;
  const baseUrl =
    provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://api.groq.com/openai/v1/chat/completions";

  if (!apiKey) {
    // Fallback: return mock response when no API key is available
    return generateMockToolResponse(messages, model);
  }

  // Format messages for the API (filter out internal markers)
  const apiMessages = messages
    .filter((m) => m.name !== "__tool_calls__")
    .map((m) => {
      const msg: Record<string, unknown> = {
        role: m.role,
        content: m.content,
      };
      if (m.role === "tool" && m.name) {
        msg.name = m.name;
        // Groq/OpenAI require tool_call_id — use name as fallback
        msg.tool_call_id = `call_${m.name}`;
      }
      return msg;
    });

  const body: Record<string, unknown> = {
    model,
    messages: apiMessages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 512,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // If model not found on Groq, retry with a known-good model
    if (res.status === 404 && provider === "groq" && model !== "llama-3.3-70b-versatile") {
      return callLLMWithTools(messages, tools, provider, "llama-3.3-70b-versatile", options);
    }
    const errorText = await res.text();
    throw new Error(`${provider} tool-calling API returned ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as any;
  const choice = data.choices?.[0];
  const message = choice?.message;
  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  // Parse tool calls from the response
  let toolCalls: LLMToolCallResult["toolCalls"] = undefined;
  if (message?.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    toolCalls = message.tool_calls.map((tc: any) => ({
      id: tc.id || `call_${tc.function?.name}`,
      functionName: tc.function?.name || "",
      arguments: safeParseJSON(tc.function?.arguments),
    }));
  }

  return {
    text: message?.content || "",
    model: data.model || model,
    toolCalls,
    usage: {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
  };
}

/**
 * Mock response for tool calling when no API keys are available.
 * Detects tool-related intent and simulates the calling loop.
 */
async function generateMockToolResponse(
  messages: LLMMessage[],
  model: string
): Promise<LLMToolCallResult> {
  await new Promise((r) => setTimeout(r, 150));

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const lower = lastUserMsg.toLowerCase();

  // Check if this is a tool result message (we need to generate a natural response)
  const lastToolMsg = [...messages].reverse().find((m) => m.role === "tool");
  if (lastToolMsg) {
    // Generate a natural response based on tool output
    const toolData = safeParseJSON(lastToolMsg.content);
    let reply = "";

    if (lastToolMsg.name === "check_order" && toolData.orderId) {
      reply = `I found your order ${toolData.orderId}. It's currently ${toolData.status} via ${toolData.carrier}. Your tracking number is ${toolData.trackingNumber} and the estimated delivery is ${toolData.estimatedDelivery}. Is there anything else I can help you with?`;
    } else if (lastToolMsg.name === "search_product" && toolData.products) {
      const products = toolData.products as any[];
      if (products.length > 0) {
        reply = `I found ${toolData.totalResults} products matching your search. The top result is the ${products[0].name} at $${products[0].price}, which is currently ${products[0].stockStatus}. Would you like more details on any of these?`;
      } else {
        reply = `I wasn't able to find products matching "${toolData.query}". Could you try a different search term?`;
      }
    } else if (lastToolMsg.name === "book_appointment" && toolData.confirmationId) {
      reply = `Your appointment has been confirmed! Here are the details: Confirmation ID ${toolData.confirmationId}, scheduled for ${toolData.date} at ${toolData.time} for ${toolData.clientName}. ${toolData.reminder}`;
    } else if (lastToolMsg.name === "create_ticket" && toolData.ticketId) {
      reply = `I've created a support ticket for you. Your ticket ID is ${toolData.ticketId} with ${toolData.priority} priority. Our team will respond within ${toolData.estimatedResponseTime}. Is there anything else I can help with?`;
    } else if (toolData.error) {
      reply = `I encountered an issue: ${toolData.error}. Could you provide the correct information so I can try again?`;
    } else {
      reply = `I've processed your request. The result is: ${JSON.stringify(toolData)}. Is there anything else you need?`;
    }

    return {
      text: reply,
      model: `${model} (Dev Mode)`,
      usage: { promptTokens: 50, completionTokens: Math.ceil(reply.length / 4), totalTokens: 50 + Math.ceil(reply.length / 4) },
    };
  }

  // Detect if user wants to use a tool
  if (lower.includes("order") && (lower.includes("check") || lower.includes("status") || lower.includes("track") || lower.includes("where"))) {
    // Extract order ID
    const orderMatch = lastUserMsg.match(/\b(ORD[-\s]?\w+|\d{4,})\b/i);
    const orderId = orderMatch?.[1] || "ORD-12345";
    return {
      text: "",
      model: `${model} (Dev Mode)`,
      toolCalls: [{ id: "call_check_order", functionName: "check_order", arguments: { orderId } }],
      usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
    };
  }

  if (lower.includes("search") || lower.includes("find") || lower.includes("looking for") || lower.includes("product")) {
    const query = lastUserMsg.replace(/^(can you |please |i want to |i'm looking for |search for |find )/i, "").trim();
    return {
      text: "",
      model: `${model} (Dev Mode)`,
      toolCalls: [{ id: "call_search_product", functionName: "search_product", arguments: { query } }],
      usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
    };
  }

  if (lower.includes("book") || lower.includes("appointment") || lower.includes("schedule")) {
    return {
      text: "",
      model: `${model} (Dev Mode)`,
      toolCalls: [
        {
          id: "call_book_appointment",
          functionName: "book_appointment",
          arguments: {
            date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
            time: "10:00",
            clientName: "Customer",
          },
        },
      ],
      usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
    };
  }

  if (lower.includes("ticket") || lower.includes("support") || lower.includes("issue") || lower.includes("problem") || lower.includes("complaint")) {
    return {
      text: "",
      model: `${model} (Dev Mode)`,
      toolCalls: [
        {
          id: "call_create_ticket",
          functionName: "create_ticket",
          arguments: {
            subject: lastUserMsg.slice(0, 100),
            description: lastUserMsg,
            priority: lower.includes("urgent") ? "urgent" : lower.includes("important") ? "high" : "medium",
          },
        },
      ],
      usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
    };
  }

  // No tool needed — return plain text
  return {
    text: "I'd be happy to help! I can check order statuses, search our product catalog, book appointments, or create support tickets. What would you like to do?",
    model: `${model} (Dev Mode)`,
    usage: { promptTokens: 30, completionTokens: 40, totalTokens: 70 },
  };
}

function safeParseJSON(str: unknown): Record<string, unknown> {
  if (typeof str === "object" && str !== null) return str as Record<string, unknown>;
  if (typeof str !== "string") return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
