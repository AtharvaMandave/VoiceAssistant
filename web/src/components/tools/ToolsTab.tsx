import { useState, useEffect } from "react";
import {
  fetchTools,
  toggleTool,
  seedBuiltInTools,
  deleteTool,
  createTool,
  testTool,
} from "../../lib/api";
import type { Tool, ToolRiskLevel } from "@voiceflow/shared";

interface ToolsTabProps {
  agentId: string;
}

export function ToolsTab({ agentId }: ToolsTabProps) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Test Tool Modal state
  const [testModalTool, setTestModalTool] = useState<Tool | null>(null);
  const [testInputJson, setTestInputJson] = useState("{}");
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    data?: any;
    error?: string;
    durationMs: number;
  } | null>(null);

  // New Custom Tool Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDesc, setNewToolDesc] = useState("");
  const [newToolRisk, setNewToolRisk] = useState<ToolRiskLevel>("low");
  const [newToolParamsJson, setNewToolParamsJson] = useState(
    JSON.stringify(
      {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
      null,
      2
    )
  );
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadTools();
  }, [agentId]);

  async function loadTools() {
    setLoading(true);
    setActionError(null);
    try {
      const data = await fetchTools(agentId);
      setTools(data);
    } catch (err: any) {
      console.error("Failed to load tools:", err);
      setActionError(err.response?.data?.error?.message || "Failed to load tools");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(toolId: string, currentEnabled: boolean) {
    try {
      const updated = await toggleTool(agentId, toolId, !currentEnabled);
      setTools((prev) =>
        prev.map((t) => (t.id === toolId ? { ...t, enabled: updated.enabled } : t))
      );
    } catch (err: any) {
      console.error("Failed to toggle tool:", err);
      setActionError(err.response?.data?.error?.message || "Failed to update tool state");
    }
  }

  async function handleSeedBuiltIns() {
    setSeeding(true);
    setActionError(null);
    try {
      await seedBuiltInTools(agentId);
      await loadTools();
    } catch (err: any) {
      console.error("Failed to seed tools:", err);
      setActionError(err.response?.data?.error?.message || "Failed to seed built-in tools");
    } finally {
      setSeeding(false);
    }
  }

  async function handleDelete(toolId: string) {
    if (!confirm("Are you sure you want to delete this custom tool?")) return;
    try {
      await deleteTool(agentId, toolId);
      setTools((prev) => prev.filter((t) => t.id !== toolId));
    } catch (err: any) {
      console.error("Failed to delete tool:", err);
      setActionError(err.response?.data?.error?.message || "Failed to delete tool");
    }
  }

  function openTestModal(tool: Tool) {
    setTestModalTool(tool);
    setTestResult(null);

    // Build starter mock parameters based on tool's defined schema
    const defaultParams: Record<string, any> = {};
    if (tool.parameters && Array.isArray(tool.parameters)) {
      tool.parameters.forEach((p) => {
        if (p.name === "orderId") defaultParams[p.name] = "ORD-98234";
        else if (p.name === "query") defaultParams[p.name] = "wireless headset";
        else if (p.name === "date") defaultParams[p.name] = new Date().toISOString().split("T")[0];
        else if (p.name === "time") defaultParams[p.name] = "14:00";
        else if (p.name === "clientName") defaultParams[p.name] = "Sarah Connor";
        else if (p.name === "subject") defaultParams[p.name] = "Billing question";
        else if (p.name === "priority") defaultParams[p.name] = "medium";
        else defaultParams[p.name] = p.type === "number" ? 100 : "sample";
      });
    }
    setTestInputJson(JSON.stringify(defaultParams, null, 2));
  }

  async function runToolTest() {
    if (!testModalTool) return;
    setTestRunning(true);
    setTestResult(null);

    let parsed = {};
    try {
      parsed = JSON.parse(testInputJson);
    } catch {
      setTestResult({
        success: false,
        error: "Invalid JSON input parameters",
        durationMs: 0,
      });
      setTestRunning(false);
      return;
    }

    try {
      const res = await testTool(agentId, testModalTool.name, parsed);
      setTestResult(res);
      // Reload tools to update execution metrics
      loadTools();
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.response?.data?.error?.message || err.message,
        durationMs: 0,
      });
    } finally {
      setTestRunning(false);
    }
  }

  async function handleCreateTool(e: React.FormEvent) {
    e.preventDefault();
    if (!newToolName.trim() || !newToolDesc.trim()) return;

    let parsedParams: any = {};
    try {
      parsedParams = JSON.parse(newToolParamsJson);
    } catch {
      alert("Invalid JSON Schema in parameters");
      return;
    }

    let paramsList: any[] = [];
    if (Array.isArray(parsedParams)) {
      paramsList = parsedParams;
    } else if (parsedParams?.properties) {
      const required = Array.isArray(parsedParams.required) ? parsedParams.required : [];
      paramsList = Object.entries(parsedParams.properties).map(([k, v]: [string, any]) => ({
        name: k,
        type: v.type || "string",
        description: v.description || "",
        required: required.includes(k),
      }));
    }

    setCreating(true);
    try {
      const formattedName = newToolName.trim().toLowerCase().replace(/\s+/g, "_");
      await createTool(agentId, {
        name: formattedName,
        displayName: newToolName.trim(),
        description: newToolDesc.trim(),
        riskLevel: newToolRisk,
        parameters: paramsList,
        enabled: true,
      });
      setShowCreateModal(false);
      setNewToolName("");
      setNewToolDesc("");
      await loadTools();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || "Failed to create tool");
    } finally {
      setCreating(false);
    }
  }

  const enabledCount = tools.filter((t) => t.enabled).length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="fintech-card p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-blue-50 text-[#0066FF] flex items-center justify-center text-sm font-semibold">
                ⚙️
              </span>
              <h2 className="text-xl font-bold tracking-tight text-[#0A0A0C]">
                Agent Tools &amp; Actions
              </h2>
            </div>
            <p className="text-xs text-neutral-500 mt-1 max-w-2xl leading-relaxed">
              Empower your voice agent to execute real business workflows like tracking customer orders, searching inventory, scheduling appointments, and opening support tickets.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleSeedBuiltIns}
              disabled={seeding}
              className="btn-pill-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {seeding ? (
                <span>Seeding...</span>
              ) : (
                <>
                  <span className="text-emerald-500">✓</span>
                  <span>Seed 4 Safe Built-Ins</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="btn-pill-blue text-xs shadow-pill-blue flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Custom Tool</span>
            </button>
          </div>
        </div>

        {/* Metric stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-black/[0.04]">
          <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
            <p className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">Registered Tools</p>
            <p className="text-2xl font-bold text-[#0A0A0C] mt-1">{tools.length}</p>
          </div>
          <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
            <p className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">Active (Enabled)</p>
            <p className="text-2xl font-bold text-[#0066FF] mt-1">{enabledCount}</p>
          </div>
          <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
            <p className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">Built-In Actions</p>
            <p className="text-2xl font-bold text-neutral-800 mt-1">{tools.filter((t) => t.isBuiltIn).length}</p>
          </div>
          <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
            <p className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">Total Executions</p>
            <p className="text-2xl font-bold text-neutral-800 mt-1">
              {tools.reduce((acc, t) => acc + (t.executionCount || 0), 0)}
            </p>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-[#F43F5E] text-xs flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-neutral-400 hover:text-black">✕</button>
        </div>
      )}

      {/* Tool List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-neutral-400">
          <div className="w-7 h-7 border-2 border-[#0066FF] border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-xs">Loading agent tools...</p>
        </div>
      ) : tools.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-3xl border border-dashed border-black/[0.08] bg-[#F8F9FA]">
          <div className="w-12 h-12 rounded-2xl bg-white shadow-xs flex items-center justify-center text-xl mx-auto mb-3">
            ⚙️
          </div>
          <h3 className="text-sm font-semibold text-[#0A0A0C]">No tools registered yet</h3>
          <p className="text-xs text-neutral-400 mt-1 max-w-md mx-auto">
            Click &ldquo;Seed 4 Safe Built-Ins&rdquo; to automatically register order lookup, product search, appointment booking, and ticket creation.
          </p>
          <button
            type="button"
            onClick={handleSeedBuiltIns}
            disabled={seeding}
            className="mt-5 btn-pill-blue text-xs shadow-pill-blue"
          >
            Seed 4 Safe Built-Ins Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((tool) => {
            const riskColor =
              tool.riskLevel === "high"
                ? "bg-red-50 text-[#F43F5E] border-red-100"
                : tool.riskLevel === "medium"
                ? "bg-amber-50 text-amber-600 border-amber-100"
                : "bg-emerald-50 text-emerald-600 border-emerald-100";

            return (
              <div
                key={tool.id}
                className={`fintech-card p-5 sm:p-6 flex flex-col justify-between transition-all duration-200 ${
                  tool.enabled ? "border-black/[0.08]" : "opacity-60 bg-[#F8F9FA]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#0A0A0C] tracking-wide">
                        {tool.name}
                      </span>
                      {tool.isBuiltIn ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-50 text-[#0066FF] border border-blue-100">
                          Built-in
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                          Custom
                        </span>
                      )}
                    </div>

                    {/* Enable Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={tool.enabled}
                      onClick={() => handleToggle(tool.id, tool.enabled)}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        tool.enabled ? "bg-[#0066FF]" : "bg-neutral-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                          tool.enabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <p className="text-xs text-neutral-600 mt-2.5 line-clamp-2 leading-relaxed">
                    {tool.description}
                  </p>

                  {/* Badges / Metrics */}
                  <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px]">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wider ${riskColor}`}>
                      {tool.riskLevel} risk
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#F8F9FA] border border-black/[0.06] text-neutral-500 font-mono text-[10px]">
                      {tool.executionCount || 0} calls
                    </span>
                    {tool.lastExecutedAt && (
                      <span className="text-neutral-400 text-[10px]">
                        Active {new Date(tool.lastExecutedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card footer actions */}
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-black/[0.04]">
                  <button
                    type="button"
                    onClick={() => openTestModal(tool)}
                    className="btn-pill-secondary text-[11px] py-1 px-3 flex items-center gap-1.5"
                  >
                    <span>⚡</span>
                    <span>Test Action</span>
                  </button>

                  {!tool.isBuiltIn && (
                    <button
                      type="button"
                      onClick={() => handleDelete(tool.id)}
                      className="text-xs text-[#F43F5E] hover:underline px-2 py-1"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Test Tool Modal ──────────────────────────────────────────────── */}
      {testModalTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-black/[0.08] shadow-card p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.04] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#0A0A0C] flex items-center gap-2">
                  <span>Test Tool:</span>
                  <span className="font-mono text-[#0066FF]">{testModalTool.name}</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">{testModalTool.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setTestModalTool(null)}
                className="w-7 h-7 rounded-full bg-[#F8F9FA] hover:bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-black text-sm"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                Parameters (JSON)
              </label>
              <textarea
                rows={5}
                value={testInputJson}
                onChange={(e) => setTestInputJson(e.target.value)}
                className="w-full font-mono text-xs p-3 rounded-2xl bg-[#F8F9FA] border border-black/[0.08] text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
              />
            </div>

            {testResult && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-mono space-y-1.5 ${
                  testResult.success
                    ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                    : "bg-red-50 border-red-100 text-[#F43F5E]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    {testResult.success ? "✓ Execution Success" : "✕ Execution Error"}
                  </span>
                  <span className="text-[11px] opacity-75">{testResult.durationMs}ms</span>
                </div>
                <pre className="max-h-48 overflow-y-auto text-[11px] whitespace-pre-wrap bg-white p-2.5 rounded-xl border border-black/[0.04]">
                  {JSON.stringify(testResult.success ? testResult.data : testResult.error, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-black/[0.04]">
              <button
                type="button"
                onClick={() => setTestModalTool(null)}
                className="btn-pill-secondary text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={runToolTest}
                disabled={testRunning}
                className="btn-pill-blue text-xs shadow-pill-blue disabled:opacity-50"
              >
                {testRunning ? "Executing..." : "Execute Test"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Custom Tool Modal ────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <form
            onSubmit={handleCreateTool}
            className="w-full max-w-lg rounded-3xl bg-white border border-black/[0.08] shadow-card p-6 sm:p-8 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-black/[0.04] pb-3">
              <h3 className="text-sm font-bold text-[#0A0A0C]">Create Custom Tool</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-7 h-7 rounded-full bg-[#F8F9FA] hover:bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-black text-sm"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">
                Function Name (snake_case)
              </label>
              <input
                type="text"
                required
                placeholder="e.g. check_inventory"
                value={newToolName}
                onChange={(e) => setNewToolName(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl bg-[#F8F9FA] border border-black/[0.08] text-[#0A0A0C] font-mono focus:outline-none focus:border-[#0066FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">
                Description (guides the LLM when to call this tool)
              </label>
              <textarea
                required
                rows={2}
                placeholder="Lookup warehouse inventory level for a specified SKU or product name"
                value={newToolDesc}
                onChange={(e) => setNewToolDesc(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl bg-[#F8F9FA] border border-black/[0.08] text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">
                Risk Level
              </label>
              <select
                value={newToolRisk}
                onChange={(e) => setNewToolRisk(e.target.value as ToolRiskLevel)}
                className="w-full text-xs p-2.5 rounded-xl bg-[#F8F9FA] border border-black/[0.08] text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
              >
                <option value="low">Low (Read-only / safe actions)</option>
                <option value="medium">Medium (Creates or reserves data)</option>
                <option value="high">High (Destructive or financial transactions)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">
                Parameters JSON Schema
              </label>
              <textarea
                rows={4}
                value={newToolParamsJson}
                onChange={(e) => setNewToolParamsJson(e.target.value)}
                className="w-full font-mono text-xs p-2.5 rounded-xl bg-[#F8F9FA] border border-black/[0.08] text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-black/[0.04]">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="btn-pill-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-pill-blue text-xs shadow-pill-blue disabled:opacity-50"
              >
                {creating ? "Creating..." : "Save Tool"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
