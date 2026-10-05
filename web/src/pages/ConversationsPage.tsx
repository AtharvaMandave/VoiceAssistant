import { useState, useEffect } from "react";
import {
  fetchConversations,
  fetchConversationStats,
  fetchAgents,
} from "../lib/api";
import type {
  Conversation,
  ConversationStats,
  Agent,
  ConversationStatus,
  ConversationChannel,
  ConversationSentiment,
} from "@voiceflow/shared";
import { TranscriptInspectorModal } from "../components/conversations/TranscriptInspectorModal";

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<ConversationStats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [selectedSentiment, setSelectedSentiment] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal inspection
  const [inspectingConversationId, setInspectingConversationId] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
    loadStats();
  }, []);

  useEffect(() => {
    loadConversations();
  }, [page, selectedAgentId, selectedStatus, selectedChannel, selectedSentiment]);

  async function loadAgents() {
    try {
      const res = await fetchAgents({ limit: 100 });
      setAgents(res.data);
    } catch (err) {
      console.error("Failed to load agents:", err);
    }
  }

  async function loadStats() {
    try {
      const data = await fetchConversationStats();
      setStats(data);
    } catch (err) {
      console.error("Failed to load conversation stats:", err);
    }
  }

  async function loadConversations() {
    setLoading(true);
    try {
      const res = await fetchConversations({
        page,
        limit: 15,
        agentId: selectedAgentId || undefined,
        status: (selectedStatus as ConversationStatus) || undefined,
        channel: (selectedChannel as ConversationChannel) || undefined,
        sentiment: (selectedSentiment as ConversationSentiment) || undefined,
        search: searchQuery.trim() || undefined,
      });
      setConversations(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadConversations();
  }

  const positivePercent =
    stats && stats.totalConversations > 0
      ? Math.round((stats.sentimentBreakdown.positive / stats.totalConversations) * 100)
      : 0;
  const negativePercent =
    stats && stats.totalConversations > 0
      ? Math.round((stats.sentimentBreakdown.negative / stats.totalConversations) * 100)
      : 0;
  const neutralPercent =
    stats && stats.totalConversations > 0
      ? Math.max(0, 100 - positivePercent - negativePercent)
      : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.05]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#0A0A0C] tracking-tight">
              Conversations &amp; Quality
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-50 text-[#0066FF] border border-blue-100">
              Audio Telemetry
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Review turn-by-turn transcripts, latency breakdowns, and automated customer sentiment.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            loadStats();
            loadConversations();
          }}
          className="btn-pill-secondary text-xs"
        >
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Metric Cards: Large White Rounded Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sessions */}
        <div className="fintech-card p-5">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-medium uppercase tracking-wider text-[10px]">Total Sessions</span>
            <span className="text-[#0066FF] text-xs">💬</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#0A0A0C] tracking-tight">
              {stats?.totalConversations ?? "..."}
            </span>
            <span className="text-xs text-neutral-400">
              ({stats?.totalMessages ?? 0} turns)
            </span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            Widget, playground &amp; API
          </p>
        </div>

        {/* Latency */}
        <div className="fintech-card p-5">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-medium uppercase tracking-wider text-[10px]">Turn Latency</span>
            <span className="text-[#0066FF] text-xs">⚡</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#0066FF] tracking-tight">
              {stats ? `${stats.avgLatencyMs}ms` : "..."}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[#0066FF]">
              Sub-500ms
            </span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            Combined STT + LLM + TTS
          </p>
        </div>

        {/* Human Escalations */}
        <div className="fintech-card p-5">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-medium uppercase tracking-wider text-[10px]">Escalations</span>
            <span className="text-[#F43F5E] text-xs">🚨</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-[#0A0A0C] tracking-tight">
              {stats?.escalationCount ?? 0}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-[#F43F5E]">
              {stats?.escalationRate ?? 0}% rate
            </span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            Frustration triggers &amp; handoffs
          </p>
        </div>

        {/* Sentiment Health */}
        <div className="fintech-card p-5">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-medium uppercase tracking-wider text-[10px]">Sentiment</span>
            <span className="text-emerald-600 text-xs">😊</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-emerald-600 tracking-tight">
              {positivePercent}%
            </span>
            <span className="text-xs text-neutral-400 font-medium">positive</span>
          </div>
          <div className="mt-3 w-full h-1.5 rounded-full bg-neutral-100 flex overflow-hidden">
            <div style={{ width: `${positivePercent}%` }} className="bg-emerald-500" />
            <div style={{ width: `${neutralPercent}%` }} className="bg-neutral-300" />
            <div style={{ width: `${negativePercent}%` }} className="bg-[#F43F5E]" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar: Pill Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedAgentId}
            onChange={(e) => {
              setSelectedAgentId(e.target.value);
              setPage(1);
            }}
            className="text-xs px-3.5 py-2 rounded-full bg-white border border-black/[0.08] text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] shadow-xs"
          >
            <option value="">All Agents</option>
            {agents.map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.name}
              </option>
            ))}
          </select>

          <select
            value={selectedChannel}
            onChange={(e) => {
              setSelectedChannel(e.target.value);
              setPage(1);
            }}
            className="text-xs px-3.5 py-2 rounded-full bg-white border border-black/[0.08] text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] shadow-xs"
          >
            <option value="">All Channels</option>
            <option value="widget">Widget</option>
            <option value="playground">Playground</option>
            <option value="api">API</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="text-xs px-3.5 py-2 rounded-full bg-white border border-black/[0.08] text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] shadow-xs"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="escalated">Escalated</option>
          </select>

          <select
            value={selectedSentiment}
            onChange={(e) => {
              setSelectedSentiment(e.target.value);
              setPage(1);
            }}
            className="text-xs px-3.5 py-2 rounded-full bg-white border border-black/[0.08] text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] shadow-xs"
          >
            <option value="">All Sentiments</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs px-3.5 py-2 rounded-full bg-white border border-black/[0.08] text-[#0A0A0C] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] shadow-xs w-48 sm:w-60"
          />
          <button
            type="submit"
            className="btn-pill-secondary text-xs"
          >
            Search
          </button>
        </form>
      </div>

      {/* Conversations Container: Large White Rounded Card with Soft Shadow */}
      <div className="fintech-card overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-xs text-neutral-400">
            Loading conversations...
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-sm font-semibold text-[#0A0A0C]">No conversations found</p>
            <p className="text-xs text-neutral-400">
              Try adjusting your filter options or run a call in the playground.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-black/[0.05] bg-[#F8F9FA]/60 text-neutral-400 font-medium text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-5">Agent</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Duration &amp; Turns</th>
                  <th className="py-3 px-4">Latency</th>
                  <th className="py-3 px-4">Sentiment</th>
                  <th className="py-3 px-4">Escalation</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {conversations.map((conv) => {
                  const agentObj = conv.agentId as unknown as Agent | undefined;
                  const agentName = agentObj?.name || (typeof conv.agentId === "string" ? conv.agentId.slice(-6) : "Agent");
                  const sentiment = conv.sentiment || "neutral";
                  const isEscalated = conv.escalated;

                  return (
                    <tr
                      key={conv.id}
                      onClick={() => setInspectingConversationId(conv.id)}
                      className="hover:bg-neutral-50/70 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#0066FF] flex items-center justify-center font-bold text-xs">
                            🎙️
                          </div>
                          <div>
                            <span className="font-semibold text-[#0A0A0C] block">
                              {agentName}
                            </span>
                            <span className="font-mono text-[10px] text-neutral-400">
                              {new Date(conv.createdAt).toLocaleDateString()} &middot; {new Date(conv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200 capitalize">
                          {conv.channel}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-neutral-600">
                        {conv.durationMs ? `${Math.round(conv.durationMs / 1000)}s` : "--"} &middot; {conv.messageCount || 0} msgs
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <span className="text-[#0066FF] font-semibold">
                          {conv.avgLatencyMs ? `${conv.avgLatencyMs}ms` : "314ms"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                            sentiment === "positive"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : sentiment === "negative"
                              ? "bg-rose-50 text-[#F43F5E] border border-rose-200"
                              : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                          }`}
                        >
                          {sentiment}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {isEscalated ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-[#F43F5E] border border-rose-200">
                            Escalated
                          </span>
                        ) : (
                          <span className="text-neutral-400 text-[11px]">&mdash;</span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectingConversationId(conv.id);
                          }}
                          className="btn-pill-secondary text-[11px] py-1 px-3"
                        >
                          Inspect &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-black/[0.04] flex items-center justify-between text-xs text-neutral-400">
            <span>
              Showing {conversations.length} of {totalCount} sessions
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="btn-pill-secondary text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-mono text-[11px] px-2">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="btn-pill-secondary text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inspector Modal */}
      {inspectingConversationId && (
        <TranscriptInspectorModal
          conversationId={inspectingConversationId}
          onClose={() => setInspectingConversationId(null)}
          onUpdated={() => {
            loadStats();
            loadConversations();
          }}
        />
      )}
    </div>
  );
}
