// ─── useRealtimeVoice Hook ──────────────────────────────────────────────────
// React hook encapsulating real-time voice flow: microphone streaming,
// partial transcripts, streaming text/audio, and barge-in.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from "react";
import { realtimeClient, type ConnectionState } from "../lib/realtimeClient";
import type {
  RealtimeServerEvent,
  VoiceSessionState,
  TranscriptPartialEvent,
  TranscriptFinalEvent,
  ResponseTextDeltaEvent,
  ResponseAudioChunkEvent,
  ResponseDoneEvent,
  RealtimeErrorEvent,
  SessionReadyEvent,
  VoiceLatencyMetrics,
} from "@voiceflow/shared";

export interface RealtimeVoiceState {
  /** Current voice session state */
  sessionState: VoiceSessionState | "connecting";
  /** WebSocket connection state */
  connectionState: ConnectionState;
  /** Live partial transcript as user speaks */
  partialTranscript: string;
  /** Final user transcript */
  finalTranscript: string;
  /** Accumulating assistant response text during streaming */
  streamingResponse: string;
  /** Whether the assistant response is still streaming */
  isStreaming: boolean;
  /** Session ID from the server */
  sessionId: string | null;
  /** Last error message */
  error: string | null;
  /** Latency metrics from last completed turn */
  lastLatencies: VoiceLatencyMetrics | null;
}

export interface UseRealtimeVoiceReturn extends RealtimeVoiceState {
  /** Connect and start a real-time voice session */
  connect: (agentId: string, conversationId: string) => void;
  /** Start listening (opens microphone and begins streaming) */
  startListening: () => Promise<void>;
  /** Stop listening (closes microphone) */
  stopListening: () => void;
  /** Interrupt the agent (barge-in) */
  interrupt: () => void;
  /** Disconnect and end the session */
  disconnect: () => void;
  /** Whether the microphone is actively recording */
  isRecording: boolean;
}

