import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "../stores/authStore";
import {
  fetchApiKeys,
  createApiKey,
  revokeApiKey,
  fetchWebhooks,
  createWebhook,
  testWebhook,
  deleteWebhook,
  fetchUsageAndBilling,
  updateOrgPlan,
  fetchTeamMembers,
  inviteTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
} from "../lib/api";
import type {
  ApiKey,
  CreatedApiKeyResponse,
  Webhook,
  OrgUsageSummary,
  TeamMember,
  Role,
  WebhookEvent,
} from "@voiceflow/shared";

type Tab = "general" | "team" | "apikeys" | "webhooks" | "billing";

const TABS: { id: Tab; label: string; icon: string }[] = [
  {
    id: "general",
    label: "General",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    id: "team",
    label: "Team & RBAC",
    icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  },
  {
    id: "apikeys",
    label: "API Keys",
    icon: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z",
  },
  {
    id: "webhooks",
    label: "Webhooks",
    icon: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
  },
  {
    id: "billing",
    label: "Billing & Quotas",
    icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5z",
  },
];

const ALL_WEBHOOK_EVENTS: { id: WebhookEvent; label: string; desc: string }[] = [
  { id: "conversation.started", label: "Conversation Started", desc: "Fires when visitor connects and initiates a voice session" },
  { id: "conversation.ended", label: "Conversation Ended", desc: "Fires when voice or text session finishes with full transcript" },
  { id: "escalation.triggered", label: "Escalation Triggered", desc: "Fires when agent routes to human due to sentiment or low confidence" },
  { id: "tool.executed", label: "Tool Executed", desc: "Fires whenever an automated action or CRM tool is called" },
  { id: "agent.created", label: "Agent Created", desc: "Fires when a new voice agent profile is published" },
  { id: "agent.updated", label: "Agent Updated", desc: "Fires when agent instructions, voice, or tools are altered" },
];

