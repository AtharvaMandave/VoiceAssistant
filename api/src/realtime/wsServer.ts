// ─── WebSocket Voice Server ─────────────────────────────────────────────────
// Attaches a WebSocket server to the Express HTTP server for real-time voice
// streaming. Manages voice session lifecycle, event routing, and cleanup.
// Path: ws://localhost:3001/ws/voice
// ─────────────────────────────────────────────────────────────────────────────

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HTTPServer } from "http";
import { randomUUID } from "crypto";
import type { RealtimeClientEvent, SessionStartEvent } from "@voiceflow/shared";
import { VoiceSession, type VoiceSessionConfig } from "./VoiceSession.js";
import { AgentModel } from "../models/Agent.js";
import { ConversationModel } from "../models/Conversation.js";

// Active sessions mapped by sessionId
const activeSessions = new Map<string, VoiceSession>();

// Map WebSocket instances to their session for cleanup
const wsToSession = new Map<WebSocket, VoiceSession>();

let wss: WebSocketServer | null = null;

/**
 * Initialize the WebSocket server and attach it to the HTTP server.
 */
export function initializeWebSocketServer(server: HTTPServer): WebSocketServer {
  wss = new WebSocketServer({
    server,
    path: "/ws/voice",
    maxPayload: 5 * 1024 * 1024, // 5MB max payload for audio chunks
  });

  console.log("🔌 WebSocket voice server attached at /ws/voice");

  wss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress || "unknown";
    console.log(`[WS] New connection from ${clientIp}`);

    // Set up ping/pong keepalive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on("message", async (rawData) => {
      try {
        const event = JSON.parse(rawData.toString()) as RealtimeClientEvent;
        await handleClientEvent(ws, event);
      } catch (err: any) {
        console.error("[WS] Failed to parse message:", err.message);
        sendError(ws, "PARSE_ERROR", "Invalid message format");
      }
    });

    ws.on("close", async (code, reason) => {
      clearInterval(pingInterval);
      console.log(`[WS] Connection closed (code=${code}, reason=${reason.toString()})`);
      await cleanupConnection(ws);
    });

    ws.on("error", async (err) => {
      console.error("[WS] Connection error:", err.message);
      clearInterval(pingInterval);
      await cleanupConnection(ws);
    });

    ws.on("pong", () => {
      // Client is alive
    });
  });

  wss.on("error", (err) => {
    console.error("[WS Server] Error:", err.message);
  });

  return wss;
}

/**
 * Shut down the WebSocket server gracefully.
 */
export async function shutdownWebSocketServer(): Promise<void> {
  if (!wss) return;

  // Close all active sessions
  for (const [, session] of activeSessions) {
    await session.cleanup();
  }
  activeSessions.clear();
  wsToSession.clear();

  return new Promise((resolve) => {
    wss!.close(() => {
      console.log("[WS Server] Shut down");
      wss = null;
      resolve();
    });
  });
}

/**
 * Get the count of active voice sessions.
 */
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

// ─── Event Routing ──────────────────────────────────────────────────────────

async function handleClientEvent(
  ws: WebSocket,
  event: RealtimeClientEvent
): Promise<void> {
  switch (event.type) {
    case "session.start":
      await handleSessionStart(ws, event as SessionStartEvent);
      break;

    case "audio.chunk": {
      const session = wsToSession.get(ws);
      if (!session) {
        sendError(ws, "NO_SESSION", "No active session. Send session.start first.");
        return;
      }
      await session.handleAudioChunk(event.data, event.seq);
      break;
    }

    case "agent.interrupted": {
      const session = wsToSession.get(ws);
      if (session) {
        await session.interrupt(event.reason || "user_interrupt");
      }
      break;
    }

    case "session.end": {
      const session = wsToSession.get(ws);
      if (session) {
        await session.cleanup();
        activeSessions.delete(session.sessionId);
        wsToSession.delete(ws);
        sendJSON(ws, { type: "session.end", reason: event.reason || "client_ended" });
      }
      break;
    }

    default:
      sendError(ws, "UNKNOWN_EVENT", `Unknown event type: ${(event as any).type}`);
  }
}

/**
 * Handle session.start: validate agent/conversation, create VoiceSession.
 */
async function handleSessionStart(
  ws: WebSocket,
  event: SessionStartEvent
): Promise<void> {
  const { agentId, conversationId } = event;

  if (!agentId || !conversationId) {
    sendError(ws, "INVALID_SESSION", "agentId and conversationId are required");
    return;
  }

  // Check if this WebSocket already has a session
  const existingSession = wsToSession.get(ws);
  if (existingSession) {
    await existingSession.cleanup();
    activeSessions.delete(existingSession.sessionId);
    wsToSession.delete(ws);
  }

  try {
    // Validate agent exists
    const agent = await AgentModel.findById(agentId);
    if (!agent) {
      sendError(ws, "AGENT_NOT_FOUND", `Agent "${agentId}" not found`);
      return;
    }

    // Validate conversation exists and belongs to agent
    const conversation = await ConversationModel.findOne({
      _id: conversationId,
      agentId,
    });
    if (!conversation) {
      sendError(ws, "CONVERSATION_NOT_FOUND", `Conversation "${conversationId}" not found`);
      return;
    }
    if (conversation.status === "ended") {
      sendError(ws, "CONVERSATION_ENDED", "Cannot stream to an ended conversation");
      return;
    }

    const sessionId = `vs_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const language = event.config?.language || agent.languages?.[0] || "en";
    const voice = event.config?.voice || agent.voice?.voiceId || "en-US-AriaNeural";

    const config: VoiceSessionConfig = {
      sessionId,
      agentId,
      conversationId,
      organizationId: agent.organizationId.toString(),
      language,
      voice,
      sampleRate: event.config?.sampleRate || 16000,
      chunkDurationMs: event.config?.chunkDurationMs || 250,
    };

    const session = new VoiceSession(ws, config);
    activeSessions.set(sessionId, session);
    wsToSession.set(ws, session);

    sendJSON(ws, {
      type: "session.ready",
      sessionId,
      config: {
        sampleRate: config.sampleRate,
        chunkDurationMs: config.chunkDurationMs,
        language,
        voice,
      },
    });

    console.log(`[WS] Session ${sessionId} started for agent ${agentId}`);
  } catch (err: any) {
    console.error("[WS] Session start error:", err.message);
    sendError(ws, "SESSION_ERROR", err.message || "Failed to start session");
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function cleanupConnection(ws: WebSocket): Promise<void> {
  const session = wsToSession.get(ws);
  if (session) {
    await session.cleanup();
    activeSessions.delete(session.sessionId);
    wsToSession.delete(ws);
    console.log(`[WS] Session ${session.sessionId} cleaned up`);
  }
}

function sendJSON(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendError(ws: WebSocket, code: string, message: string): void {
  sendJSON(ws, { type: "error", code, message });
}