export function useRealtimeVoice(): UseRealtimeVoiceReturn {
  const [state, setState] = useState<RealtimeVoiceState>({
    sessionState: "idle",
    connectionState: "disconnected",
    partialTranscript: "",
    finalTranscript: "",
    streamingResponse: "",
    isStreaming: false,
    sessionId: null,
    error: null,
    lastLatencies: null,
  });

  const [isRecording, setIsRecording] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunkSeqRef = useRef(0);
  const audioQueueRef = useRef<{ data: string; format?: string }[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Event Handlers ────────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    unsubscribers.push(
      realtimeClient.on("_connection_state", ((event: any) => {
        setState((prev) => ({ ...prev, connectionState: event.state }));
      }) as any)
    );

    unsubscribers.push(
      realtimeClient.on("session.ready", ((event: RealtimeServerEvent) => {
        const e = event as SessionReadyEvent;
        setState((prev) => ({
          ...prev,
          sessionState: "idle",
          sessionId: e.sessionId,
          error: null,
        }));
      }) as any)
    );

    unsubscribers.push(
      realtimeClient.on("speech.started", (() => {
        setState((prev) => ({
          ...prev,
          sessionState: "listening",
          partialTranscript: "",
          finalTranscript: "",
        }));
      }) as any)
    );

    unsubscribers.push(
      realtimeClient.on("transcript.partial", ((event: RealtimeServerEvent) => {
        const e = event as TranscriptPartialEvent;
        setState((prev) => ({ ...prev, partialTranscript: e.text }));
      }) as any)
    );

    unsubscribers.push(
      realtimeClient.on("transcript.final", ((event: RealtimeServerEvent) => {
        const e = event as TranscriptFinalEvent;
        setState((prev) => ({
          ...prev,
          finalTranscript: e.text,
          partialTranscript: "",
          sessionState: "processing",
        }));
      }) as any)
    );

    unsubscribers.push(
      realtimeClient.on("agent.thinking", (() => {
        setState((prev) => ({
          ...prev,
          sessionState: "processing",
          streamingResponse: "",
          isStreaming: true,
        }));
      }) as any)
    );

    unsubscribers.push(
      realtimeClient.on("response.text.delta", ((event: RealtimeServerEvent) => {
        const e = event as ResponseTextDeltaEvent;
        if (e.isFinal) {
          setState((prev) => ({ ...prev, isStreaming: false }));
        } else {
          setState((prev) => ({
            ...prev,
            sessionState: "speaking",
            streamingResponse: prev.streamingResponse + e.text,
          }));
        }
      }) as any)
    );

    unsubscribers.push(
      realtimeClient.on("response.audio.chunk", ((event: RealtimeServerEvent) => {
        const e = event as ResponseAudioChunkEvent;
        audioQueueRef.current.push({ data: e.data, format: e.format });
        playNextAudioChunk();
      }) as any)
    );

    unsubscribers.push(
      realtimeClient.on("response.done", ((event: RealtimeServerEvent) => {
        const e = event as ResponseDoneEvent;
        setState((prev) => ({
          ...prev,
          sessionState: "idle",
          isStreaming: false,
          lastLatencies: e.latencies,
        }));
      }) as any)
    );

    unsubscribers.push(
      realtimeClient.on("agent.interrupted", (() => {
        // Stop audio playback
        stopAudioPlayback();
        setState((prev) => ({
          ...prev,
          sessionState: "idle",
          isStreaming: false,
        }));
      }) as any)
    );

    unsubscribers.push(
      realtimeClient.on("error", ((event: RealtimeServerEvent) => {
        const e = event as RealtimeErrorEvent;
        setState((prev) => ({
          ...prev,
          error: `${e.code}: ${e.message}`,
          sessionState: "idle",
          isStreaming: false,
        }));
      }) as any)
    );

    unsubscribers.push(
      realtimeClient.on("session.end", (() => {
        setState((prev) => ({
          ...prev,
          sessionState: "closed",
          sessionId: null,
        }));
      }) as any)
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  // ─── Audio Playback Queue ──────────────────────────────────────────────

  const playNextAudioChunk = useCallback(() => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    const chunk = audioQueueRef.current.shift()!;
    isPlayingRef.current = true;

    const format = chunk.format || "audio/mp3";
    const audioDataUrl = `data:${format};base64,${chunk.data}`;
    const audio = new Audio(audioDataUrl);
    currentAudioRef.current = audio;

    audio.onended = () => {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      playNextAudioChunk(); // Play next chunk in queue
    };

    audio.onerror = () => {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      playNextAudioChunk();
    };

    audio.play().catch(() => {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      playNextAudioChunk();
    });
  }, []);

  const stopAudioPlayback = useCallback(() => {
    audioQueueRef.current = [];
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    isPlayingRef.current = false;
  }, []);

  // ─── Microphone ────────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = recorder;
      audioChunkSeqRef.current = 0;

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && realtimeClient.isConnected()) {
          const buffer = await event.data.arrayBuffer();
          const base64 = btoa(
            String.fromCharCode(...new Uint8Array(buffer))
          );
          audioChunkSeqRef.current++;
          realtimeClient.sendAudioChunk(base64, audioChunkSeqRef.current);
        }
      };

      // Request data every 250ms (4 chunks per second)
      recorder.start(250);
      setIsRecording(true);

      setState((prev) => ({
        ...prev,
        sessionState: "listening",
        partialTranscript: "",
        finalTranscript: "",
        streamingResponse: "",
        error: null,
      }));
    } catch (err: any) {
      console.error("[useRealtimeVoice] Microphone access denied:", err);
      setState((prev) => ({
        ...prev,
        error: "Microphone access denied. Please allow microphone access.",
      }));
    }
  }, []);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // ─── Session Controls ──────────────────────────────────────────────────

  const connect = useCallback((agentId: string, conversationId: string) => {
    setState((prev) => ({
      ...prev,
      sessionState: "connecting" as any,
      connectionState: "connecting",
      error: null,
    }));
    realtimeClient.connect(agentId, conversationId);
  }, []);

  const interrupt = useCallback(() => {
    stopAudioPlayback();
    realtimeClient.interrupt("user_interrupt");
    setState((prev) => ({
      ...prev,
      sessionState: "idle",
      isStreaming: false,
    }));
  }, [stopAudioPlayback]);

  const disconnect = useCallback(() => {
    stopListening();
    stopAudioPlayback();
    realtimeClient.disconnect("user_disconnect");
    setState({
      sessionState: "idle",
      connectionState: "disconnected",
      partialTranscript: "",
      finalTranscript: "",
      streamingResponse: "",
      isStreaming: false,
      sessionId: null,
      error: null,
      lastLatencies: null,
    });
  }, [stopListening, stopAudioPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      stopAudioPlayback();
    };
  }, [stopListening, stopAudioPlayback]);

  return {
    ...state,
    connect,
    startListening,
    stopListening,
    interrupt,
    disconnect,
    isRecording,
  };
}
