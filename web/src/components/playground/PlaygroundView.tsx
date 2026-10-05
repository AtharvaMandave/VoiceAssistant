import { useState, useEffect, useRef } from "react";
import type { Agent, Conversation, Message } from "@voiceflow/shared";
import {
  startConversation,
  sendConversationMessage,
  fetchPromptPreview,
  executeVoiceTurn,
} from "../../lib/api";
import { useRealtimeVoice } from "../../hooks/useRealtimeVoice";

interface PlaygroundViewProps {
  agent: Agent;
}

export function PlaygroundView({ agent }: PlaygroundViewProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(true);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [masterPrompt, setMasterPrompt] = useState<string>("");
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});

  // ─── Voice State (Phase 4) ──────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  // ─── Voice Mode (Phase 5) ──────────────────────────────────────────────────
  const [voiceMode, setVoiceMode] = useState<"push-to-talk" | "realtime">("push-to-talk");
  const realtime = useRealtimeVoice();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, voiceProcessing, realtime.streamingResponse, realtime.partialTranscript]);

  // Clean up audio & recording timers on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Initialize new conversation session on mount or reset
  const initSession = async () => {
    setStarting(true);
    setVoiceError(null);
    try {
      const conv = await startConversation(agent.id, "playground", {
        agentTemplate: agent.template,
        timestamp: new Date().toISOString(),
      });
      setConversation(conv);

      const initialGreeting: Message = {
        id: "greeting-" + Date.now(),
        conversationId: conv.id,
        role: "assistant",
        content:
          agent.widget?.welcomeMessage ||
          `Hello! I am ${agent.name}. How can I help you today?`,
        latencyMs: 0,
        model: agent.llmConfig?.model || "voiceflow-llm",
        createdAt: new Date().toISOString(),
      };
      setMessages([initialGreeting]);
    } catch (err) {
      console.error("Failed to start playground conversation:", err);
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (agent?.id) {
      initSession();
    }
  }, [agent.id]);

  // ─── Text Turn Handling ─────────────────────────────────────────────────────
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || !conversation || loading || starting) return;

    setInput("");
    setVoiceError(null);

    const userMsg: Message = {
      id: "user-" + Date.now(),
      conversationId: conversation.id,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const resp = await sendConversationMessage(conversation.id, text);
      if (resp?.assistantMessage) {
        setMessages((prev) => [...prev, resp.assistantMessage]);
      }
    } catch (err: any) {
      console.error("Failed to send message:", err);
      const errorMsg: Message = {
        id: "err-" + Date.now(),
        conversationId: conversation.id,
        role: "system",
        content: "Error: " + (err.response?.data?.error?.message || err.message || "Failed to respond"),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Push-to-Talk Voice Turn Handling (Phase 4) ─────────────────────────────
  const startVoiceRecording = async () => {
    if (isRecording || loading || starting) return;
    setVoiceError(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size > 1000) {
          await submitVoiceRecording(audioBlob);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      setVoiceError("Microphone access was denied. Please allow microphone permissions in your browser.");
    }
  };

  const stopVoiceRecording = () => {
    if (!isRecording || !mediaRecorderRef.current) return;
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    if (mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const submitVoiceRecording = async (audioBlob: Blob) => {
    if (!conversation) return;
    setVoiceProcessing(true);
    setVoiceError(null);

    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      try {
        const base64Data = (reader.result as string).split(",")[1];
        const resp = await executeVoiceTurn(agent.id, conversation.id, {
          audioBase64: base64Data,
          audioFormat: "audio/webm",
          mimeType: audioBlob.type || "audio/webm",
        });

        if (resp.userMessage && resp.assistantMessage) {
          setMessages((prev) => [...prev, resp.userMessage, resp.assistantMessage]);
        }

        if (resp.audioBase64 && resp.assistantMessage) {
          playSynthesizedAudio(resp.assistantMessage.id, resp.audioBase64, resp.audioFormat || "audio/mp3");
        }
      } catch (err: any) {
        console.error("Voice turn error:", err);
        setVoiceError(err.response?.data?.error?.message || err.message || "Voice processing failed.");
        setMessages((prev) => [
          ...prev,
          {
            id: "err-" + Date.now(),
            conversationId: conversation.id,
            role: "system",
            content: "Voice turn error: " + (err.response?.data?.error?.message || err.message),
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setVoiceProcessing(false);
      }
    };
  };

  // ─── Playback Handling ──────────────────────────────────────────────────────
  const playSynthesizedAudio = (messageId: string, audioBase64: string, format = "audio/mp3") => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }

    if (playingAudioId === messageId) {
      setPlayingAudioId(null);
      return;
    }

    try {
      const audioUrl = `data:${format};base64,${audioBase64}`;
      const audio = new Audio(audioUrl);
      activeAudioRef.current = audio;
      setPlayingAudioId(messageId);

      audio.onended = () => {
        setPlayingAudioId(null);
        activeAudioRef.current = null;
      };
      audio.onerror = () => {
        setPlayingAudioId(null);
        activeAudioRef.current = null;
      };
      audio.play().catch((e) => console.warn("Audio autoplay prevented:", e));
    } catch (e) {
      console.error("Audio playback error:", e);
      setPlayingAudioId(null);
    }
  };

  // Browser speech synthesis fallback for text-only messages
  const handleSpeakFallback = (messageId: string, text: string) => {
    if (!window.speechSynthesis) return;

    if (speakingId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = agent.voice?.speed || 1.0;
    utterance.pitch = (agent.voice?.pitch || 0) + 1.0;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    setSpeakingId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  const handleOpenPromptInspect = async () => {
    setInspectOpen(true);
    setLoadingPrompt(true);
    try {
      const preview = await fetchPromptPreview(agent.id);
      setMasterPrompt(preview.masterSystemPrompt);
    } catch (err) {
      console.error("Failed to load prompt preview:", err);
      setMasterPrompt("Error loading prompt preview.");
    } finally {
      setLoadingPrompt(false);
    }
  };

  const getStarterChips = () => {
    switch (agent.template) {
      case "appointment":
        return [
          "Book an appointment for checkup",
          "What are your working hours?",
          "Can I reschedule my visit?",
        ];
      case "sales":
        return [
          "Tell me about your pricing plans",
          "What features are included?",
          "Can I schedule a product demo?",
        ];
      case "support":
        return [
          "I need help with my account",
          "What is your refund policy?",
          "Connect me with human support",
        ];
      default:
        return [
          "Hello, what can you do?",
          "How do I use this service?",
          "Tell me about your company",
        ];
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="flex flex-col h-[740px] fintech-card overflow-hidden shadow-card relative">
      {/* ─── Playground Header ─── */}
      <div className="px-6 py-4 bg-white border-b border-black/[0.04] flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-2xl bg-[#0A0A0C] text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {agent.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#0A0A0C]">{agent.name}</h3>
              <span className="px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase rounded-full bg-blue-50 text-[#0066FF] border border-blue-100">
                {agent.template}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 flex items-center gap-1.5 mt-0.5">
              <span>Model:</span>
              <span className="text-neutral-700 font-mono">
                {agent.llmConfig?.model || "groq/compound"}
              </span>
              <span>&middot;</span>
              <span className="text-[#0066FF] font-mono flex items-center gap-1">
                <span>🎙️</span>
                <span>{agent.voice?.voiceId || "Heart"}</span>
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice Mode Toggle */}
          <div className="flex bg-[#F8F9FA] rounded-full border border-black/[0.06] p-0.5">
            <button
              type="button"
              onClick={() => {
                if (voiceMode === "realtime") realtime.disconnect();
                setVoiceMode("push-to-talk");
              }}
              className={`px-3 py-1 text-[11px] font-medium rounded-full transition-all ${
                voiceMode === "push-to-talk"
                  ? "bg-[#0A0A0C] text-white shadow-xs"
                  : "text-neutral-500 hover:text-black"
              }`}
            >
              Push-to-Talk
            </button>
            <button
              type="button"
              onClick={() => {
                setVoiceMode("realtime");
                if (conversation && realtime.connectionState === "disconnected") {
                  realtime.connect(agent.id, conversation.id);
                }
              }}
              className={`px-3 py-1 text-[11px] font-medium rounded-full transition-all flex items-center gap-1.5 ${
                voiceMode === "realtime"
                  ? "bg-[#0066FF] text-white shadow-pill-blue"
                  : "text-neutral-500 hover:text-black"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                realtime.connectionState === "connected" ? "bg-white animate-pulse" :
                realtime.connectionState === "connecting" || realtime.connectionState === "reconnecting" ? "bg-amber-300 animate-pulse" :
                "bg-neutral-400"
              }`} />
              Real-Time
            </button>
          </div>

          <button
            type="button"
            onClick={handleOpenPromptInspect}
            className="btn-pill-secondary text-xs flex items-center gap-1"
            title="Inspect Synthesized Master Prompt"
          >
            <span>👁️</span>
            <span>Prompt</span>
          </button>

          <button
            type="button"
            onClick={initSession}
            disabled={starting}
            className="btn-pill-secondary text-xs flex items-center gap-1 disabled:opacity-50"
            title="Reset Conversation Session"
          >
            <span>🔄</span>
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* ─── Chat Messages Stream ─── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F8F9FA]/40">
        {starting && (
          <div className="text-center py-8 text-neutral-400 text-xs">
            <span className="inline-block animate-pulse">Initializing session...</span>
          </div>
        )}

        {voiceError && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-xs text-[#F43F5E] flex items-center gap-2">
            <span>⚠️</span>
            <span>{voiceError}</span>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isSystem = msg.role === "system";
          const latencies = msg.latencyMetrics as any;

          if (isSystem) {
            return (
              <div key={msg.id} className="text-center py-2">
                <span className="text-[11px] bg-amber-50 text-amber-700 px-3 py-1 rounded-full border border-amber-200 font-mono">
                  {msg.content}
                </span>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
              <div className={`flex items-start gap-2.5 max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-bold shrink-0 shadow-xs ${
                    isUser
                      ? "bg-[#0A0A0C] text-white"
                      : "bg-blue-50 border border-blue-100 text-[#0066FF]"
                  }`}
                >
                  {isUser ? "YOU" : agent.name.slice(0, 2).toUpperCase()}
                </div>

                {/* Message Bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                    isUser
                      ? "bg-[#0066FF] text-white rounded-tr-sm shadow-pill-blue"
                      : "bg-white text-[#0A0A0C] border border-black/[0.06] rounded-tl-sm shadow-xs"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>

              {/* Message Footer Meta (Latency, Citations, Audio Playback) */}
              {!isUser && (
                <div className="flex flex-wrap items-center gap-2 mt-1.5 ml-9 text-[11px] text-neutral-400">
                  {/* Detailed Latency Breakdown */}
                  {latencies && latencies.totalMs ? (
                    <span className="text-[10px] font-mono text-[#0066FF] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
                      <span>⚡</span>
                      <span>{latencies.totalMs}ms</span>
                      <span className="text-neutral-300">|</span>
                      <span>STT {latencies.sttMs || 0}ms</span>
                      <span className="text-neutral-300">|</span>
                      <span>LLM {latencies.llmMs || 0}ms</span>
                      <span className="text-neutral-300">|</span>
                      <span>TTS {latencies.ttsMs || 0}ms</span>
                    </span>
                  ) : msg.latencyMs ? (
                    <span className="text-[10px] font-mono text-[#0066FF] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                      ⚡ {msg.latencyMs}ms
                    </span>
                  ) : null}

                  {/* Neural Audio Playback Pill */}
                  {msg.audioBase64 ? (
                    <button
                      type="button"
                      onClick={() => playSynthesizedAudio(msg.id, msg.audioBase64!)}
                      className="btn-pill-secondary text-[11px] py-0.5 px-2.5 flex items-center gap-1.5"
                      title="Play synthesized neural speech"
                    >
                      <span>{playingAudioId === msg.id ? "⏸️ Pause" : "🔊 Listen"}</span>
                      {playingAudioId === msg.id && (
                        <span className="flex items-center gap-0.5">
                          <span className="w-1 h-2 bg-[#0066FF] animate-pulse" />
                          <span className="w-1 h-3 bg-[#0066FF] animate-pulse [animation-delay:0.1s]" />
                          <span className="w-1 h-2 bg-[#0066FF] animate-pulse [animation-delay:0.2s]" />
                        </span>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSpeakFallback(msg.id, msg.content)}
                      className="text-neutral-400 hover:text-black transition-colors flex items-center gap-1 text-[11px]"
                      title="Speech preview"
                    >
                      <span>🔊</span>
                      <span>{speakingId === msg.id ? "Stop" : "Listen"}</span>
                    </button>
                  )}

                  {/* Citations Pill */}
                  {msg.retrievedChunks && msg.retrievedChunks.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCitations((prev) => ({
                          ...prev,
                          [msg.id]: !prev[msg.id],
                        }))
                      }
                      className="text-[11px] font-medium text-neutral-600 bg-white hover:bg-neutral-100 px-2.5 py-0.5 rounded-full border border-black/[0.06] transition-colors flex items-center gap-1.5"
                      title="Inspect retrieved knowledge citations"
                    >
                      <span>📚</span>
                      <span>
                        {msg.retrievedChunks.length} {msg.retrievedChunks.length === 1 ? "source" : "sources"}
                      </span>
                      <span className="text-[9px]">{expandedCitations[msg.id] ? "▲" : "▼"}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Expandable Citations Inspector Drawer */}
              {!isUser && expandedCitations[msg.id] && msg.retrievedChunks && (
                <div className="mt-2 ml-9 max-w-[80%] bg-white border border-black/[0.08] rounded-2xl p-3 space-y-2 text-xs shadow-card">
                  <div className="text-[11px] font-semibold text-[#0A0A0C] flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span>📖</span>
                      <span>Verified Knowledge Grounding</span>
                    </div>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      {msg.retrievedChunks.length} chunks
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {msg.retrievedChunks.map((chunk, i) => (
                      <div key={i} className="p-2.5 bg-[#F8F9FA] rounded-xl border border-black/[0.04] text-[11px] space-y-1">
                        <div className="flex items-center justify-between font-medium">
                          <span className="truncate text-[#0066FF]">
                            #{i + 1} {chunk.title}
                          </span>
                          <span className="text-[#0066FF] font-mono text-[10px] bg-blue-50 px-1.5 py-0.2 rounded-full border border-blue-100">
                            {(chunk.score * 100).toFixed(0)}% match
                          </span>
                        </div>
                        <p className="text-neutral-600 font-mono text-[10px] line-clamp-3 leading-relaxed bg-white p-1.5 rounded-lg border border-black/[0.04]">
                          {chunk.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {(loading || voiceProcessing) && (
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[10px] font-bold text-[#0066FF] shrink-0">
              {agent.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 border border-black/[0.06] flex items-center gap-2 text-neutral-500 text-xs shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#0066FF] animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-[#0066FF] animate-bounce [animation-delay:0.2s]" />
              <span className="w-2 h-2 rounded-full bg-[#0066FF] animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1 text-neutral-400 font-mono text-[11px]">
                {voiceProcessing ? "Transcribing & synthesizing voice..." : "Thinking..."}
              </span>
            </div>
          </div>
        )}

        {/* ─── Real-Time: Partial Transcript Display ─── */}
        {voiceMode === "realtime" && realtime.partialTranscript && (
          <div className="flex flex-col items-end">
            <div className="flex items-start gap-2.5 max-w-[85%] flex-row-reverse">
              <div className="w-7 h-7 rounded-xl bg-[#0A0A0C] flex items-center justify-center text-[10px] font-bold text-white shrink-0">YOU</div>
              <div className="rounded-2xl rounded-tr-sm bg-neutral-100 px-4 py-3 border border-dashed border-neutral-300">
                <p className="text-xs text-neutral-600 italic">{realtime.partialTranscript}</p>
                <span className="text-[10px] text-neutral-400 mt-1 block">listening...</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── Real-Time: Streaming Agent Response ─── */}
        {voiceMode === "realtime" && (realtime.sessionState === "processing" || realtime.sessionState === "speaking") && (
          <div className="flex flex-col items-start">
            <div className="flex items-start gap-2.5 max-w-[85%]">
              <div className="w-7 h-7 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[10px] font-bold text-[#0066FF] shrink-0">
                {agent.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 border border-black/[0.06] shadow-xs">
                {realtime.streamingResponse ? (
                  <p className="text-xs text-[#0A0A0C] leading-relaxed">
                    {realtime.streamingResponse}
                    <span className="inline-block w-1.5 h-3.5 bg-[#0066FF] animate-pulse ml-0.5 align-text-bottom rounded-xs" />
                  </p>
                ) : (
                  <div className="flex items-center gap-2 text-neutral-500 text-xs">
                    <span className="w-2 h-2 rounded-full bg-[#0066FF] animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-[#0066FF] animate-bounce [animation-delay:0.2s]" />
                    <span className="w-2 h-2 rounded-full bg-[#0066FF] animate-bounce [animation-delay:0.4s]" />
                    <span className="ml-1 text-neutral-400 font-mono text-[11px]">Thinking...</span>
                  </div>
                )}
                {realtime.sessionState === "speaking" && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-0.5 bg-emerald-500 rounded-full animate-pulse" style={{
                          height: `${8 + Math.random() * 12}px`,
                          animationDelay: `${i * 0.1}s`,
                          animationDuration: `${0.4 + Math.random() * 0.3}s`,
                        }} />
                      ))}
                    </div>
                    <span className="text-[10px] text-emerald-600 font-mono">Speaking...</span>
                    <button
                      type="button"
                      onClick={() => realtime.interrupt()}
                      className="ml-1 px-2 py-0.5 text-[10px] font-medium text-[#F43F5E] bg-red-50 hover:bg-red-100 border border-red-100 rounded-full transition-colors"
                    >
                      Interrupt
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Real-Time: Latency Badge ─── */}
        {voiceMode === "realtime" && realtime.lastLatencies && realtime.sessionState === "idle" && (
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-black/[0.06] text-[10px] font-mono text-neutral-500 shadow-xs">
              <span>⚡ Total: {realtime.lastLatencies.totalMs}ms</span>
              <span>&middot;</span>
              <span>STT: {realtime.lastLatencies.sttMs}ms</span>
              <span>&middot;</span>
              <span>LLM: {realtime.lastLatencies.llmMs}ms</span>
              <span>&middot;</span>
              <span>TTS: {realtime.lastLatencies.ttsMs}ms</span>
              {realtime.lastLatencies.timeToFirstAudioMs && (
                <>
                  <span>&middot;</span>
                  <span className="text-emerald-600">1st Audio: {realtime.lastLatencies.timeToFirstAudioMs}ms</span>
                </>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Starter Chips ─── */}
      {messages.length <= 1 && (
        <div className="px-6 pb-3 flex flex-wrap gap-2 bg-[#F8F9FA]/40">
          {getStarterChips().map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(chip)}
              className="btn-pill-secondary text-xs"
            >
              <span>✨</span>
              <span>{chip}</span>
            </button>
          ))}
        </div>
      )}

      {/* ─── Voice Recording Banner ─── */}
      {isRecording && (
        <div className="px-6 py-2.5 bg-red-50 border-t border-red-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#F43F5E] text-xs font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F43F5E] animate-ping" />
            <span>Recording voice... ({formatTime(recordingDuration)})</span>
            <span className="text-neutral-400 text-[11px]">Speak clearly into microphone</span>
          </div>
          <button
            type="button"
            onClick={stopVoiceRecording}
            className="px-3 py-1 bg-[#F43F5E] hover:bg-rose-600 text-white rounded-full text-xs font-semibold shadow transition-colors flex items-center gap-1"
          >
            <span>■</span>
            <span>Stop &amp; Send</span>
          </button>
        </div>
      )}

      {/* ─── Message & Voice Input Bar ─── */}
      <div className="p-4 bg-white border-t border-black/[0.04]">
        {/* Real-Time Mode Controls */}
        {voiceMode === "realtime" ? (
          <div className="flex items-center gap-3">
            {/* Connection Status */}
            <div className={`px-3 py-1.5 rounded-full text-[10px] font-mono border ${
              realtime.connectionState === "connected"
                ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                : realtime.connectionState === "connecting" || realtime.connectionState === "reconnecting"
                ? "bg-amber-50 border-amber-100 text-amber-700 animate-pulse"
                : "bg-neutral-50 border-neutral-200 text-neutral-400"
            }`}>
              {realtime.connectionState === "connected"
                ? `✓ Session ${realtime.sessionId?.slice(0, 10) || "ready"}`
                : realtime.connectionState === "connecting"
                ? "Connecting..."
                : realtime.connectionState === "reconnecting"
                ? "Reconnecting..."
                : "Disconnected"}
            </div>

            {/* Microphone Toggle Button */}
            <button
              type="button"
              onClick={() => {
                if (realtime.isRecording) {
                  realtime.stopListening();
                } else {
                  realtime.startListening();
                }
              }}
              disabled={realtime.connectionState !== "connected"}
              className={`flex-1 py-2.5 rounded-full text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-2 ${
                realtime.isRecording
                  ? "bg-[#F43F5E] text-white animate-pulse"
                  : "btn-pill-blue text-xs shadow-pill-blue"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {realtime.isRecording ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>Listening... Tap to stop</span>
                </>
              ) : (
                <>
                  <span>🎙️</span>
                  <span>Start Listening</span>
                </>
              )}
            </button>

            {/* Interrupt Button */}
            {(realtime.sessionState === "processing" || realtime.sessionState === "speaking") && (
              <button
                type="button"
                onClick={() => realtime.interrupt()}
                className="px-4 py-2.5 rounded-full bg-red-50 hover:bg-red-100 text-[#F43F5E] text-xs font-medium border border-red-100 transition-colors"
              >
                Stop
              </button>
            )}

            {/* Disconnect Button */}
            {realtime.connectionState !== "disconnected" && (
              <button
                type="button"
                onClick={() => realtime.disconnect()}
                className="w-9 h-9 rounded-full bg-[#F8F9FA] hover:bg-neutral-100 text-neutral-500 hover:text-black border border-black/[0.06] flex items-center justify-center transition-colors"
                title="Disconnect real-time session"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          /* Push-to-Talk & Text Mode */
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? "Recording voice..." : `Message ${agent.name} or tap microphone...`}
              disabled={loading || starting || isRecording || voiceProcessing}
              className="flex-1 bg-[#F8F9FA] border border-black/[0.08] rounded-full px-4 py-2.5 text-xs text-[#0A0A0C] placeholder-neutral-400 focus:outline-none focus:border-[#0066FF] transition-all disabled:opacity-60"
            />

            {/* Microphone Push-to-Talk Button */}
            <button
              type="button"
              onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
              disabled={loading || starting || voiceProcessing}
              className={`w-9 h-9 rounded-full text-white text-xs font-medium shadow-xs transition-all flex items-center justify-center ${
                isRecording
                  ? "bg-[#F43F5E] ring-2 ring-red-200 animate-pulse"
                  : "bg-[#0A0A0C] hover:bg-neutral-800 text-white"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={isRecording ? "Stop recording voice" : "Click to speak with agent"}
            >
              {isRecording ? "■" : "🎙️"}
            </button>

            {/* Send Text Button */}
            <button
              type="submit"
              disabled={!input.trim() || loading || starting || isRecording || voiceProcessing}
              className="btn-pill-blue text-xs shadow-pill-blue disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <span>Send</span>
              <span>&rarr;</span>
            </button>
          </form>
        )}

        {/* Real-Time Error Display */}
        {voiceMode === "realtime" && realtime.error && (
          <div className="mt-2 px-3 py-1.5 bg-red-50 border border-red-100 rounded-xl text-[11px] text-[#F43F5E] font-mono">
            {realtime.error}
          </div>
        )}
      </div>

      {/* ─── Inspect Master Prompt Drawer ─── */}
      {inspectOpen && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-xs z-30 flex justify-end animate-fadeIn">
          <div className="w-full max-w-lg bg-white border-l border-black/[0.08] h-full p-6 flex flex-col shadow-card">
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.04]">
              <div>
                <h4 className="text-sm font-bold text-[#0A0A0C]">Synthesized Master Prompt</h4>
                <p className="text-xs text-neutral-400">Engine-injected system instructions &amp; context</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F8F9FA] hover:bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-black text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-4 pr-1">
              {loadingPrompt ? (
                <div className="text-center py-12 text-neutral-400 text-xs">
                  Loading prompt synthesis...
                </div>
              ) : (
                <div className="bg-[#F8F9FA] border border-black/[0.06] rounded-2xl p-4 font-mono text-xs text-neutral-800 whitespace-pre-wrap leading-relaxed">
                  {masterPrompt}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-black/[0.04] flex justify-between items-center">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(masterPrompt)}
                className="btn-pill-secondary text-xs"
              >
                Copy Prompt
              </button>
              <button
                type="button"
                onClick={() => setInspectOpen(false)}
                className="btn-pill-blue text-xs shadow-pill-blue"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
