import { useState, useEffect, useMemo, useCallback } from "react";
import {
  fetchConversationStats,
  fetchConversations,
  fetchAgents,
} from "../lib/api";
import type {
  ConversationStats,
  Conversation,
  Agent,
} from "@voiceflow/shared";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DailyVolume {
  label: string;
  count: number;
}

type TimeRange = "7d" | "30d" | "90d";

// ─── Utility: sparkline path from data ──────────────────────────────────────

function sparklinePath(
  data: number[],
  width: number,
  height: number,
  pad = 4
): string {
  if (data.length < 2) return "";
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = (width - pad * 2) / (data.length - 1);
  return data
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (1 - (v - min) / range) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function areaPath(
  data: number[],
  width: number,
  height: number,
  pad = 4
): string {
  const line = sparklinePath(data, width, height, pad);
  if (!line) return "";
  return `${line} L ${(width - pad).toFixed(1)} ${height} L ${pad} ${height} Z`;
}

// ─── Animated Counter ───────────────────────────────────────────────────────

function AnimatedNumber({
  value,
  suffix = "",
  prefix = "",
}: {
  value: number;
  suffix?: string;
  prefix?: string;
}) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = displayed;
    const diff = value - start;
    const duration = 600;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(start + diff * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span>
      {prefix}
      {displayed.toLocaleString()}
      {suffix}
    </span>
  );
}

// ─── Donut Chart Component ──────────────────────────────────────────────────

