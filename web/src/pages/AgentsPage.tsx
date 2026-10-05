import {
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { fetchAgents, deleteAgent, type PaginatedResult } from "../lib/api";
import type { Agent } from "@voiceflow/shared";

const STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  active: {
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    dot: "bg-emerald-500",
  },
  draft: {
    badge: "bg-amber-50 text-amber-700 border border-amber-200",
    dot: "bg-amber-500",
  },
  paused: {
    badge: "bg-neutral-100 text-neutral-600 border border-neutral-200",
    dot: "bg-neutral-400",
  },
  archived: {
    badge: "bg-rose-50 text-[#F43F5E] border border-rose-200",
    dot: "bg-[#F43F5E]",
  },
};

const TEMPLATE_ICONS: Record<string, string> = {
  support: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z",
  sales: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  appointment: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  custom: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z",
};

const ICONS = {
  plus: "M12 4.5v15m7.5-7.5h-15",
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  mic: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z",
  language: "M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802",
  play: [
    "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z",
    "M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  ],
  edit: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z",
  archive: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
};

function Icon({
  d,
  className = "h-4 w-4",
  strokeWidth = 2,
  style,
}: {
  d: string | string[];
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      aria-hidden="true"
      className={className}
      style={style}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
    >
      {paths.map((p, i) => (
        <path key={i} strokeLinecap="round" strokeLinejoin="round" d={p} />
      ))}
    </svg>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="p-1.5 rounded-full text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function AgentsPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<PaginatedResult<Agent> | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAgents({
        search: searchQuery || undefined,
        status: statusFilter || undefined,
      });
      setResult(res);
    } catch (err) {
      console.error("Failed to load agents:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Archive "${name}"? This will deactivate the agent.`)) return;
    setDeletingId(id);
    try {
      await deleteAgent(id);
      await loadAgents();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const agents = result?.data || [];
  const filtersActive = Boolean(searchQuery || statusFilter);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-black/[0.05]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0A0A0C]">
            Voice Agents
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Configure personas, knowledge RAG docs, and safe tool execution.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard/agents/new")}
          className="btn-pill-blue text-xs shadow-pill-blue"
        >
          + Create Agent
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-md flex-1">
          <Icon
            d={ICONS.search}
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
          />
          <input
            type="text"
            placeholder="Search agents by name or template..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-full bg-white border border-black/[0.08] text-[#0A0A0C] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] shadow-xs"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 text-xs rounded-full bg-white border border-black/[0.08] text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] shadow-xs"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Agents Container: Large White Rounded Card */}
      <div className="fintech-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-400">Loading agents...</div>
        ) : agents.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-400">
              🎙️
            </div>
            <h3 className="text-sm font-semibold text-[#0A0A0C]">
              {filtersActive ? "No matching agents found" : "No voice agents created yet"}
            </h3>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              {filtersActive
                ? "Try adjusting your search query or status filter."
                : "Create your first agent to start handling live customer conversations."}
            </p>
            {!filtersActive && (
              <button
                type="button"
                onClick={() => navigate("/dashboard/agents/new")}
                className="mt-2 btn-pill-blue text-xs"
              >
                Create First Agent
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-black/[0.04]">
            {agents.map((agent) => {
              const statusStyle = STATUS_STYLES[agent.status] || STATUS_STYLES.draft;
              const templateIcon = TEMPLATE_ICONS[agent.template] || TEMPLATE_ICONS.custom;
              return (
                <li
                  key={agent.id}
                  onClick={() => navigate(`/dashboard/agents/${agent.id}`)}
                  className="px-5 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-neutral-50/70 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0066FF] shrink-0">
                      <Icon d={templateIcon} className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-semibold text-[#0A0A0C] group-hover:text-[#0066FF] transition-colors">
                        {agent.name}
                      </h3>
                      <p className="text-[11px] text-neutral-400 capitalize">
                        {agent.template} &middot; Voice: {agent.voice.engine}/{agent.voice.voiceId} &middot; {agent.languages[0] || "en-US"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${statusStyle.badge}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                      {agent.status}
                    </span>

                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ActionButton
                        label="Test in Playground"
                        onClick={() => navigate(`/dashboard/agents/${agent.id}?tab=Playground`)}
                      >
                        <Icon d={ICONS.play} />
                      </ActionButton>
                      <ActionButton
                        label="Edit Agent"
                        onClick={() => navigate(`/dashboard/agents/${agent.id}`)}
                      >
                        <Icon d={ICONS.edit} />
                      </ActionButton>
                      <ActionButton
                        label="Archive"
                        onClick={() => handleDelete(agent.id, agent.name)}
                        disabled={deletingId === agent.id}
                      >
                        <Icon d={ICONS.archive} />
                      </ActionButton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {result && result.pagination.totalPages > 1 && (
        <p className="text-xs text-neutral-400 text-right">
          Page {result.pagination.page} of {result.pagination.totalPages} ({result.pagination.total} agents)
        </p>
      )}
    </div>
  );
}

export default AgentsPage;