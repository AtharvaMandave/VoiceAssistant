import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { fetchAgent, createAgent, updateAgent, synthesizeSpeech } from "../lib/api";
import type { Agent, AgentStatus, CreateAgentInput, UpdateAgentInput } from "@voiceflow/shared";
import { PlaygroundView } from "../components/playground/PlaygroundView";
import { KnowledgeTab } from "../components/knowledge/KnowledgeTab";
import { ToolsTab } from "../components/tools/ToolsTab";
import { WidgetTab } from "../components/widget/WidgetTab";

const VOICE_PRESETS = [
  { id: "af_heart", label: "Heart (Female)", engine: "kokoro" },
  { id: "af_nicole", label: "Nicole (Female)", engine: "kokoro" },
  { id: "af_bella", label: "Bella (Female)", engine: "kokoro" },
  { id: "am_adam", label: "Adam (Male)", engine: "kokoro" },
  { id: "am_michael", label: "Michael (Male)", engine: "kokoro" },
  { id: "bf_emma", label: "Emma (British)", engine: "kokoro" },
  { id: "bm_george", label: "George (British)", engine: "kokoro" },
];

const TABS = ["General", "Prompt", "Knowledge", "Tools", "Voice", "Widget", "Playground"] as const;
type TabKey = (typeof TABS)[number];