export default function SettingsPage() {
  const { activeOrganization, role: currentRole } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // General settings state
  const [workspaceName, setWorkspaceName] = useState(activeOrganization?.name || "VoiceFlow Workspace");
  const [defaultLanguage, setDefaultLanguage] = useState("en-US");
  const [timezone, setTimezone] = useState("UTC");

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["*"]);
  const [createdKeySecret, setCreatedKeySecret] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Webhooks state
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookDesc, setWebhookDesc] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([
    "conversation.ended",
    "escalation.triggered",
  ]);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; ms: number } | null>(null);

  // Team state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("developer");
  const [inviteName, setInviteName] = useState("");

  // Billing state
  const [usage, setUsage] = useState<OrgUsageSummary | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load Tab Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "team") {
        const members = await fetchTeamMembers();
        setTeamMembers(members);
      } else if (activeTab === "apikeys") {
        const keys = await fetchApiKeys();
        setApiKeys(keys);
      } else if (activeTab === "webhooks") {
        const hooks = await fetchWebhooks();
        setWebhooks(hooks);
      } else if (activeTab === "billing") {
        const u = await fetchUsageAndBilling();
        setUsage(u);
      }
    } catch {
      // Fallback state
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers for API Keys
  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    try {
      const res: CreatedApiKeyResponse = await createApiKey({
        name: newKeyName.trim(),
        scopes: newKeyScopes,
      });
      setApiKeys((prev) => [res.apiKey, ...prev]);
      setCreatedKeySecret(res.secretKey);
      setNewKeyName("");
      showToast("API key created successfully");
    } catch (err: any) {
      showToast(err.message || "Failed to create API key");
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action is immediate and cannot be undone.")) {
      return;
    }
    try {
      await revokeApiKey(id);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
      showToast("API key revoked");
    } catch {
      showToast("Failed to revoke API key");
    }
  };

  // Handlers for Webhooks
  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim() || webhookEvents.length === 0) return;
    try {
      const res = await createWebhook({
        url: webhookUrl.trim(),
        description: webhookDesc.trim() || undefined,
        events: webhookEvents,
      });
      setWebhooks((prev) => [res, ...prev]);
      setShowWebhookModal(false);
      setWebhookUrl("");
      setWebhookDesc("");
      showToast("Webhook endpoint registered");
    } catch (err: any) {
      showToast(err.message || "Failed to register webhook");
    }
  };

  const handleTestWebhook = async (id: string) => {
    setTestingWebhookId(id);
    try {
      const res = await testWebhook(id);
      setTestResult({ id, success: res.delivered, ms: res.durationMs });
      showToast(`Ping response: ${res.statusCode} (${res.durationMs}ms)`);
      loadData();
    } catch {
      showToast("Webhook ping failed");
    } finally {
      setTestingWebhookId(null);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm("Delete this webhook endpoint?")) return;
    try {
      await deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      showToast("Webhook removed");
    } catch {
      showToast("Failed to remove webhook");
    }
  };

  // Handlers for Team
  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      const member = await inviteTeamMember({
        email: inviteEmail.trim(),
        role: inviteRole,
        name: inviteName.trim() || undefined,
      });
      setTeamMembers((prev) => [...prev, member]);
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteName("");
      showToast(`Invitation sent to ${member.email}`);
    } catch (err: any) {
      showToast(err.message || "Failed to invite member");
    }
  };

  const handleRoleChange = async (memberId: string, newRole: Role) => {
    try {
      await updateTeamMemberRole(memberId, { role: newRole });
      setTeamMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
      showToast("Member role updated");
    } catch (err: any) {
      showToast(err.message || "Failed to update member role");
    }
  };

  const handleRemoveMember = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from organization?`)) return;
    try {
      await removeTeamMember(memberId);
      setTeamMembers((prev) => prev.filter((m) => m.id !== memberId));
      showToast("Member removed from workspace");
    } catch (err: any) {
      showToast(err.message || "Failed to remove member");
    }
  };

  // Handlers for Billing
  const handleUpgradePlan = async (targetPlan: "free" | "pro" | "enterprise") => {
    setUpgradingPlan(targetPlan);
    try {
      await updateOrgPlan(targetPlan);
      showToast(`Plan updated to ${targetPlan.toUpperCase()}`);
      loadData();
    } catch {
      showToast("Failed to change plan");
    } finally {
      setUpgradingPlan(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#0A0A0C] text-white text-xs font-medium shadow-xl border border-white/10 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0A0A0C]">
            Workspace Settings
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Manage organization members, security credentials, webhooks, and billing quotas
          </p>
        </div>

        {/* Current Org Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-black/[0.06] shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[#0066FF]" />
          <span className="text-xs font-semibold text-[#0A0A0C]">
            {activeOrganization?.name || "Workspace"}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
            {activeOrganization?.plan || "Free"}
          </span>
        </div>
      </div>

      {/* Tabs Pill Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-black/[0.05]">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all shrink-0 ${
                isActive
                  ? "bg-[#0A0A0C] text-white shadow-sm"
                  : "text-neutral-500 hover:text-black hover:bg-neutral-100"
              }`}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              <span>{tab.label}</span>
            </button>
          );
        })}
        {loading && (
          <span className="w-4 h-4 border-2 border-neutral-300 border-t-[#0066FF] rounded-full animate-spin ml-2 shrink-0" />
        )}
      </div>

      {/* TAB CONTENT: General */}
      {activeTab === "general" && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-white border border-black/[0.05] p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-6">
            <div>
              <h2 className="text-sm font-bold text-[#0A0A0C]">Organization Profile</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Workspace identity and localization preferences
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.08] text-xs bg-[#F8F9FA] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Workspace Identifier / Slug
                </label>
                <input
                  type="text"
                  disabled
                  value={activeOrganization?.slug || "workspace"}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.08] text-xs bg-neutral-100 text-neutral-500 cursor-not-allowed font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Default Language
                </label>
                <select
                  value={defaultLanguage}
                  onChange={(e) => setDefaultLanguage(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.08] text-xs bg-[#F8F9FA] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066FF]"
                >
                  <option value="en-US">English (United States)</option>
                  <option value="en-IN">English (India)</option>
                  <option value="hi-IN">Hindi (India)</option>
                  <option value="es-ES">Spanish (Spain)</option>
                  <option value="fr-FR">French (France)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.08] text-xs bg-[#F8F9FA] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066FF]"
                >
                  <option value="UTC">UTC (Universal Coordinated Time)</option>
                  <option value="America/New_York">Eastern Time (US & Canada)</option>
                  <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                  <option value="Asia/Kolkata">India Standard Time (IST)</option>
                  <option value="Europe/London">Greenwich Mean Time (London)</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-black/[0.05] flex justify-end">
              <button
                type="button"
                onClick={() => showToast("Workspace settings updated")}
                className="btn-pill-blue text-xs py-2 px-5"
              >
                Save Changes
              </button>
            </div>
          </div>

          {/* Security & Access */}
          <div className="rounded-3xl bg-white border border-black/[0.05] p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#0A0A0C]">Access & Security Policy</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Session lifetime and tenant isolation configuration
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] space-y-1">
                <span className="text-xs font-semibold text-[#0A0A0C] block">
                  Allowed Widget Embedding
                </span>
                <p className="text-[11px] text-neutral-500">
                  Enforces origin headers on all iframe embed sessions. Configured per-agent in the Widget tab.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] space-y-1">
                <span className="text-xs font-semibold text-[#0A0A0C] block">
                  Realtime Voice Encryption
                </span>
                <p className="text-[11px] text-neutral-500">
                  All WebSocket voice chunks and transcripts stream over TLS with ephemeral JWT session tokens.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Team & RBAC */}
      {activeTab === "team" && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-white border border-black/[0.05] p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-[#0A0A0C]">Team Members & Access Control</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Manage members and their role permissions across VoiceFlow
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="btn-pill-blue text-xs py-2 px-4 self-start sm:self-auto"
              >
                + Invite Member
              </button>
            </div>

            {/* Members Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-black/[0.05] text-neutral-400 font-medium">
                    <th className="pb-3 pl-1">Member</th>
                    <th className="pb-3">Role</th>
                    <th className="pb-3">Joined</th>
                    <th className="pb-3 text-right pr-1">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {teamMembers.map((member) => (
                    <tr key={member.id} className="group hover:bg-[#F8F9FA]/60">
                      <td className="py-3.5 pl-1">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-neutral-100 border border-black/[0.06] flex items-center justify-center font-bold text-[#0A0A0C]">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-[#0A0A0C]">{member.name}</p>
                            <p className="text-[11px] text-neutral-400">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5">
                        <select
                          value={member.role}
                          disabled={currentRole !== "owner" && currentRole !== "admin"}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as Role)}
                          className="px-2.5 py-1 rounded-lg border border-black/[0.08] text-xs font-semibold bg-white text-[#0A0A0C] capitalize focus:outline-none focus:ring-1 focus:ring-[#0066FF] disabled:opacity-60"
                        >
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="developer">Developer</option>
                          <option value="support">Support</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>
                      <td className="py-3.5 text-neutral-400">
                        {new Date(member.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 text-right pr-1">
                        {member.role !== "owner" && (currentRole === "owner" || currentRole === "admin") && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id, member.name)}
                            className="text-neutral-400 hover:text-red-600 transition-colors p-1"
                            title="Remove member"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RBAC Role Guide */}
          <div className="rounded-3xl bg-white border border-black/[0.05] p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Role Permission Matrix
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { role: "Owner", desc: "Full control over organization, billing, members, and all agent models." },
                { role: "Admin", desc: "Manage voice agents, knowledge bases, safe tools, and invite team members." },
                { role: "Developer", desc: "Configure agent prompts, API keys, webhook integrations, and test tools." },
                { role: "Support", desc: "Access conversations, transcripts, human escalations, and resolution tags." },
                { role: "Viewer", desc: "Read-only access to conversation analytics, latency graphs, and agent stats." },
              ].map((r) => (
                <div key={r.role} className="p-3.5 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
                  <span className="text-xs font-bold text-[#0A0A0C] block mb-1">{r.role}</span>
                  <p className="text-[11px] text-neutral-500 leading-snug">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: API Keys */}
      {activeTab === "apikeys" && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-white border border-black/[0.05] p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-[#0A0A0C]">Secret API Keys</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Authenticate programmatic REST requests and custom backend voice integrations
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCreatedKeySecret(null);
                  setShowKeyModal(true);
                }}
                className="btn-pill-blue text-xs py-2 px-4 self-start sm:self-auto"
              >
                + Create New Secret Key
              </button>
            </div>

            {/* Created Key Banner (Shown Once) */}
            {createdKeySecret && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900">
                    ⚠️ Copy your secret key now. You will not be able to view it again!
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdKeySecret);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="px-3 py-1 rounded-full bg-amber-900 text-white text-[11px] font-semibold hover:bg-amber-800 transition-colors"
                  >
                    {copiedKey ? "✓ Copied" : "Copy Key"}
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-amber-200 font-mono text-xs text-amber-950 break-all select-all">
                  {createdKeySecret}
                </div>
              </div>
            )}

            {/* Keys Table */}
            {apiKeys.length === 0 ? (
              <div className="text-center py-10 bg-[#F8F9FA] rounded-2xl border border-dashed border-black/[0.08]">
                <p className="text-xs font-semibold text-neutral-700">No active API keys</p>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Create a key to authenticate voice API requests from your backend
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.05] text-neutral-400 font-medium">
                      <th className="pb-3 pl-1">Name</th>
                      <th className="pb-3">Key Prefix</th>
                      <th className="pb-3">Scopes</th>
                      <th className="pb-3">Created</th>
                      <th className="pb-3 text-right pr-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04]">
                    {apiKeys.map((key) => (
                      <tr key={key.id} className="group hover:bg-[#F8F9FA]/60">
                        <td className="py-3.5 pl-1 font-semibold text-[#0A0A0C]">
                          {key.name}
                        </td>
                        <td className="py-3.5 font-mono text-neutral-600">
                          {key.keyPrefix}
                        </td>
                        <td className="py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {key.scopes.map((s) => (
                              <span
                                key={s}
                                className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 text-neutral-700"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3.5 text-neutral-400">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 text-right pr-1">
                          <button
                            type="button"
                            onClick={() => handleRevokeKey(key.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Webhooks */}
      {activeTab === "webhooks" && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-white border border-black/[0.05] p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-[#0A0A0C]">Outbound Webhooks</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Receive real-time HTTP POST notifications when conversations finish or tools execute
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowWebhookModal(true)}
                className="btn-pill-blue text-xs py-2 px-4 self-start sm:self-auto"
              >
                + Add Endpoint
              </button>
            </div>

            {webhooks.length === 0 ? (
              <div className="text-center py-10 bg-[#F8F9FA] rounded-2xl border border-dashed border-black/[0.08]">
                <p className="text-xs font-semibold text-neutral-700">No webhooks registered</p>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Connect your CRM, Slack, or ticketing system to receive live event webhooks
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {webhooks.map((hook) => (
                  <div
                    key={hook.id}
                    className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-mono text-xs font-semibold text-[#0A0A0C] truncate">
                          {hook.url}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400">
                          ({hook.secretMasked})
                        </span>
                      </div>
                      {hook.description && (
                        <p className="text-[11px] text-neutral-500">{hook.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {hook.events.map((e) => (
                          <span
                            key={e}
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-black/[0.06] text-neutral-600"
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {testResult && testResult.id === hook.id && (
                        <span className="text-[10px] text-emerald-600 font-semibold px-2 py-0.5 rounded-full bg-emerald-50">
                          ✓ {testResult.ms}ms
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={testingWebhookId === hook.id}
                        onClick={() => handleTestWebhook(hook.id)}
                        className="px-3 py-1.5 rounded-full bg-white border border-black/[0.08] text-xs font-semibold text-[#0A0A0C] hover:bg-neutral-50 transition-colors disabled:opacity-50"
                      >
                        {testingWebhookId === hook.id ? "Sending..." : "Test Ping"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteWebhook(hook.id)}
                        className="p-1.5 rounded-full text-neutral-400 hover:text-red-600 transition-colors"
                        title="Delete Webhook"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Billing & Quotas */}
      {activeTab === "billing" && (
        <div className="space-y-6">
          {/* Usage Meters Card */}
          <div className="rounded-3xl bg-white border border-black/[0.05] p-6 sm:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.02)] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-[#0A0A0C]">Resource Usage & Monthly Quotas</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Current consumption across speech models, LLM tokens, and agent allocations
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-neutral-400 block">Current Plan Tier</span>
                <span className="text-sm font-bold uppercase text-[#0066FF]">
                  {usage?.plan || activeOrganization?.plan || "Free"}
                </span>
              </div>
            </div>

            {/* Meters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Voice Minutes */}
              <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-500 font-medium">Voice Minutes</span>
                  <span className="font-bold text-[#0A0A0C]">
                    {usage?.voiceMinutes.used || 0} / {usage?.voiceMinutes.limit || 30}m
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#0066FF] transition-all duration-500"
                    style={{ width: `${usage?.voiceMinutes.percentage || 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-neutral-400">{usage?.voiceMinutes.percentage || 0}% consumed</p>
              </div>

              {/* Tokens */}
              <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-500 font-medium">LLM Tokens</span>
                  <span className="font-bold text-[#0A0A0C]">
                    {((usage?.tokens.used || 0) / 1000).toFixed(0)}k / {((usage?.tokens.limit || 100000) / 1000).toFixed(0)}k
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${usage?.tokens.percentage || 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-neutral-400">{usage?.tokens.percentage || 0}% consumed</p>
              </div>

              {/* Active Agents */}
              <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-500 font-medium">Active Agents</span>
                  <span className="font-bold text-[#0A0A0C]">
                    {usage?.agents.used || 0} / {usage?.agents.limit || 2}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${usage?.agents.percentage || 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-neutral-400">{usage?.agents.percentage || 0}% allocated</p>
              </div>

              {/* Team Members */}
              <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-500 font-medium">Team Members</span>
                  <span className="font-bold text-[#0A0A0C]">
                    {usage?.teamMembers.used || 1} / {usage?.teamMembers.limit || 2}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all duration-500"
                    style={{ width: `${usage?.teamMembers.percentage || 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-neutral-400">{usage?.teamMembers.percentage || 0}% seats used</p>
              </div>
            </div>
          </div>

          {/* Plan Tiers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                id: "free",
                name: "Starter",
                price: "$0",
                period: "/month",
                desc: "Ideal for testing and building your first embedded voice agent.",
                features: [
                  "30 voice minutes/mo",
                  "100k LLM reasoning tokens",
                  "2 active voice agents",
                  "2 team seats",
                  "Silero VAD + Faster-Whisper",
                  "Standard Web Widget",
                ],
              },
              {
                id: "pro",
                name: "Growth",
                price: "$49",
                period: "/month",
                desc: "High volume voice sessions for fast-growing SaaS and online businesses.",
                features: [
                  "300 voice minutes/mo",
                  "2,000,000 LLM reasoning tokens",
                  "10 active voice agents",
                  "10 team seats",
                  "IndicConformer + Chatterbox TTS",
                  "Safe Tool Calling & Webhooks",
                  "Priority support",
                ],
                popular: true,
              },
              {
                id: "enterprise",
                name: "Enterprise",
                price: "$249",
                period: "/month",
                desc: "Dedicated GPU clusters, unlimited seats, custom domain security.",
                features: [
                  "5,000 voice minutes/mo",
                  "25,000,000 LLM tokens",
                  "100 active voice agents",
                  "50 team seats",
                  "Custom fine-tuned voice models",
                  "Custom SLA & 99.9% uptime guarantee",
                  "Dedicated solution engineer",
                ],
              },
            ].map((plan) => {
              const isCurrent = (usage?.plan || activeOrganization?.plan || "free") === plan.id;
              return (
                <div
                  key={plan.id}
                  className={`rounded-3xl p-6 sm:p-7 border relative flex flex-col justify-between transition-all ${
                    plan.popular
                      ? "bg-white border-[#0066FF] shadow-lg shadow-blue-500/5 ring-2 ring-[#0066FF]/20"
                      : "bg-white border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.02)]"
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold bg-[#0066FF] text-white uppercase tracking-wider">
                      Most Popular
                    </span>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-bold text-[#0A0A0C]">{plan.name}</h3>
                      <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">{plan.desc}</p>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-[#0A0A0C]">{plan.price}</span>
                      <span className="text-xs text-neutral-400 font-medium">{plan.period}</span>
                    </div>

                    <ul className="space-y-2 pt-2 border-t border-black/[0.05]">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-xs text-neutral-600">
                          <svg className="w-3.5 h-3.5 text-[#0066FF] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-6">
                    <button
                      type="button"
                      disabled={isCurrent || upgradingPlan === plan.id}
                      onClick={() => handleUpgradePlan(plan.id as any)}
                      className={`w-full py-2.5 rounded-full text-xs font-semibold transition-all ${
                        isCurrent
                          ? "bg-neutral-100 text-neutral-400 cursor-default"
                          : plan.popular
                          ? "btn-pill-blue"
                          : "bg-[#0A0A0C] text-white hover:bg-neutral-800"
                      }`}
                    >
                      {isCurrent
                        ? "Current Plan"
                        : upgradingPlan === plan.id
                        ? "Updating..."
                        : `Switch to ${plan.name}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: Create API Key */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-black/[0.08] space-y-5">
            <div>
              <h3 className="text-base font-bold text-[#0A0A0C]">Create Secret API Key</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Generate a token for programmatic access to agents and conversations
              </p>
            </div>

            <form onSubmit={handleCreateApiKey} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Key Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production Backend Voice Worker"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.08] text-xs bg-[#F8F9FA] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066FF]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Permissions & Scopes
                </label>
                <div className="space-y-1.5 p-3 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
                  {[
                    { id: "*", label: "Full Access (*)", desc: "All endpoints including agent config and tools" },
                    { id: "agents:read", label: "agents:read", desc: "List agents and inspect configurations" },
                    { id: "conversations:read", label: "conversations:read", desc: "Access transcripts and evaluations" },
                    { id: "tools:execute", label: "tools:execute", desc: "Trigger safe tool calls programmatically" },
                  ].map((s) => (
                    <label key={s.id} className="flex items-start gap-2.5 cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={newKeyScopes.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewKeyScopes((prev) => [...prev, s.id]);
                          } else {
                            setNewKeyScopes((prev) => prev.filter((x) => x !== s.id));
                          }
                        }}
                        className="mt-0.5 rounded text-[#0066FF] focus:ring-[#0066FF]"
                      />
                      <div>
                        <span className="text-xs font-semibold text-[#0A0A0C] block">{s.label}</span>
                        <span className="text-[10px] text-neutral-400 block">{s.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="btn-pill-ghost text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newKeyName.trim()}
                  className="btn-pill-blue text-xs py-2 px-5 disabled:opacity-50"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Register Webhook */}
      {showWebhookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-black/[0.08] space-y-5">
            <div>
              <h3 className="text-base font-bold text-[#0A0A0C]">Register Webhook Endpoint</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                We'll dispatch signed HTTP POST requests with conversation payloads to this URL
              </p>
            </div>

            <form onSubmit={handleCreateWebhook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Endpoint URL
                </label>
                <input
                  type="url"
                  placeholder="https://api.yourcompany.com/webhooks/voiceflow"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.08] text-xs font-mono bg-[#F8F9FA] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066FF]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Description (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sync closed support sessions to Zendesk"
                  value={webhookDesc}
                  onChange={(e) => setWebhookDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.08] text-xs bg-[#F8F9FA] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Events to Subscribe
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto p-3 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
                  {ALL_WEBHOOK_EVENTS.map((ev) => (
                    <label key={ev.id} className="flex items-start gap-2.5 cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(ev.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setWebhookEvents((prev) => [...prev, ev.id]);
                          } else {
                            setWebhookEvents((prev) => prev.filter((x) => x !== ev.id));
                          }
                        }}
                        className="mt-0.5 rounded text-[#0066FF] focus:ring-[#0066FF]"
                      />
                      <div>
                        <span className="text-xs font-semibold text-[#0A0A0C] block">{ev.label}</span>
                        <span className="text-[10px] text-neutral-400 block">{ev.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWebhookModal(false)}
                  className="btn-pill-ghost text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!webhookUrl.trim() || webhookEvents.length === 0}
                  className="btn-pill-blue text-xs py-2 px-5 disabled:opacity-50"
                >
                  Register Endpoint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Invite Team Member */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-black/[0.08] space-y-5">
            <div>
              <h3 className="text-base font-bold text-[#0A0A0C]">Invite Team Member</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Collaborate on building, training, and deploying voice agents
              </p>
            </div>

            <form onSubmit={handleInviteMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="colleague@yourcompany.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.08] text-xs bg-[#F8F9FA] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066FF]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Name (optional)
                </label>
                <input
                  type="text"
                  placeholder="Jane Smith"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.08] text-xs bg-[#F8F9FA] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.08] text-xs bg-[#F8F9FA] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066FF]"
                >
                  <option value="admin">Admin — Manage agents & settings</option>
                  <option value="developer">Developer — Configure prompts & API</option>
                  <option value="support">Support — Handle conversations</option>
                  <option value="viewer">Viewer — Read-only analytics</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="btn-pill-ghost text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!inviteEmail.trim()}
                  className="btn-pill-blue text-xs py-2 px-5 disabled:opacity-50"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
