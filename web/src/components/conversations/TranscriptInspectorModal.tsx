import { useState, useRef, useEffect } from "react";
import {
  fetchConversation,
  synthesizeSpeech,
  evaluateConversation,
  toggleConversationEscalation,
} from "../../lib/api";
import type { Conversation, Message } from "@voiceflow/shared";

interface TranscriptInspectorModalProps {
  conversationId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function TranscriptInspectorModal({
  conversationId,
  onClose,
  onUpdated,
}: TranscriptInspectorModalProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [expandedTurnChunks, setExpandedTurnChunks] = useState<Record<string, boolean>>({});
  const [expandedTurnTools, setExpandedTurnTools] = useState<Record<string, boolean>>({});

  // Audio Playback state
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadConversationDetails();
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
    };
  }, [conversationId]);

  async function loadConversationDetails() {
    setLoading(true);
    try {
      const data = await fetchConversation(conversationId);
      setConversation(data.conversation);
      setMessages(data.messages);
      if ((data as any).evaluation) {
        setEvaluation((data as any).evaluation);
      }
    } catch (err) {
      console.error("Failed to load conversation details:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePlayAudio(msg: Message) {
    if (playingMessageId === msg.id && activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
      setPlayingMessageId(null);
      return;
    }

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }

    let base64 = msg.audioBase64 || audioCacheRef.current.get(msg.id);

    if (!base64) {
      setLoadingAudioId(msg.id);
      try {
        const synthesized = await synthesizeSpeech(msg.content);
        base64 = synthesized.audioBase64;
        audioCacheRef.current.set(msg.id, base64);
      } catch (err) {
        console.error("Audio synthesis failed:", err);
        setLoadingAudioId(null);
        return;
      } finally {
        setLoadingAudioId(null);
      }
    }

    const audioUrl = `data:audio/mp3;base64,${base64}`;
    const audio = new Audio(audioUrl);
    activeAudioRef.current = audio;
    setPlayingMessageId(msg.id);

    audio.onended = () => {
      setPlayingMessageId(null);
      activeAudioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingMessageId(null);
      activeAudioRef.current = null;
    };

    audio.play().catch((err) => {
      console.error("Playback error:", err);
      setPlayingMessageId(null);
    });
  }

  async function handleRunEvaluation() {
    setEvaluating(true);
    try {
      const res = await evaluateConversation(conversationId);
      setConversation(res.conversation);
      setEvaluation(res.evaluation);
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error("Evaluation error:", err);
    } finally {
      setEvaluating(false);
    }
  }

  async function handleToggleEscalation() {
    if (!conversation) return;
    setEscalating(true);
    try {
      const willEscalate = !conversation.escalated;
      const updated = await toggleConversationEscalation(
        conversationId,
        willEscalate,
        willEscalate ? "Escalated manually by reviewer" : undefined
      );
      setConversation(updated);
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error("Escalation toggle error:", err);
    } finally {
      setEscalating(false);
    }
  }

  const sentiment = conversation?.sentiment || "neutral";
  const sentimentScore = conversation?.sentimentScore ?? 0;
  const isEscalated = conversation?.escalated;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/35 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-4xl h-[88vh] rounded-3xl bg-white border border-black/[0.08] shadow-2xl overflow-hidden text-[#0A0A0C]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.05] bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center font-bold text-sm">
              🎙️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[#0A0A0C] tracking-tight">
                  Conversation Inspector
                </h3>
                <span className="font-mono text-[10px] text-neutral-400 px-2 py-0.5 rounded-full bg-neutral-100">
                  {conversationId.slice(-8)}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-neutral-100 text-neutral-600 capitalize">
                  {conversation?.channel || "widget"}
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Agent: <span className="text-neutral-700 font-medium">{conversation?.agentName || "Voice Agent"}</span> &middot; {messages.length} message turns
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunEvaluation}
              disabled={evaluating}
              className="btn-pill-secondary text-xs"
            >
              {evaluating ? "Evaluating..." : "Analyze Quality"}
            </button>

            <button
              type="button"
              onClick={handleToggleEscalation}
              disabled={escalating}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isEscalated
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-[#F43F5E] border border-rose-200"
              }`}
            >
              {isEscalated ? "Resolve Escalation" : "Escalate to Human"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-black rounded-full hover:bg-neutral-100 transition-colors ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Quality & Sentiment Indicator Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 bg-[#F8F9FA] border-b border-black/[0.04] text-xs">
          <div className="flex items-center gap-3">
            <span className="text-neutral-400">Sentiment:</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                sentiment === "positive"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : sentiment === "negative"
                  ? "bg-rose-50 text-[#F43F5E] border border-rose-200"
                  : "bg-neutral-100 text-neutral-600"
              }`}
            >
              {sentiment} ({sentimentScore > 0 ? `+${sentimentScore}` : sentimentScore})
            </span>

            {evaluation?.sentiment && (
              <span className="text-[11px] text-neutral-400 font-normal">
                Eval: {evaluation.sentiment}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-neutral-400 font-mono text-[11px]">
            {conversation?.avgLatencyMs ? (
              <span>Avg Latency: <strong className="text-[#0066FF]">{conversation.avgLatencyMs}ms</strong></span>
            ) : null}
            {conversation?.durationMs ? (
              <span>Duration: <strong className="text-neutral-700">{(conversation.durationMs / 1000).toFixed(1)}s</strong></span>
            ) : null}
          </div>
        </div>

        {/* Transcript Dialogue Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
          {loading ? (
            <div className="py-20 text-center text-xs text-neutral-400">
              Loading dialogue turns...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20 text-neutral-400 text-xs">
              No message turns recorded in this session.
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === "user";
              const isAssistant = msg.role === "assistant";
              const hasChunks = msg.retrievedChunks && msg.retrievedChunks.length > 0;
              const hasTools = msg.toolCalls && msg.toolCalls.length > 0;
              const isAudioPlaying = playingMessageId === msg.id;
              const isAudioLoading = loadingAudioId === msg.id;
              const showChunks = expandedTurnChunks[msg.id];
              const showTools = expandedTurnTools[msg.id];

              return (
                <div
                  key={msg.id || index}
                  className={`flex gap-3 max-w-2xl ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                      isUser
                        ? "bg-[#0A0A0C] text-white"
                        : "bg-blue-50 text-[#0066FF] border border-blue-100"
                    }`}
                  >
                    {isUser ? "U" : "AI"}
                  </div>

                  <div
                    className={`flex flex-col rounded-2xl p-4 text-xs ${
                      isUser
                        ? "bg-[#F1F3F5] text-[#0A0A0C]"
                        : "bg-white border border-black/[0.06] text-[#0A0A0C] shadow-xs"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 mb-1 text-[10px] text-neutral-400 font-mono">
                      <span>{isUser ? "Customer Turn" : "Voice Agent"}</span>
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <p className="leading-relaxed whitespace-pre-wrap text-xs text-[#0A0A0C]">
                      {msg.content}
                    </p>

                    {/* Assistant Actions Bar */}
                    {isAssistant && (
                      <div className="mt-3 pt-2.5 border-t border-black/[0.05] flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handlePlayAudio(msg)}
                          disabled={isAudioLoading}
                          className={`btn-pill-secondary text-[11px] py-1 px-3 ${
                            isAudioPlaying ? "bg-[#0066FF] text-white shadow-pill-blue" : ""
                          }`}
                        >
                          {isAudioLoading ? "Synthesizing..." : isAudioPlaying ? "Playing..." : "▶ Play Voice"}
                        </button>

                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400">
                          {msg.latencyMetrics?.sttMs && <span>STT {msg.latencyMetrics.sttMs}ms</span>}
                          {msg.latencyMetrics?.llmMs && <span>LLM {msg.latencyMetrics.llmMs}ms</span>}
                          {msg.latencyMetrics?.ttsMs && <span>TTS {msg.latencyMetrics.ttsMs}ms</span>}
                          {msg.latencyMs && <span className="text-[#0066FF] font-semibold">Total {msg.latencyMs}ms</span>}
                        </div>
                      </div>
                    )}

                    {/* Metadata chips */}
                    {(hasChunks || hasTools) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-black/[0.04]">
                        {hasChunks && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTurnChunks((prev) => ({
                                ...prev,
                                [msg.id]: !prev[msg.id],
                              }))
                            }
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-[#0066FF]"
                          >
                            📚 {msg.retrievedChunks!.length} RAG Chunks {showChunks ? "▲" : "▼"}
                          </button>
                        )}
                        {hasTools && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTurnTools((prev) => ({
                                ...prev,
                                [msg.id]: !prev[msg.id],
                              }))
                            }
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700"
                          >
                            ⚡ {msg.toolCalls!.length} Tool Calls {showTools ? "▲" : "▼"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* RAG Drawer */}
                    {hasChunks && showChunks && (
                      <div className="mt-2 p-2.5 rounded-xl bg-[#F8F9FA] border border-black/[0.04] space-y-1.5 text-[11px]">
                        <span className="font-semibold text-neutral-600 block">Retrieved Documents:</span>
                        {msg.retrievedChunks!.map((chunk, cIdx) => (
                          <div key={cIdx} className="p-2 rounded-lg bg-white border border-black/[0.04]">
                            <span className="font-medium text-[#0A0A0C]">{chunk.title}</span>
                            <p className="text-neutral-500 mt-0.5 line-clamp-2">{chunk.text}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tools Drawer */}
                    {hasTools && showTools && (
                      <div className="mt-2 p-2.5 rounded-xl bg-[#F8F9FA] border border-black/[0.04] space-y-1.5 text-[11px] font-mono">
                        <span className="font-semibold text-neutral-600 font-sans block">Executed Tool Actions:</span>
                        {msg.toolCalls!.map((tc, tIdx) => (
                          <div key={tIdx} className="p-2 rounded-lg bg-white border border-black/[0.04] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[#0066FF] font-semibold">{tc.toolName}</span>
                              <span className="text-emerald-600">{tc.status}</span>
                            </div>
                            <div className="text-neutral-500 text-[10px]">Input: {JSON.stringify(tc.input)}</div>
                            {tc.output && <div className="text-neutral-700 text-[10px]">Output: {JSON.stringify(tc.output)}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-black/[0.05] bg-[#F8F9FA] flex items-center justify-between text-xs text-neutral-400">
          <span>{messages.length} message turns recorded</span>
          <button
            type="button"
            onClick={onClose}
            className="btn-pill-secondary text-xs py-1 px-4"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
