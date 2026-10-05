// ─── Real-Time Voice WebSocket Client ───────────────────────────────────────
// Manages the WebSocket connection for streaming voice interactions.
// Provides typed event emitter pattern for all server events.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  RealtimeClientEvent,
  RealtimeServerEvent,
  SessionStartEvent,
} from "@voiceflow/shared";

export type RealtimeEventHandler = (event: RealtimeServerEvent) => void;

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

export class RealtimeVoiceClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers = new Map<string, Set<RealtimeEventHandler>>();
  private globalHandlers = new Set<RealtimeEventHandler>();
  private connectionState: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionConfig: Omit<SessionStartEvent, "type"> | null = null;

  constructor() {
    // Derive WebSocket URL from current page location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // In dev mode, Vite proxies /api to :3001 but not /ws
    // Connect directly to the API server's WebSocket endpoint
    const host = window.location.hostname;
    const port = import.meta.env.DEV ? "3001" : window.location.port;
    this.url = `${protocol}//${host}:${port}/ws/voice`;
  }

  /**
   * Connect to the WebSocket server and start a voice session.
   */
  connect(
    agentId: string,
    conversationId: string,
    config?: { language?: string; voice?: string; sampleRate?: number }
  ): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.disconnect();
    }

    this.sessionConfig = { agentId, conversationId, config };
    this.connectionState = "connecting";
    this.emitStateChange();

    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        this.connectionState = "connected";
        this.reconnectAttempts = 0;
        this.emitStateChange();

        // Send session.start immediately after connection
        this.send({
          type: "session.start",
          ...this.sessionConfig!,
        } as SessionStartEvent);
      };

      this.ws.onmessage = (event) => {
        try {
          const serverEvent = JSON.parse(
            typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data)
          ) as RealtimeServerEvent;

          // Dispatch to type-specific handlers
          const typeHandlers = this.handlers.get(serverEvent.type);
          if (typeHandlers) {
            for (const handler of typeHandlers) {
              handler(serverEvent);
            }
          }

          // Dispatch to global handlers
          for (const handler of this.globalHandlers) {
            handler(serverEvent);
          }
        } catch (err) {
          console.error("[RealtimeClient] Failed to parse server event:", err);
        }
      };

      this.ws.onclose = (event) => {
        console.log(`[RealtimeClient] Connection closed: ${event.code} ${event.reason}`);
        this.ws = null;

        if (this.connectionState !== "disconnected") {
          // Unexpected close — attempt reconnect
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (event) => {
        console.error("[RealtimeClient] WebSocket error:", event);
      };
    } catch (err) {
      console.error("[RealtimeClient] Failed to create WebSocket:", err);
      this.connectionState = "disconnected";
      this.emitStateChange();
    }
  }

  /**
   * Send an audio chunk to the server.
   */
  sendAudioChunk(base64Data: string, seq: number): void {
    this.send({
      type: "audio.chunk",
      data: base64Data,
      seq,
    });
  }

  /**
   * Send an interruption signal (barge-in).
   */
  interrupt(reason = "user_interrupt"): void {
    this.send({
      type: "agent.interrupted",
      reason,
    });
  }

  /**
   * End the session and disconnect.
   */
  disconnect(reason?: string): void {
    this.connectionState = "disconnected";
    this.sessionConfig = null;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: "session.end", reason });
      }
      this.ws.close(1000, reason || "client_disconnect");
      this.ws = null;
    }

    this.emitStateChange();
  }

  /**
   * Register an event handler for a specific event type.
   */
  on(eventType: string, handler: RealtimeEventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Register a global handler that receives all events.
   */
  onAny(handler: RealtimeEventHandler): () => void {
    this.globalHandlers.add(handler);
    return () => {
      this.globalHandlers.delete(handler);
    };
  }

  /**
   * Get current connection state.
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if connected and session is ready.
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.connectionState === "connected";
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private send(event: RealtimeClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("[RealtimeClient] Max reconnect attempts reached");
      this.connectionState = "disconnected";
      this.emitStateChange();
      return;
    }

    this.connectionState = "reconnecting";
    this.emitStateChange();
    this.reconnectAttempts++;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);
    console.log(
      `[RealtimeClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      if (this.sessionConfig) {
        this.connect(
          this.sessionConfig.agentId,
          this.sessionConfig.conversationId,
          this.sessionConfig.config
        );
      }
    }, delay);
  }

  private emitStateChange(): void {
    // Emit as a synthetic event so hooks can track connection state
    const stateHandlers = this.handlers.get("_connection_state");
    if (stateHandlers) {
      const syntheticEvent = {
        type: "_connection_state" as any,
        state: this.connectionState,
      };
      for (const handler of stateHandlers) {
        handler(syntheticEvent as any);
      }
    }
  }
}

// Singleton instance
export const realtimeClient = new RealtimeVoiceClient();