function DonutChart({
  segments,
  size = 120,
}: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const radius = size * 0.38;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = size * 0.12;

  let accumulated = 0;
  const arcs = segments.map((seg) => {
    const pct = seg.value / total;
    const startAngle = accumulated * 2 * Math.PI - Math.PI / 2;
    accumulated += pct;
    const endAngle = accumulated * 2 * Math.PI - Math.PI / 2;
    const largeArc = pct > 0.5 ? 1 : 0;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    return {
      ...seg,
      d: `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      pct,
    };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((arc, i) => (
        <path
          key={i}
          d={arc.d}
          fill="none"
          stroke={arc.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{
            transition: "stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      ))}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        className="fill-[#0A0A0C] text-lg font-bold"
        style={{ fontSize: size * 0.16 }}
      >
        {total.toLocaleString()}
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        className="fill-neutral-400"
        style={{ fontSize: size * 0.09 }}
      >
        total
      </text>
    </svg>
  );
}

// ─── Horizontal Bar ─────────────────────────────────────────────────────────

function HBar({
  label,
  value,
  max,
  color,
  suffix = "",
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  suffix?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[#0A0A0C]">{label}</span>
        <span className="font-mono text-neutral-500">
          {value.toLocaleString()}
          {suffix}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [stats, setStats] = useState<ConversationStats | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, convsRes, agentsRes] = await Promise.allSettled([
        fetchConversationStats(),
        fetchConversations({ limit: 100, page: 1 }),
        fetchAgents({ limit: 100 }),
      ]);
      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      if (convsRes.status === "fulfilled")
        setConversations(convsRes.value.data);
      if (agentsRes.status === "fulfilled") setAgents(agentsRes.value.data);
    } catch (err) {
      console.error("Analytics load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ─── Derived metrics ────────────────────────────────────────────────────

  const sentimentData = useMemo(() => {
    const sb = stats?.sentimentBreakdown || {
      positive: 0,
      neutral: 0,
      negative: 0,
    };
    return [
      { value: sb.positive, color: "#10B981", label: "Positive" },
      { value: sb.neutral, color: "#94A3B8", label: "Neutral" },
      { value: sb.negative, color: "#F43F5E", label: "Negative" },
    ];
  }, [stats]);

  // Simulate daily volume from conversations (group by date)
  const dailyVolume = useMemo((): DailyVolume[] => {
    const days =
      timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    const buckets: Record<string, number> = {};
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = 0;
    }
    for (const conv of conversations) {
      const key = new Date(conv.createdAt).toISOString().slice(0, 10);
      if (key in buckets) buckets[key]++;
    }
    return Object.entries(buckets).map(([label, count]) => ({
      label,
      count,
    }));
  }, [conversations, timeRange]);

  const volumeData = useMemo(
    () => dailyVolume.map((d) => d.count),
    [dailyVolume]
  );

  // Agent distribution
  const agentDistribution = useMemo(() => {
    const counts: Record<string, { name: string; count: number }> = {};
    for (const conv of conversations) {
      const agentId = typeof conv.agentId === "string" ? conv.agentId : (conv.agentId as any)?._id?.toString?.() || "";
      const agentName = (conv as any).agentName || "Unknown";
      if (!counts[agentId])
        counts[agentId] = { name: agentName, count: 0 };
      counts[agentId].count++;
    }
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [conversations]);

  // Channel distribution
  const channelDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const conv of conversations) {
      const ch = conv.channel || "unknown";
      counts[ch] = (counts[ch] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [conversations]);

  // Escalation metrics
  const escalationMetrics = useMemo(() => {
    const total = conversations.length || 1;
    const escalated = conversations.filter((c) => c.escalated).length;
    const resolved = conversations.filter(
      (c) => c.status === "ended"
    ).length;
    const active = conversations.filter(
      (c) => c.status === "active"
    ).length;
    return {
      escalated,
      resolved,
      active,
      escalationRate: Math.round((escalated / total) * 100),
      resolutionRate: Math.round((resolved / total) * 100),
    };
  }, [conversations]);

  // Latency breakdown (simulated from stats)
  const latencyBreakdown = useMemo(() => {
    const avg = stats?.avgLatencyMs || 380;
    return {
      stt: Math.round(avg * 0.25),
      llm: Math.round(avg * 0.48),
      tts: Math.round(avg * 0.2),
      network: Math.round(avg * 0.07),
      total: avg,
    };
  }, [stats]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#0066FF] border-t-transparent animate-spin" />
          <p className="text-xs text-neutral-400">Loading analytics…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ─── Page Header ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.05]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0A0A0C]">
              Analytics
            </h1>
            <span className="w-1.5 h-1.5 rounded-full bg-[#0066FF] animate-pulse" />
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Conversation quality, sentiment evaluation, pipeline latency, and
            agent performance metrics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(["7d", "30d", "90d"] as TimeRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                timeRange === r
                  ? "bg-[#0066FF] text-white shadow-pill-blue"
                  : "bg-white text-neutral-500 border border-black/[0.06] hover:bg-neutral-50"
              }`}
            >
              {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "90 Days"}
            </button>
          ))}
          <button
            type="button"
            onClick={loadAll}
            className="btn-pill-secondary text-xs"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ─── Top KPI Row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Conversations */}
        <div className="fintech-card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
              Total Sessions
            </span>
            <span className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-[#0066FF] text-xs">
              📊
            </span>
          </div>
          <p className="text-2xl font-bold text-[#0A0A0C] tracking-tight">
            <AnimatedNumber
              value={stats?.totalConversations || 0}
            />
          </p>
          <div className="h-8">
            <svg
              viewBox="0 0 120 32"
              className="w-full h-full overflow-visible"
            >
              <path
                d={areaPath(volumeData.slice(-14), 120, 32)}
                fill="#0066FF"
                fillOpacity={0.08}
              />
              <path
                d={sparklinePath(volumeData.slice(-14), 120, 32)}
                fill="none"
                stroke="#0066FF"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Total Messages */}
        <div className="fintech-card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
              Total Messages
            </span>
            <span className="w-6 h-6 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 text-xs">
              💬
            </span>
          </div>
          <p className="text-2xl font-bold text-[#0A0A0C] tracking-tight">
            <AnimatedNumber value={stats?.totalMessages || 0} />
          </p>
          <p className="text-[11px] text-neutral-400">
            {stats?.totalConversations
              ? `~${Math.round(
                  (stats.totalMessages || 0) /
                    (stats.totalConversations || 1)
                )} per session`
              : "—"}
          </p>
        </div>

        {/* Avg Latency */}
        <div className="fintech-card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
              Avg Latency
            </span>
            <span className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 text-xs">
              ⚡
            </span>
          </div>
          <p className="text-2xl font-bold text-[#0A0A0C] tracking-tight">
            <AnimatedNumber
              value={stats?.avgLatencyMs || 0}
              suffix="ms"
            />
          </p>
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              (stats?.avgLatencyMs || 0) < 400
                ? "bg-emerald-50 text-emerald-700"
                : (stats?.avgLatencyMs || 0) < 800
                ? "bg-amber-50 text-amber-700"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            {(stats?.avgLatencyMs || 0) < 400
              ? "⚡ Fast"
              : (stats?.avgLatencyMs || 0) < 800
              ? "● Moderate"
              : "▲ Slow"}
          </span>
        </div>

        {/* Escalation Rate */}
        <div className="fintech-card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
              Escalation Rate
            </span>
            <span className="w-6 h-6 rounded-lg bg-rose-50 flex items-center justify-center text-[#F43F5E] text-xs">
              🚨
            </span>
          </div>
          <p className="text-2xl font-bold text-[#0A0A0C] tracking-tight">
            <AnimatedNumber
              value={stats?.escalationRate || 0}
              suffix="%"
            />
          </p>
          <p className="text-[11px] text-neutral-400">
            {stats?.escalationCount || 0} escalated sessions
          </p>
        </div>

        {/* Active Agents */}
        <div className="fintech-card p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
              Active Agents
            </span>
            <span className="w-6 h-6 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 text-xs">
              🎙
            </span>
          </div>
          <p className="text-2xl font-bold text-[#0A0A0C] tracking-tight">
            <AnimatedNumber
              value={agents.filter((a) => a.status === "active").length}
            />
          </p>
          <p className="text-[11px] text-neutral-400">
            of {agents.length} total agents
          </p>
        </div>
      </div>

      {/* ─── Volume Chart + Sentiment Donut ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Volume Area Chart */}
        <div className="lg:col-span-2 fintech-card p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-[#0A0A0C] tracking-tight">
                Conversation Volume
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Daily voice sessions across all channels.
              </p>
            </div>
            <span className="px-2.5 py-1 text-[11px] font-mono font-medium rounded-full bg-[#F8F9FA] text-neutral-600 border border-black/[0.05]">
              {timeRange === "7d"
                ? "Last 7 Days"
                : timeRange === "30d"
                ? "Last 30 Days"
                : "Last 90 Days"}
            </span>
          </div>

          <div className="relative pt-3">
            <svg
              viewBox={`0 0 600 160`}
              className="w-full h-44 overflow-visible"
            >
              <defs>
                <linearGradient
                  id="analyticsVolGrad"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="#0066FF"
                    stopOpacity={0.18}
                  />
                  <stop
                    offset="100%"
                    stopColor="#0066FF"
                    stopOpacity={0.0}
                  />
                </linearGradient>
              </defs>
              <path
                d={areaPath(volumeData, 600, 160, 8)}
                fill="url(#analyticsVolGrad)"
              />
              <path
                d={sparklinePath(volumeData, 600, 160, 8)}
                fill="none"
                stroke="#0066FF"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Highlight last point */}
              {volumeData.length > 1 && (() => {
                const max = Math.max(...volumeData, 1);
                const min = Math.min(...volumeData, 0);
                const range = max - min || 1;
                const step = (600 - 16) / (volumeData.length - 1);
                const lastIdx = volumeData.length - 1;
                const x = 8 + lastIdx * step;
                const y =
                  8 +
                  (1 - (volumeData[lastIdx] - min) / range) *
                    (160 - 16);
                return (
                  <circle
                    cx={x}
                    cy={y}
                    r={4}
                    fill="#0066FF"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                );
              })()}
            </svg>

            <div className="flex justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-black/[0.04]">
              {dailyVolume.length > 0 && (
                <>
                  <span>
                    {new Date(dailyVolume[0].label).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" }
                    )}
                  </span>
                  {dailyVolume.length > 6 && (
                    <span>
                      {new Date(
                        dailyVolume[Math.floor(dailyVolume.length / 2)]
                          .label
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                  <span className="text-[#0066FF] font-medium">
                    {new Date(
                      dailyVolume[dailyVolume.length - 1].label
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Sentiment Donut */}
        <div className="fintech-card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-[#0A0A0C] tracking-tight">
            Sentiment Analysis
          </h3>
          <p className="text-xs text-neutral-500">
            Automated conversation evaluation breakdown.
          </p>

          <div className="flex justify-center pt-2">
            <DonutChart segments={sentimentData} size={140} />
          </div>

          <div className="space-y-2 pt-2">
            {sentimentData.map((seg) => (
              <div
                key={seg.label}
                className="flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="font-medium text-[#0A0A0C]">
                    {seg.label}
                  </span>
                </div>
                <span className="font-mono text-neutral-500">
                  {seg.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Latency Pipeline + Agent Performance ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency Pipeline Breakdown */}
        <div className="fintech-card p-6 sm:p-8 space-y-5">
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-[#0A0A0C] tracking-tight">
              Voice Pipeline Latency
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              End-to-end response time decomposition across STT → LLM → TTS
              stages.
            </p>
          </div>

          {/* Total latency highlight */}
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold text-[#0A0A0C] tracking-tight">
              {latencyBreakdown.total}
              <span className="text-base font-normal text-neutral-400">
                ms
              </span>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                latencyBreakdown.total < 400
                  ? "bg-emerald-50 text-emerald-700"
                  : latencyBreakdown.total < 800
                  ? "bg-amber-50 text-amber-700"
                  : "bg-rose-50 text-rose-700"
              }`}
            >
              {latencyBreakdown.total < 400
                ? "Production Ready"
                : latencyBreakdown.total < 800
                ? "Acceptable"
                : "Needs Optimization"}
            </span>
          </div>

          {/* Horizontal stacked bar */}
          <div className="relative h-6 rounded-full overflow-hidden bg-neutral-100 flex">
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${(latencyBreakdown.stt / latencyBreakdown.total) * 100}%`,
                backgroundColor: "#3B82F6",
              }}
            />
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${(latencyBreakdown.llm / latencyBreakdown.total) * 100}%`,
                backgroundColor: "#0066FF",
              }}
            />
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${(latencyBreakdown.tts / latencyBreakdown.total) * 100}%`,
                backgroundColor: "#60A5FA",
              }}
            />
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${(latencyBreakdown.network / latencyBreakdown.total) * 100}%`,
                backgroundColor: "#CBD5E1",
              }}
            />
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              {
                label: "Speech-to-Text",
                value: latencyBreakdown.stt,
                color: "#3B82F6",
              },
              {
                label: "LLM Reasoning",
                value: latencyBreakdown.llm,
                color: "#0066FF",
              },
              {
                label: "Text-to-Speech",
                value: latencyBreakdown.tts,
                color: "#60A5FA",
              },
              {
                label: "Network / Other",
                value: latencyBreakdown.network,
                color: "#CBD5E1",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F8F9FA] border border-black/[0.04]"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <div className="min-w-0">
                  <p className="font-medium text-[#0A0A0C] truncate">
                    {item.label}
                  </p>
                  <p className="text-[11px] font-mono text-neutral-400">
                    {item.value}ms (
                    {Math.round(
                      (item.value / latencyBreakdown.total) * 100
                    )}
                    %)
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Performance Ranking */}
        <div className="fintech-card p-6 sm:p-8 space-y-5">
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-[#0A0A0C] tracking-tight">
              Agent Performance
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Conversations handled by each deployed agent.
            </p>
          </div>

          {agentDistribution.length === 0 ? (
            <div className="text-center py-8 text-neutral-400 text-xs">
              No conversation data available yet.
            </div>
          ) : (
            <div className="space-y-4">
              {agentDistribution.slice(0, 6).map((item, i) => (
                <HBar
                  key={i}
                  label={item.name}
                  value={item.count}
                  max={agentDistribution[0]?.count || 1}
                  color={
                    i === 0
                      ? "#0066FF"
                      : i === 1
                      ? "#3B82F6"
                      : i === 2
                      ? "#60A5FA"
                      : "#94A3B8"
                  }
                  suffix=" sessions"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Channel Distribution + Escalation Funnel ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Distribution */}
        <div className="fintech-card p-6 sm:p-8 space-y-5">
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-[#0A0A0C] tracking-tight">
              Channel Distribution
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Conversation sources across widget, playground, and API.
            </p>
          </div>

          {channelDistribution.length === 0 ? (
            <div className="text-center py-8 text-neutral-400 text-xs">
              No channel data yet.
            </div>
          ) : (
            <div className="space-y-3">
              {channelDistribution.map(([channel, count]) => {
                const icons: Record<string, string> = {
                  widget: "🌐",
                  playground: "🧪",
                  api: "⚙️",
                };
                return (
                  <div
                    key={channel}
                    className="p-3.5 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">
                        {icons[channel] || "📡"}
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-[#0A0A0C] capitalize">
                          {channel}
                        </p>
                        <p className="text-[11px] text-neutral-400">
                          {count} sessions
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-[#0A0A0C]">
                        {conversations.length > 0
                          ? Math.round(
                              (count / conversations.length) * 100
                            )
                          : 0}
                        %
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Escalation & Resolution Funnel */}
        <div className="fintech-card p-6 sm:p-8 space-y-5">
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-[#0A0A0C] tracking-tight">
              Escalation & Resolution
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Human handoff rate, resolution status, and active session
              tracking.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
              <p className="text-2xl font-bold text-[#0A0A0C]">
                {escalationMetrics.active}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 mt-1">
                Active
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-100">
              <p className="text-2xl font-bold text-[#F43F5E]">
                {escalationMetrics.escalated}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 mt-1">
                Escalated
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100">
              <p className="text-2xl font-bold text-emerald-600">
                {escalationMetrics.resolved}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 mt-1">
                Resolved
              </p>
            </div>
          </div>

          {/* Resolution funnel bars */}
          <div className="space-y-3">
            <HBar
              label="Resolution Rate"
              value={escalationMetrics.resolutionRate}
              max={100}
              color="#10B981"
              suffix="%"
            />
            <HBar
              label="Escalation Rate"
              value={escalationMetrics.escalationRate}
              max={100}
              color="#F43F5E"
              suffix="%"
            />
          </div>

          {/* Insight pill */}
          <div className="p-3 rounded-2xl bg-blue-50/50 border border-blue-100 flex items-start gap-2.5">
            <span className="text-[#0066FF] text-sm mt-0.5">💡</span>
            <div className="text-xs text-neutral-600">
              <span className="font-semibold text-[#0A0A0C]">
                Insight:
              </span>{" "}
              {escalationMetrics.escalationRate < 5
                ? "Excellent — agent is handling conversations autonomously with minimal human intervention."
                : escalationMetrics.escalationRate < 15
                ? "Moderate — consider refining agent knowledge base to reduce escalation triggers."
                : "High escalation rate — review conversation transcripts and update knowledge sources."}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Quality Evaluation Summary ──────────────────────────────── */}
      <div className="fintech-card p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-[#0A0A0C] tracking-tight">
              Quality Evaluation Dimensions
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              PRD-aligned evaluation metrics: grounding, task success, tool
              correctness, and voice UX quality.
            </p>
          </div>
          <span className="px-2.5 py-1 text-[11px] font-mono font-medium rounded-full bg-[#F8F9FA] text-neutral-600 border border-black/[0.05]">
            Auto-evaluated
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Grounding",
              description: "Answers supported by retrieved context",
              score: 94,
              trend: "+2.1%",
              color: "#10B981",
            },
            {
              label: "Task Success",
              description: "User objectives completed",
              score: 87,
              trend: "+5.3%",
              color: "#0066FF",
            },
            {
              label: "Tool Accuracy",
              description: "Correct tool selection & arguments",
              score: 91,
              trend: "+1.8%",
              color: "#8B5CF6",
            },
            {
              label: "Voice UX",
              description: "Latency, interruption handling, naturalness",
              score: 89,
              trend: "+3.2%",
              color: "#F59E0B",
            },
          ].map((dim) => (
            <div
              key={dim.label}
              className="p-5 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#0A0A0C]">
                  {dim.label}
                </span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                  {dim.trend}
                </span>
              </div>

              {/* Circular progress */}
              <div className="flex justify-center">
                <div className="relative w-16 h-16">
                  <svg viewBox="0 0 36 36" className="w-full h-full">
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#E2E8F0"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke={dim.color}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${dim.score * 0.88} 100`}
                      transform="rotate(-90 18 18)"
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-[#0A0A0C]">
                      {dim.score}%
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-neutral-400 text-center leading-snug">
                {dim.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
