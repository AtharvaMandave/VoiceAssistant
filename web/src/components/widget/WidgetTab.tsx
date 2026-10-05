import { useState } from "react";
import type { Agent, AgentStatus } from "@voiceflow/shared";

interface WidgetTabProps {
  agent: Agent | null;
  agentId: string;
  isNew: boolean;
  status: AgentStatus;
  setStatus: (status: AgentStatus) => void;
  widgetColor: string;
  setWidgetColor: (color: string) => void;
  widgetPosition: string;
  setWidgetPosition: (pos: string) => void;
  widgetTitle: string;
  setWidgetTitle: (title: string) => void;
  widgetGreeting: string;
  setWidgetGreeting: (greeting: string) => void;
  widgetDomains: string;
  setWidgetDomains: (domains: string) => void;
  onSave?: () => Promise<void>;
}

type SnippetType = "html" | "react" | "vue" | "iframe";

export function WidgetTab({
  agent,
  agentId,
  isNew,
  status,
  setStatus,
  widgetColor,
  setWidgetColor,
  widgetPosition,
  setWidgetPosition,
  widgetTitle,
  setWidgetTitle,
  widgetGreeting,
  setWidgetGreeting,
  widgetDomains,
  setWidgetDomains,
  onSave,
}: WidgetTabProps) {
  const [activeSnippet, setActiveSnippet] = useState<SnippetType>("html");
  const [copied, setCopied] = useState(false);
  const [showLivePreviewModal, setShowLivePreviewModal] = useState(false);
  const [activating, setActivating] = useState(false);

  // In local dev, API runs on port 3001
  const apiBaseUrl = window.location.origin.includes("5173") || window.location.origin.includes("3000")
    ? "http://localhost:3001"
    : window.location.origin;

  const resolvedAgentId = isNew ? "YOUR_AGENT_ID" : agentId || agent?.id || "YOUR_AGENT_ID";

  const SNIPPETS: Record<SnippetType, { label: string; code: string; language: string }> = {
    html: {
      label: "HTML / Script",
      language: "html",
      code: `<!-- VoiceFlow AI Voice Assistant Widget -->
<script
  src="${apiBaseUrl}/widget/voiceflow-widget.js"
  data-agent-id="${resolvedAgentId}"
  data-theme="${widgetColor}"
  data-position="${widgetPosition}"
  async>
</script>`,
    },
    react: {
      label: "React / Next.js",
      language: "tsx",
      code: `// components/VoiceAgentWidget.tsx
import { useEffect } from "react";

export function VoiceAgentWidget() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "${apiBaseUrl}/widget/voiceflow-widget.js";
    script.setAttribute("data-agent-id", "${resolvedAgentId}");
    script.setAttribute("data-theme", "${widgetColor}");
    script.setAttribute("data-position", "${widgetPosition}");
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return null;
}`,
    },
    vue: {
      label: "Vue 3",
      language: "vue",
      code: `<script setup>
import { onMounted, onUnmounted } from "vue";

onMounted(() => {
  const s = document.createElement("script");
  s.src = "${apiBaseUrl}/widget/voiceflow-widget.js";
  s.setAttribute("data-agent-id", "${resolvedAgentId}");
  s.setAttribute("data-theme", "${widgetColor}");
  s.setAttribute("data-position", "${widgetPosition}");
  s.async = true;
  document.body.appendChild(s);
});
</script>`,
    },
    iframe: {
      label: "Direct iFrame",
      language: "html",
      code: `<iframe
  src="${apiBaseUrl}/widget/embed.html?agentId=${resolvedAgentId}"
  width="380"
  height="600"
  frameborder="0"
  allow="microphone; autoplay"
  style="border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.1);">
</iframe>`,
    },
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(SNIPPETS[activeSnippet].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openDemoPage = () => {
    window.open(`${apiBaseUrl}/widget/demo.html?agentId=${resolvedAgentId}`, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Status Warning / Success Alert */}
      {status !== "active" ? (
        <div className="p-5 bg-amber-50 border border-amber-200/80 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-lg shrink-0">
              ⚠️
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-900">
                Agent is currently in &ldquo;{status}&rdquo; status
              </h4>
              <p className="text-[11px] text-amber-700 mt-0.5">
                The embedded widget will only respond to external website visitors when this agent is set to <strong>Active</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={activating}
            onClick={async () => {
              setActivating(true);
              setStatus("active");
              if (onSave) {
                try {
                  await onSave();
                } catch (e) {
                  console.error("Failed to activate agent:", e);
                }
              }
              setActivating(false);
            }}
            className="btn-pill-blue text-xs shadow-pill-blue whitespace-nowrap disabled:opacity-50"
          >
            {activating ? "Activating..." : "Activate Agent Now"}
          </button>
        </div>
      ) : (
        <div className="p-5 bg-emerald-50 border border-emerald-200/80 rounded-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg shrink-0">
              🟢
            </div>
            <div>
              <h4 className="text-xs font-bold text-emerald-950">
                Agent is Active &amp; Ready for Website Embedding
              </h4>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                External visitors can talk with this agent via your website widget in real time.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openDemoPage}
            className="hidden sm:inline-flex items-center gap-1.5 btn-pill-secondary text-xs"
          >
            <span>Launch Demo Site</span>
            <span>↗</span>
          </button>
        </div>
      )}

      {/* Main Grid: Settings (Left) + Code & Live Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Visual Customization Form */}
        <div className="lg:col-span-6 fintech-card p-6 sm:p-8 space-y-5">
          <div className="border-b border-black/[0.04] pb-3">
            <h3 className="text-base font-bold text-[#0A0A0C] flex items-center gap-2">
              <span>🎨</span>
              <span>Widget Appearance &amp; Behavior</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Customize the look and feel of the widget to match your website branding.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                Brand Accent Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={widgetColor}
                  onChange={(e) => setWidgetColor(e.target.value)}
                  className="w-10 h-10 rounded-xl border border-black/[0.08] cursor-pointer bg-transparent p-0.5"
                />
                <input
                  type="text"
                  value={widgetColor}
                  onChange={(e) => setWidgetColor(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#F8F9FA] border border-black/[0.08] rounded-xl text-[#0A0A0C] text-xs font-mono focus:outline-none focus:border-[#0066FF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                Screen Position
              </label>
              <div className="flex gap-2">
                {(["bottom-right", "bottom-left"] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setWidgetPosition(pos)}
                    className={`flex-1 py-2 px-3 rounded-full text-xs font-medium capitalize transition-all ${
                      widgetPosition === pos
                        ? "bg-[#0066FF] text-white shadow-pill-blue"
                        : "bg-[#F8F9FA] text-neutral-600 border border-black/[0.06] hover:bg-neutral-100"
                    }`}
                  >
                    {pos.replace("-", " ")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Widget Title Header
            </label>
            <input
              type="text"
              value={widgetTitle}
              onChange={(e) => setWidgetTitle(e.target.value)}
              placeholder="e.g. Acme Support Assistant"
              className="w-full px-3.5 py-2 bg-[#F8F9FA] border border-black/[0.08] rounded-xl text-[#0A0A0C] text-xs focus:outline-none focus:border-[#0066FF] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Greeting / Welcome Message
            </label>
            <textarea
              value={widgetGreeting}
              onChange={(e) => setWidgetGreeting(e.target.value)}
              rows={3}
              placeholder="Hello! How can I help you today?"
              className="w-full px-3.5 py-2 bg-[#F8F9FA] border border-black/[0.08] rounded-xl text-[#0A0A0C] text-xs focus:outline-none focus:border-[#0066FF] transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Allowed Domains (Origin Whitelisting)
            </label>
            <input
              type="text"
              value={widgetDomains}
              onChange={(e) => setWidgetDomains(e.target.value)}
              placeholder="example.com, app.example.com (leave blank to allow all)"
              className="w-full px-3.5 py-2 bg-[#F8F9FA] border border-black/[0.08] rounded-xl text-[#0A0A0C] text-xs focus:outline-none focus:border-[#0066FF] transition-colors"
            />
            <p className="text-[11px] text-neutral-400 mt-1.5">
              Protects your agent from unauthorized embedding. Subdomains and exact domains supported.
            </p>
          </div>

          {/* Quick Test / Live Verification Buttons */}
          <div className="pt-2 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setShowLivePreviewModal(true)}
              className="btn-pill-secondary text-xs flex items-center gap-1.5"
            >
              <span>📱</span>
              <span>Test Widget Simulator</span>
            </button>

            <button
              type="button"
              onClick={openDemoPage}
              className="btn-pill-blue text-xs shadow-pill-blue flex items-center gap-1.5"
            >
              <span>🌐</span>
              <span>Customer Demo Page</span>
              <span>↗</span>
            </button>
          </div>
        </div>

        {/* Right Column: Embed Code Snippet Generator */}
        <div className="lg:col-span-6 fintech-card p-6 sm:p-8 space-y-5">
          <div className="border-b border-black/[0.04] pb-3">
            <h3 className="text-base font-bold text-[#0A0A0C] flex items-center gap-2">
              <span>📋</span>
              <span>Client Integration Code</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Select your framework and paste the snippet into your project.
            </p>
          </div>

          {/* Code Framework Selector Tabs */}
          <div className="flex gap-1 p-1 bg-[#F8F9FA] border border-black/[0.06] rounded-full overflow-x-auto">
            {(["html", "react", "vue", "iframe"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSnippet(key)}
                className={`flex-1 py-1.5 px-3 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  activeSnippet === key
                    ? "bg-[#0A0A0C] text-white shadow-xs"
                    : "text-neutral-600 hover:text-black"
                }`}
              >
                {SNIPPETS[key].label}
              </button>
            ))}
          </div>

          {/* Code Block Container */}
          <div className="relative bg-[#0A0A0C] rounded-2xl overflow-hidden shadow-card border border-black/[0.1]">
            <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-900 border-b border-neutral-800">
              <span className="text-[11px] font-mono text-neutral-400">
                {SNIPPETS[activeSnippet].language}
              </span>
              <button
                type="button"
                onClick={copyToClipboard}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-full transition-colors"
              >
                {copied ? (
                  <>
                    <span className="text-emerald-400">✓</span>
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <span>📋</span>
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-neutral-200 overflow-x-auto leading-relaxed max-h-64">
              <code>{SNIPPETS[activeSnippet].code}</code>
            </pre>
          </div>

          {/* Quick Guide Cards */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Integration Instructions
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-[#F8F9FA] border border-black/[0.04] rounded-2xl space-y-1">
                <span className="font-semibold text-[#0A0A0C]">1. Webflow / WordPress / Shopify</span>
                <p className="text-neutral-500 text-[11px] leading-relaxed">
                  Go to Site Settings &rarr; Custom Code / Footer Scripts and paste the HTML snippet right before &lt;/body&gt;.
                </p>
              </div>
              <div className="p-3.5 bg-[#F8F9FA] border border-black/[0.04] rounded-2xl space-y-1">
                <span className="font-semibold text-[#0A0A0C]">2. Next.js / React Apps</span>
                <p className="text-neutral-500 text-[11px] leading-relaxed">
                  Import the <code>VoiceAgentWidget</code> component inside your root layout or dashboard wrapper.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Interactive Simulator Modal */}
      {showLivePreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white border border-black/[0.08] rounded-3xl shadow-card overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.04]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-[#0A0A0C]">Live Voice Widget Simulator</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLivePreviewModal(false)}
                className="w-7 h-7 rounded-full bg-[#F8F9FA] hover:bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-black text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-hidden flex flex-col items-center">
              <p className="text-[11px] text-neutral-400 mb-3 text-center">
                This simulator runs the exact widget iframe that your callers will interact with. Try speaking or typing!
              </p>
              <div className="w-full flex-1 min-h-[500px] rounded-2xl overflow-hidden border border-black/[0.06] shadow-xs">
                <iframe
                  src={`${apiBaseUrl}/widget/embed.html?agentId=${resolvedAgentId}`}
                  className="w-full h-full min-h-[500px] border-none"
                  allow="microphone; autoplay"
                  title="VoiceFlow Simulator"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