function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [activeTab, setActiveTab] = useState<TabKey>("General");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<string>("support");
  const [status, setStatus] = useState<AgentStatus>("draft");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful and polite voice AI assistant. Answer customer questions clearly and concisely. If you do not know the answer, politely let the customer know."
  );
  const [businessProfile, setBusinessProfile] = useState("");
  // Voice
  const [voiceEngine, setVoiceEngine] = useState("kokoro");
  const [voiceId, setVoiceId] = useState("af_heart");
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [voicePitch, setVoicePitch] = useState(0);
  const [voiceLanguage, setVoiceLanguage] = useState("en-US");
  // Widget
  const [widgetColor, setWidgetColor] = useState("#0066FF");
  const [widgetPosition, setWidgetPosition] = useState<string>("bottom-right");
  const [widgetTitle, setWidgetTitle] = useState("AI Assistant");
  const [widgetGreeting, setWidgetGreeting] = useState("Hello! How can I help you today?");
  const [widgetDomains, setWidgetDomains] = useState("");
  // LLM
  const [llmProvider, setLlmProvider] = useState("groq");
  const [llmModel, setLlmModel] = useState("groq/compound");
  const [llmTemperature, setLlmTemperature] = useState(0.4);
  const [llmMaxTokens, setLlmMaxTokens] = useState(512);

  // Voice Preview State
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const [previewLatency, setPreviewLatency] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sampleText, setSampleText] = useState("Hello! I am your AI voice assistant. How can I help you today?");
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
    };
  }, []);

  const playVoiceSample = async (presetId: string, customText?: string) => {
    if (playingVoiceId === presetId && activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
      setPlayingVoiceId(null);
      return;
    }

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }

    setLoadingVoiceId(presetId);
    setPreviewError(null);
    setPreviewLatency(null);

    const textToSpeak = customText || sampleText;

    try {
      const startTime = Date.now();
      const res = await synthesizeSpeech(textToSpeak, presetId, voiceSpeed, voicePitch);
      const latency = Date.now() - startTime;
      setPreviewLatency(latency);

      if (res?.audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${res.audioBase64}`);
        activeAudioRef.current = audio;
        setPlayingVoiceId(presetId);
        setLoadingVoiceId(null);

        audio.onended = () => {
          setPlayingVoiceId(null);
          activeAudioRef.current = null;
        };
        audio.onerror = () => {
          setPlayingVoiceId(null);
          activeAudioRef.current = null;
          setPreviewError("Failed to play synthesized audio format");
        };

        await audio.play();
        return;
      }
    } catch (err: any) {
      setPreviewError(err?.message || "Synthesis preview error; using browser fallback");
    }

    // Fallback to browser synthesis
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(textToSpeak);
      u.rate = voiceSpeed;
      u.onend = () => setPlayingVoiceId(null);
      setPlayingVoiceId(presetId);
      setLoadingVoiceId(null);
      window.speechSynthesis.speak(u);
    } else {
      setLoadingVoiceId(null);
    }
  };

  useEffect(() => {
    if (!isNew && id) {
      loadAgentData(id);
    }
  }, [id, isNew]);

  async function loadAgentData(agentId: string) {
    setLoading(true);
    try {
      const data = await fetchAgent(agentId);
      setAgent(data);
      setName(data.name);
      setDescription(data.description || "");
      setTemplate(data.template);
      setStatus(data.status);
      setSystemPrompt(data.systemPrompt);
      setBusinessProfile(data.businessProfile || "");
      if (data.voice) {
        setVoiceEngine(data.voice.engine || "kokoro");
        setVoiceId(data.voice.voiceId || "af_heart");
        setVoiceSpeed(data.voice.speed || 1.0);
        setVoicePitch(data.voice.pitch || 0);
        setVoiceLanguage(data.voice.language || "en-US");
      }
      if (data.widget) {
        setWidgetColor(data.widget.primaryColor || "#0066FF");
        setWidgetPosition(data.widget.position || "bottom-right");
        setWidgetTitle(data.widget.title || "AI Assistant");
        setWidgetGreeting(data.widget.welcomeMessage || "Hello! How can I help you today?");
        setWidgetDomains(data.widget.allowedDomains ? data.widget.allowedDomains.join(", ") : "");
      }
      if (data.llmConfig) {
        setLlmProvider(data.llmConfig.provider || "groq");
        setLlmModel(data.llmConfig.model || "groq/compound");
        setLlmTemperature(data.llmConfig.temperature || 0.4);
        setLlmMaxTokens(data.llmConfig.maxTokens || 512);
      }
    } catch (err) {
      console.error("Failed to load agent:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && TABS.includes(tabParam as TabKey)) {
      setActiveTab(tabParam as TabKey);
    }
  }, [searchParams]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const basePayload: CreateAgentInput = {
        name,
        description,
        template: template as any,
        systemPrompt,
        businessProfile: businessProfile || undefined,
        voice: { engine: voiceEngine as any, voiceId, speed: voiceSpeed, pitch: voicePitch, language: voiceLanguage },
        widget: {
          primaryColor: widgetColor,
          position: widgetPosition as any,
          title: widgetTitle,
          welcomeMessage: widgetGreeting,
          allowedDomains: widgetDomains ? widgetDomains.split(",").map((d) => d.trim()).filter(Boolean) : [],
        },
        llmConfig: { provider: llmProvider as any, model: llmModel, temperature: llmTemperature, maxTokens: llmMaxTokens },
        languages: [voiceLanguage],
      };

      if (isNew) {
        const newAgent = await createAgent(basePayload);
        navigate(`/dashboard/agents/${newAgent.id}`);
      } else {
        const updatePayload: UpdateAgentInput = {
          ...basePayload,
          status,
        };
        const updated = await updateAgent(id!, updatePayload);
        setAgent(updated);
      }
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400 text-xs">
        Loading agent configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-black/[0.05]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard/agents")}
            className="p-1.5 rounded-full text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
          >
            &larr;
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0A0A0C]">
              {isNew ? "Create Agent" : name || "Edit Agent"}
            </h1>
            {!isNew && (
              <p className="text-xs text-neutral-400 capitalize">
                {template} agent &middot; {status} {agent ? `\u00B7 ID: ${agent.id.slice(0, 8)}...` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {!isNew && (
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AgentStatus)}
              className="px-3 py-1.5 bg-white border border-black/[0.08] rounded-full text-xs text-neutral-700 focus:outline-none focus:border-[#0066FF]"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          )}

          {!isNew && (
            <button
              type="button"
              onClick={() => setActiveTab("Playground")}
              className={`btn-pill-secondary text-xs ${
                activeTab === "Playground" ? "bg-blue-50 text-[#0066FF] border-[#0066FF]" : ""
              }`}
            >
              Test Playground
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim() || systemPrompt.length < 10}
            className="btn-pill-blue text-xs shadow-pill-blue disabled:opacity-50"
          >
            {saving ? "Saving..." : isNew ? "Create Agent" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Pill-shaped Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-white border border-black/[0.06] rounded-full w-fit overflow-x-auto shadow-xs">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-xs transition-all ${
              activeTab === tab
                ? "bg-[#0A0A0C] text-white font-medium shadow-xs"
                : "text-neutral-500 hover:text-black font-normal"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Tab Content Card */}
      <div className="fintech-card p-6 sm:p-10">
        {activeTab === "General" && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Agent Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer Support Specialist"
                className="w-full px-4 py-2.5 bg-[#F8F9FA] border border-black/[0.08] rounded-2xl text-xs sm:text-sm text-[#0A0A0C] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this agent do?"
                rows={3}
                className="w-full px-4 py-2.5 bg-[#F8F9FA] border border-black/[0.08] rounded-2xl text-xs sm:text-sm text-[#0A0A0C] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Template</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(["support", "sales", "appointment", "custom"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTemplate(t)}
                    className={`py-3 px-4 rounded-2xl border text-xs font-medium capitalize transition-all ${
                      template === t
                        ? "border-[#0066FF] bg-blue-50 text-[#0066FF] font-semibold"
                        : "border-black/[0.06] bg-[#F8F9FA] text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">LLM Configuration</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-neutral-400 mb-1">Provider</label>
                  <select
                    value={llmProvider}
                    onChange={(e) => setLlmProvider(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F8F9FA] border border-black/[0.08] rounded-xl text-xs text-neutral-700 focus:outline-none focus:border-[#0066FF]"
                  >
                    <option value="groq">Groq</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="local">Local</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-neutral-400 mb-1">Model</label>
                  <input
                    type="text"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F8F9FA] border border-black/[0.08] rounded-xl text-xs text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Prompt" && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">System Prompt *</label>
                <span className="text-[11px] text-neutral-400 font-mono">
                  {systemPrompt.length}/4000
                </span>
              </div>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Define your agent's personality, rules, and knowledge boundaries..."
                rows={10}
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-black/[0.08] rounded-2xl text-xs text-[#0A0A0C] font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Business Profile</label>
              <textarea
                value={businessProfile}
                onChange={(e) => setBusinessProfile(e.target.value)}
                placeholder="Describe your company, products, and customer policies..."
                rows={4}
                className="w-full px-4 py-3 bg-[#F8F9FA] border border-black/[0.08] rounded-2xl text-xs text-[#0A0A0C] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] resize-none"
              />
            </div>
          </div>
        )}

        {activeTab === "Knowledge" && (
          <div>
            {isNew ? (
              <div className="text-center py-12 space-y-3">
                <p className="text-sm font-semibold text-[#0A0A0C]">Save Agent First</p>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  Please create and save your agent before uploading knowledge documents for RAG vector search.
                </p>
                <button
                  type="button"
                  onClick={handleSave}
                  className="btn-pill-blue text-xs"
                >
                  Save Agent &amp; Continue
                </button>
              </div>
            ) : agent ? (
              <KnowledgeTab agentId={agent.id} agentName={agent.name} />
            ) : null}
          </div>
        )}

        {activeTab === "Tools" && (
          <div>
            {isNew ? (
              <div className="text-center py-12 space-y-3">
                <p className="text-sm font-semibold text-[#0A0A0C]">Save Agent First</p>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  Please save your agent before configuring automated tools and business actions.
                </p>
                <button
                  type="button"
                  onClick={handleSave}
                  className="btn-pill-blue text-xs"
                >
                  Save Agent &amp; Continue
                </button>
              </div>
            ) : agent ? (
              <ToolsTab agentId={agent.id} />
            ) : null}
          </div>
        )}

        {activeTab === "Voice" && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
                Select Neural Voice Preset
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {VOICE_PRESETS.map((v) => {
                  const isSelected = voiceId === v.id;
                  const isPlaying = playingVoiceId === v.id;
                  const isLoading = loadingVoiceId === v.id;

                  return (
                    <div
                      key={v.id}
                      onClick={() => {
                        setVoiceId(v.id);
                        setVoiceEngine(v.engine);
                        playVoiceSample(v.id);
                      }}
                      className={`cursor-pointer flex items-center justify-between p-3.5 rounded-2xl border text-xs transition-all ${
                        isSelected
                          ? "border-[#0066FF] bg-blue-50/50 shadow-xs"
                          : "border-black/[0.06] bg-[#F8F9FA] hover:bg-neutral-100"
                      }`}
                    >
                      <div>
                        <p className={`font-semibold ${isSelected ? "text-[#0066FF]" : "text-[#0A0A0C]"}`}>
                          {v.label}
                        </p>
                        <p className="text-[11px] text-neutral-400 font-mono mt-0.5">{v.id}</p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setVoiceId(v.id);
                          setVoiceEngine(v.engine);
                          playVoiceSample(v.id);
                        }}
                        className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                          isPlaying
                            ? "bg-[#0066FF] text-white shadow-pill-blue animate-pulse"
                            : "btn-pill-secondary text-[11px] py-1 px-3"
                        }`}
                      >
                        {isLoading ? "Loading..." : isPlaying ? "Playing" : "Preview"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom sample text preview input & telemetry */}
            <div className="p-4 bg-[#F8F9FA] border border-black/[0.06] rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Audition Sample Text
                </label>
                {previewLatency !== null && (
                  <span className="text-[11px] font-mono font-medium text-[#0066FF] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    TTS Latency: {previewLatency}ms
                  </span>
                )}
              </div>
              <input
                type="text"
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                placeholder="Type sample phrase to preview neural voice..."
                className="w-full px-3.5 py-2 text-xs bg-white border border-black/[0.08] rounded-xl focus:outline-none focus:border-[#0066FF] text-[#0A0A0C]"
              />
              {previewError && (
                <p className="text-[11px] text-[#F43F5E]">{previewError}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                  Speed: {voiceSpeed}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={voiceSpeed}
                  onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
                  className="fintech-slider"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                  Pitch: {voicePitch}
                </label>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                  value={voicePitch}
                  onChange={(e) => setVoicePitch(parseInt(e.target.value))}
                  className="fintech-slider"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "Widget" && (
          <WidgetTab
            agent={agent}
            agentId={id || ""}
            isNew={isNew}
            status={status}
            setStatus={setStatus}
            widgetColor={widgetColor}
            setWidgetColor={setWidgetColor}
            widgetPosition={widgetPosition}
            setWidgetPosition={setWidgetPosition}
            widgetTitle={widgetTitle}
            setWidgetTitle={setWidgetTitle}
            widgetGreeting={widgetGreeting}
            setWidgetGreeting={setWidgetGreeting}
            widgetDomains={widgetDomains}
            setWidgetDomains={setWidgetDomains}
            onSave={handleSave}
          />
        )}

        {activeTab === "Playground" && (
          <div>
            {isNew ? (
              <div className="text-center py-12 space-y-3">
                <p className="text-sm font-semibold text-[#0A0A0C]">Save Agent First</p>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  Please create your agent before opening the interactive voice testing playground.
                </p>
                <button
                  type="button"
                  onClick={handleSave}
                  className="btn-pill-blue text-xs"
                >
                  Save &amp; Test Now
                </button>
              </div>
            ) : agent ? (
              <PlaygroundView agent={agent} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentEditorPage;
