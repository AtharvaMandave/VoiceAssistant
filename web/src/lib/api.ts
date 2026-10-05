// ─── API Client ─────────────────────────────────────────────────────────────
// Centralized Axios instance with auth token injection and error handling.
// ─────────────────────────────────────────────────────────────────────────────

import axios from "axios";

export const apiClient = axios.create({
  baseURL: "", // Vite proxy handles /api → localhost:3001
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Inject saved auth token on startup
const savedToken = localStorage.getItem("voiceflow_token");
if (savedToken) {
  apiClient.defaults.headers.common["Authorization"] = `Bearer ${savedToken}`;
}

// Request interceptor — attach a client-side request ID for correlation
apiClient.interceptors.request.use((config) => {
  config.headers["x-request-id"] =
    `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return config;
});

// Response interceptor — unwrap errors consistently
// Note: The auth store adds a separate interceptor for automatic token refresh.
// This interceptor handles the final 401 after refresh has been attempted.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && error.config?._retry) {
      // Token refresh already attempted and failed — force logout
      localStorage.removeItem("voiceflow_token");
      if (
        window.location.pathname !== "/login" &&
        window.location.pathname !== "/register" &&
        window.location.pathname !== "/forgot-password"
      ) {
        window.location.href = "/login";
      }
    }
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      console.error(`[API Error] ${apiError.code}: ${apiError.message}`);
    }
    return Promise.reject(error);
  }
);


// ─── Agent API Helpers ──────────────────────────────────────────────────────

import type { Agent, CreateAgentInput, UpdateAgentInput } from "@voiceflow/shared";

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function fetchAgents(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResult<Agent>> {
  const res = await apiClient.get("/api/agents", { params });
  return {
    data: res.data.data,
    pagination: res.data.pagination,
  };
}

export async function fetchAgent(id: string): Promise<Agent> {
  const res = await apiClient.get(`/api/agents/${id}`);
  return res.data.data;
}

export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  const res = await apiClient.post("/api/agents", input);
  return res.data.data;
}

export async function updateAgent(
  id: string,
  input: UpdateAgentInput & { status?: string }
): Promise<Agent> {
  const res = await apiClient.patch(`/api/agents/${id}`, input);
  return res.data.data;
}

export async function deleteAgent(id: string): Promise<void> {
  await apiClient.delete(`/api/agents/${id}`);
}

// ─── Conversation & Playground API Helpers (Phase 2) ─────────────────────────

import type { Conversation, Message } from "@voiceflow/shared";

export async function startConversation(
  agentId: string,
  channel: "playground" | "widget" | "api" = "playground",
  metadata?: Record<string, unknown>
): Promise<Conversation> {
  const res = await apiClient.post(`/api/agents/${agentId}/conversations`, {
    channel,
    metadata,
  });
  return res.data.data;
}

export async function sendConversationMessage(
  conversationId: string,
  content: string
): Promise<{ userMessage: Message; assistantMessage: Message; conversation: Conversation }> {
  const res = await apiClient.post(`/api/conversations/${conversationId}/messages`, {
    content,
  });
  return res.data.data;
}

export async function fetchConversation(
  conversationId: string
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const res = await apiClient.get(`/api/conversations/${conversationId}`);
  return res.data.data;
}

export async function endConversationSession(
  conversationId: string
): Promise<Conversation> {
  const res = await apiClient.post(`/api/conversations/${conversationId}/end`);
  return res.data.data;
}

export async function fetchPromptPreview(
  agentId: string
): Promise<{
  agentId: string;
  agentName: string;
  masterSystemPrompt: string;
  sampleMessages: any[];
}> {
  const res = await apiClient.get(`/api/agents/${agentId}/prompt-preview`);
  return res.data.data;
}

// ─── Knowledge & RAG API Helpers (Phase 3) ───────────────────────────────────

import type { Document, CreateDocumentInput, KnowledgeQueryResult } from "@voiceflow/shared";

export async function fetchDocuments(agentId: string): Promise<Document[]> {
  const res = await apiClient.get(`/api/agents/${agentId}/documents`);
  return res.data.data;
}

export async function createDocument(
  agentId: string,
  input: CreateDocumentInput
): Promise<Document> {
  const res = await apiClient.post(`/api/agents/${agentId}/documents`, input);
  return res.data.data;
}

export async function deleteDocument(agentId: string, docId: string): Promise<void> {
  await apiClient.delete(`/api/agents/${agentId}/documents/${docId}`);
}

export async function reindexDocument(agentId: string, docId: string): Promise<Document> {
  const res = await apiClient.post(`/api/agents/${agentId}/documents/${docId}/reindex`);
  return res.data.data;
}

export async function queryKnowledge(
  agentId: string,
  query: string,
  topK = 5,
  minScore = 0.2
): Promise<KnowledgeQueryResult> {
  const res = await apiClient.post(`/api/agents/${agentId}/knowledge/query`, {
    query,
    topK,
    minScore,
  });
  return res.data.data;
}

// ─── Voice API Helpers (Phase 4) ─────────────────────────────────────────────

import type { VoiceTurnResponse, VoiceTurnInput } from "@voiceflow/shared";

export async function executeVoiceTurn(
  agentId: string,
  conversationId: string,
  input: VoiceTurnInput
): Promise<VoiceTurnResponse> {
  const res = await apiClient.post(
    `/api/agents/${agentId}/conversations/${conversationId}/voice-turn`,
    input
  );
  return res.data.data;
}

export async function synthesizeSpeech(
  text: string,
  voice = "en-US-AriaNeural",
  speed = 1.0,
  pitch = 1.0
): Promise<{ audioBase64: string; format: string; latencyMs: number }> {
  const res = await apiClient.post("/api/voice/synthesize", {
    text,
    voice,
    speed,
    pitch,
  });
  return res.data.data;
}

export async function fetchVoices(): Promise<string[]> {
  const res = await apiClient.get("/api/voice/voices");
  return res.data.data.voices || [];
}

// ─── Tool API Helpers (Phase 7) ──────────────────────────────────────────────

import type { Tool, CreateToolInput, UpdateToolInput } from "@voiceflow/shared";

export async function fetchTools(agentId: string): Promise<Tool[]> {
  const res = await apiClient.get(`/api/agents/${agentId}/tools`);
  return res.data.data.tools;
}

export async function createTool(
  agentId: string,
  input: CreateToolInput
): Promise<Tool> {
  const res = await apiClient.post(`/api/agents/${agentId}/tools`, input);
  return res.data.data;
}

export async function updateTool(
  agentId: string,
  toolId: string,
  input: UpdateToolInput
): Promise<Tool> {
  const res = await apiClient.patch(`/api/agents/${agentId}/tools/${toolId}`, input);
  return res.data.data;
}

export async function deleteTool(agentId: string, toolId: string): Promise<void> {
  await apiClient.delete(`/api/agents/${agentId}/tools/${toolId}`);
}

export async function toggleTool(
  agentId: string,
  toolId: string,
  enabled: boolean
): Promise<Tool> {
  const res = await apiClient.patch(`/api/agents/${agentId}/tools/${toolId}/toggle`, {
    enabled,
  });
  return res.data.data;
}

export async function seedBuiltInTools(agentId: string): Promise<{ tools: Tool[]; count: number }> {
  const res = await apiClient.post(`/api/agents/${agentId}/tools/seed`);
  return res.data.data;
}

export async function testTool(
  agentId: string,
  toolId: string,
  parameters: Record<string, unknown>
): Promise<{ success: boolean; data?: any; error?: string; durationMs: number }> {
  const res = await apiClient.post(`/api/agents/${agentId}/tools/${toolId}/test`, {
    parameters,
  });
  return res.data.data;
}

// ─── Conversations Explorer & Quality Evaluation API (Phase 8) ──────────────

import type { ConversationStats, ConversationQueryInput } from "@voiceflow/shared";

export async function fetchConversations(
  params?: ConversationQueryInput
): Promise<PaginatedResult<Conversation>> {
  const res = await apiClient.get("/api/conversations", { params });
  return {
    data: res.data.data,
    pagination: res.data.pagination,
  };
}

export async function fetchConversationStats(): Promise<ConversationStats> {
  const res = await apiClient.get("/api/conversations/stats");
  return res.data.data;
}

export async function evaluateConversation(
  conversationId: string
): Promise<{ conversation: Conversation; evaluation: any }> {
  const res = await apiClient.post(`/api/conversations/${conversationId}/evaluate`);
  return res.data.data;
}

export async function toggleConversationEscalation(
  conversationId: string,
  escalated?: boolean,
  reason?: string
): Promise<Conversation> {
  const res = await apiClient.post(`/api/conversations/${conversationId}/escalate`, {
    escalated,
    reason,
  });
  return res.data.data;
}

// ─── Phase 9: SaaS API (API Keys, Webhooks, Billing, Team RBAC) ──────────────

import type {
  ApiKey,
  CreatedApiKeyResponse,
  CreateApiKeyInput,
  Webhook,
  CreateWebhookInput,
  OrgUsageSummary,
  TeamMember,
  InviteMemberInput,
  UpdateMemberRoleInput,
} from "@voiceflow/shared";

// API Keys
export async function fetchApiKeys(): Promise<ApiKey[]> {
  const res = await apiClient.get("/api/api-keys");
  return res.data.data;
}

export async function createApiKey(
  input: CreateApiKeyInput
): Promise<CreatedApiKeyResponse> {
  const res = await apiClient.post("/api/api-keys", input);
  return res.data.data;
}

export async function revokeApiKey(id: string): Promise<void> {
  await apiClient.delete(`/api/api-keys/${id}`);
}

// Webhooks
export async function fetchWebhooks(): Promise<Webhook[]> {
  const res = await apiClient.get("/api/webhooks");
  return res.data.data;
}

export async function createWebhook(
  input: CreateWebhookInput
): Promise<Webhook & { secretKey: string }> {
  const res = await apiClient.post("/api/webhooks", input);
  return res.data.data;
}

export async function testWebhook(
  id: string
): Promise<{ delivered: boolean; statusCode: number; durationMs: number; timestamp: string }> {
  const res = await apiClient.post(`/api/webhooks/${id}/test`);
  return res.data.data;
}

export async function deleteWebhook(id: string): Promise<void> {
  await apiClient.delete(`/api/webhooks/${id}`);
}

// Usage & Billing
export async function fetchUsageAndBilling(): Promise<OrgUsageSummary> {
  const res = await apiClient.get("/api/billing/usage");
  return res.data.data;
}

export async function updateOrgPlan(
  plan: "free" | "pro" | "enterprise"
): Promise<{ message: string; plan: string }> {
  const res = await apiClient.post("/api/billing/plan", { plan });
  return res.data.data;
}

// Team & RBAC
export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const res = await apiClient.get("/api/organizations/members");
  return res.data.data;
}

export async function inviteTeamMember(
  input: InviteMemberInput
): Promise<TeamMember> {
  const res = await apiClient.post("/api/organizations/members", input);
  return res.data.data;
}

export async function updateTeamMemberRole(
  memberId: string,
  input: UpdateMemberRoleInput
): Promise<{ id: string; role: string }> {
  const res = await apiClient.patch(`/api/organizations/members/${memberId}`, input);
  return res.data.data;
}

export async function removeTeamMember(memberId: string): Promise<void> {
  await apiClient.delete(`/api/organizations/members/${memberId}`);
}


