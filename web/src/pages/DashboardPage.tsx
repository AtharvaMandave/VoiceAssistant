import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient, fetchAgents, fetchConversationStats } from "../lib/api";
import type { Agent, ConversationStats } from "@voiceflow/shared";

interface HealthData {
  status: string;
  uptime: number;
  timestamp: string;
  services: {
    database: string;
    redis: string;
  };
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<ConversationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      try {
        const [healthRes, agentsRes, statsRes] = await Promise.allSettled([
          apiClient.get("/api/health"),
          fetchAgents({ limit: 5 }),
          fetchConversationStats(),
        ]);

        if (healthRes.status === "fulfilled") {
          setHealth(healthRes.value.data.data);
        }
        if (agentsRes.status === "fulfilled") {
          setAgents(agentsRes.value.data);
        }
        if (statsRes.status === "fulfilled") {
          setStats(statsRes.value);
        }
      } catch (err) {
        console.error("Dashboard data load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* ─── Top Header & Controls ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.05]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0A0A0C]">
              Overview
            </h1>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Voice sessions, pipeline latency, and autonomous tool metrics.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/dashboard/conversations"
            className="btn-pill-secondary text-xs"
          >
            Review Transcripts
          </Link>
          <button
            type="button"
            onClick={() => navigate("/dashboard/agents/new")}
            className="btn-pill-blue text-xs shadow-pill-blue"
          >
            + Create Agent
          </button>
        </div>
      </div>

      {/* ─── KPI Metric Cards: Large White Rounded Cards with Soft Shadows ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Calls */}
        <div className="fintech-card p-5">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-medium uppercase tracking-wider text-[10px]">Total Calls</span>
            <span className="text-[#0066FF] font-semibold text-xs">Sessions</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-[#0A0A0C] mt-2 tracking-tight">
            {stats ? stats.totalConversations : "12.4K"}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
              &uarr; 14.2%
            </span>
            <span className="text-neutral-400 text-[11px]">vs last week</span>
          </div>
        </div>

        {/* Voice Minutes */}
        <div className="fintech-card p-5">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-medium uppercase tracking-wider text-[10px]">Voice Minutes</span>
            <span className="text-neutral-500 text-xs">Audio</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-[#0A0A0C] mt-2 tracking-tight">
            8.2K
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[#0066FF]">
              &uarr; 8.6%
            </span>
            <span className="text-neutral-400 text-[11px]">streaming</span>
          </div>
        </div>

        {/* Quality Score */}
        <div className="fintech-card p-5">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-medium uppercase tracking-wider text-[10px]">Quality Score</span>
            <span className="text-emerald-600 text-xs">CSAT</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-[#0A0A0C] mt-2 tracking-tight">
            92%
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-[#F43F5E]">
              1.8%
            </span>
            <span className="text-neutral-400 text-[11px]">escalation rate</span>
          </div>
        </div>

        {/* Average Latency */}
        <div className="fintech-card p-5">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-medium uppercase tracking-wider text-[10px]">Avg Latency</span>
            <span className="text-[#0066FF] font-semibold text-xs">⚡ Fast</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-[#0A0A0C] mt-2 tracking-tight">
            {stats ? `${stats.avgLatencyMs}ms` : "314ms"}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[#0066FF]">
              Sub-400ms Pipeline
            </span>
          </div>
        </div>
      </div>

      {/* ─── Two-Column Middle Section: Volume Chart + Agent Status ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Clean SVG Area Volume Chart */}
        <div className="lg:col-span-2 fintech-card p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-[#0A0A0C] tracking-tight">
                Conversation Volume &amp; Trends
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Hourly multi-turn voice sessions across website widget and interactive playground.
              </p>
            </div>
            <span className="px-2.5 py-1 text-[11px] font-mono font-medium rounded-full bg-[#F8F9FA] text-neutral-600 border border-black/[0.05]">
              Last 24 Hours
            </span>
          </div>

          {/* SVG Area Chart Graphic */}
          <div className="relative pt-3">
            <svg viewBox="0 0 500 150" className="w-full h-40 overflow-visible">
              <defs>
                <linearGradient id="fintechVolGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0066FF" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#0066FF" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M 0,130 Q 50,100 100,115 T 200,75 T 300,45 T 400,60 T 500,20 L 500,150 L 0,150 Z"
                fill="url(#fintechVolGrad)"
              />
              <path
                d="M 0,130 Q 50,100 100,115 T 200,75 T 300,45 T 400,60 T 500,20"
                fill="none"
                stroke="#0066FF"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="200" cy="75" r="3.5" fill="#FFFFFF" stroke="#0066FF" strokeWidth="2" />
              <circle cx="300" cy="45" r="3.5" fill="#FFFFFF" stroke="#0066FF" strokeWidth="2" />
              <circle cx="500" cy="20" r="4.5" fill="#0066FF" stroke="#FFFFFF" strokeWidth="2" />
            </svg>

            <div className="flex justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-black/[0.04]">
              <span>12 AM</span>
              <span>4 AM</span>
              <span>8 AM</span>
              <span>12 PM</span>
              <span>4 PM</span>
              <span>8 PM</span>
              <span className="text-[#0066FF] font-medium">Now</span>
            </div>
          </div>
        </div>

        {/* Right Column: Agent Status Card */}
        <div className="fintech-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#0A0A0C] tracking-tight">
              Gateway Status
            </h3>
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Operational
            </span>
          </div>

          <div className="space-y-2.5 pt-1 text-xs">
            <div className="p-3 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#0A0A0C]">Website Voice Widget</p>
                <p className="text-[11px] text-neutral-400">live-embed</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                ONLINE
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#0A0A0C]">RAG Vector Search</p>
                <p className="text-[11px] text-neutral-400">Atlas Vector</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#0066FF] font-semibold text-[10px]">
                HEALTHY
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#0A0A0C]">Realtime Audio Gateway</p>
                <p className="text-[11px] text-neutral-400">WebSockets 24kHz</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#0066FF] font-semibold text-[10px]">
                0.8s LATENCY
              </span>
            </div>
          </div>

          <div className="pt-2">
            <Link
              to="/dashboard/agents"
              className="w-full btn-pill-secondary text-xs text-center block"
            >
              Manage Agents &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Active Agents Table & Infrastructure Health ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Agents List */}
        <div className="lg:col-span-2 fintech-card p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-semibold text-[#0A0A0C] tracking-tight">
              Active Voice Agents
            </h3>
            <Link to="/dashboard/agents" className="text-xs text-[#0066FF] hover:underline font-medium">
              View All ({agents.length})
            </Link>
          </div>

          {loading ? (
            <p className="text-xs text-neutral-400 py-6 text-center">Loading agents...</p>
          ) : agents.length === 0 ? (
            <div className="text-center py-8 text-neutral-400 text-xs space-y-3">
              <p>No agents created yet.</p>
              <button
                type="button"
                onClick={() => navigate("/dashboard/agents/new")}
                className="btn-pill-blue text-xs"
              >
                Create First Agent
              </button>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.04]">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => navigate(`/dashboard/agents/${agent.id}`)}
                  className="py-3 flex items-center justify-between gap-4 hover:bg-neutral-50 px-2 rounded-xl cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#0066FF] flex items-center justify-center font-bold text-xs">
                      🎙️
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#0A0A0C] group-hover:text-[#0066FF] transition-colors">
                        {agent.name}
                      </p>
                      <p className="text-[11px] text-neutral-400 capitalize">
                        Template: {agent.template} &middot; Voice: {agent.voice?.voiceId || "af_heart"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                        agent.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-neutral-100 text-neutral-500 border border-neutral-200"
                      }`}
                    >
                      {agent.status}
                    </span>
                    <span className="text-xs text-neutral-400 group-hover:text-black">&rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cluster Node Health */}
        <div className="fintech-card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-[#0A0A0C] tracking-tight">
            Cluster Health
          </h3>
          <p className="text-xs text-neutral-400">
            Node status across database and memory cache tiers.
          </p>

          <div className="space-y-2.5 pt-1 text-xs">
            <div className="p-3 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#0A0A0C]">API Server</p>
                <p className="text-[11px] text-neutral-400">Port 3001 &middot; Express</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                {health?.status || "HEALTHY"}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#0A0A0C]">MongoDB Atlas</p>
                <p className="text-[11px] text-neutral-400">Vectors &amp; Documents</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                {health?.services.database || "CONNECTED"}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#0A0A0C]">Redis Cache</p>
                <p className="text-[11px] text-neutral-400">Voice Session State</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                {health?.services.redis || "CONNECTED"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}