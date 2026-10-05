import { useState, useEffect } from "react";
import type { Document, CreateDocumentInput, FAQItem, KnowledgeQueryResult } from "@voiceflow/shared";
import {
  fetchDocuments,
  createDocument,
  deleteDocument,
  reindexDocument,
  queryKnowledge,
} from "../../lib/api";

interface KnowledgeTabProps {
  agentId: string;
  agentName: string;
}

const PRESET_TEMPLATES = [
  {
    title: "SaaS Refund & Cancellation Policy",
    sourceType: "text" as const,
    content: `# Return and Refund Policy
VoiceFlow provides a 30-day money-back guarantee for all new subscriptions.
If you are not satisfied with the platform within your first 30 days of purchase, you can request a 100% full refund with no questions asked.

## Cancellation Process
- Customers can cancel their monthly or annual subscription anytime from the Billing Settings page.
- Once cancelled, access to paid features continues until the end of the current billing cycle.
- We do not charge cancellation or termination fees.

## Enterprise SLA and Support
- Enterprise accounts feature dedicated account managers, 99.9% uptime SLA, and priority phone/Slack support.
- Support tickets are answered within 1 hour for urgent production incidents.`,
  },
  {
    title: "Healthcare Clinic Hours & FAQ",
    sourceType: "faq" as const,
    faqItems: [
      {
        question: "What are your operating clinic hours?",
        answer:
          "Our clinic is open Monday through Friday from 8:00 AM to 6:00 PM, and Saturdays from 9:00 AM to 1:00 PM. We are closed on Sundays and national holidays.",
      },
      {
        question: "Do you accept walk-in patients?",
        answer:
          "Yes, walk-ins are welcomed for urgent and acute care, though scheduled appointments are given priority. We recommend booking in advance to reduce wait times.",
      },
      {
        question: "What insurance providers do you accept?",
        answer:
          "We accept Blue Cross Blue Shield, Aetna, Cigna, Medicare, and UnitedHealthcare. Please bring your insurance card and photo ID to your appointment.",
      },
      {
        question: "What is your appointment cancellation policy?",
        answer:
          "We kindly request at least 24 hours advance notice if you need to reschedule or cancel your appointment to avoid a $25 late cancellation fee.",
      },
    ],
  },
  {
    title: "E-Commerce Shipping & Delivery Guide",
    sourceType: "text" as const,
    content: `# Shipping & Delivery Guidelines
We offer worldwide shipping across 120+ countries.

## Shipping Speeds & Costs
- Standard Shipping: 3-5 business days ($4.99 or FREE for orders over $50).
- Express Delivery: 1-2 business days ($12.99).
- International Express: 4-7 business days ($19.99).

## Order Tracking
- All orders ship with real-time carrier tracking numbers sent to your email.
- You can track your package directly at track.voiceflow.ai or via our automated voice agent by giving your order ID.

## Damaged or Lost Items
- If an item arrives damaged, report it within 7 days with photos for an immediate free replacement.`,
  },
];

export function KnowledgeTab({ agentId, agentName }: KnowledgeTabProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalTab, setModalTab] = useState<"text" | "faq" | "file" | "url" | "presets">("text");
  const [submitting, setSubmitting] = useState(false);

  // Text / Markdown form
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  // FAQ form
  const [faqTitle, setFaqTitle] = useState("");
  const [faqList, setFaqList] = useState<FAQItem[]>([
    { question: "", answer: "" },
    { question: "", answer: "" },
  ]);

  // URL form
  const [urlTitle, setUrlTitle] = useState("");
  const [urlAddress, setUrlAddress] = useState("");

  // File form
  const [fileTitle, setFileTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [filePayload, setFilePayload] = useState("");

  // Search Tester state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<KnowledgeQueryResult | null>(null);

  useEffect(() => {
    loadDocuments();
  }, [agentId]);

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await fetchDocuments(agentId);
      setDocuments(docs);
    } catch (err: any) {
      console.error("Failed to load documents:", err);
      setError(err?.response?.data?.error?.message || "Failed to load knowledge documents");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (docId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      await deleteDocument(agentId, docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err: any) {
      alert("Failed to delete document: " + (err?.response?.data?.error?.message || err?.message));
    }
  };

  const handleReindex = async (docId: string) => {
    try {
      await reindexDocument(agentId, docId);
      await loadDocuments();
    } catch (err: any) {
      alert("Failed to re-index document: " + (err?.response?.data?.error?.message || err?.message));
    }
  };

  const handleAddFaqRow = () => {
    setFaqList((prev) => [...prev, { question: "", answer: "" }]);
  };

  const handleRemoveFaq = (index: number) => {
    setFaqList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateFaq = (index: number, field: "question" | "answer", val: string) => {
    setFaqList((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: val } : item))
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileSize(file.size);
    if (!fileTitle) {
      setFileTitle(file.name.replace(/\.[^/.]+$/, ""));
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFilePayload(content || "");
    };
    reader.readAsText(file);
  };

  const handleApplyPreset = async (preset: typeof PRESET_TEMPLATES[0]) => {
    setSubmitting(true);
    try {
      let payload: CreateDocumentInput;
      if (preset.sourceType === "text") {
        payload = {
          title: preset.title,
          sourceType: "text",
          content: preset.content,
        };
      } else {
        payload = {
          title: preset.title,
          sourceType: "faq",
          faqItems: preset.faqItems,
        };
      }
      await createDocument(agentId, payload);
      await loadDocuments();
      setShowAddModal(false);
    } catch (err: any) {
      alert("Failed to apply preset: " + (err?.response?.data?.error?.message || err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let payload: CreateDocumentInput;

      if (modalTab === "text") {
        if (!textTitle.trim() || !textContent.trim()) {
          alert("Please fill in both title and content");
          setSubmitting(false);
          return;
        }
        payload = {
          title: textTitle.trim(),
          sourceType: "text",
          content: textContent.trim(),
        };
      } else if (modalTab === "faq") {
        const validFaqs = faqList.filter(
          (f) => f.question.trim().length > 0 && f.answer.trim().length > 0
        );
        if (!faqTitle.trim() || validFaqs.length === 0) {
          alert("Please provide a title and at least one complete Q&A pair");
          setSubmitting(false);
          return;
        }
        payload = {
          title: faqTitle.trim(),
          sourceType: "faq",
          faqItems: validFaqs,
        };
      } else if (modalTab === "url") {
        if (!urlTitle.trim() || !urlAddress.trim()) {
          alert("Please provide both title and webpage URL");
          setSubmitting(false);
          return;
        }
        payload = {
          title: urlTitle.trim(),
          sourceType: "url",
          url: urlAddress.trim(),
        };
      } else {
        if (!fileTitle.trim() || !filePayload.trim()) {
          alert("Please choose a file with readable text content");
          setSubmitting(false);
          return;
        }
        payload = {
          title: fileTitle.trim(),
          sourceType: "file",
          fileData: filePayload,
          fileName,
          fileSize,
        };
      }

      await createDocument(agentId, payload);
      await loadDocuments();
      setShowAddModal(false);

      // Reset fields
      setTextTitle("");
      setTextContent("");
      setFaqTitle("");
      setUrlTitle("");
      setUrlAddress("");
      setFileTitle("");
      setFilePayload("");
      setFileName("");
    } catch (err: any) {
      alert("Failed to create document: " + (err?.response?.data?.error?.message || err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestSearch = async (queryToRun?: string) => {
    const q = (queryToRun || searchQuery).trim();
    if (!q) return;

    setSearching(true);
    try {
      const res = await queryKnowledge(agentId, q, 4, 0.15);
      setSearchResult(res);
    } catch (err: any) {
      console.error("Vector search query failed:", err);
    } finally {
      setSearching(false);
    }
  };

  const totalChunks = documents.reduce((acc, d) => acc + (d.chunkCount || 0), 0);
  const totalTokens = documents.reduce((acc, d) => acc + (d.tokenCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* ─── Header & Knowledge Stats ─── */}
      <div className="fintech-card p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-blue-50 text-[#0066FF] flex items-center justify-center text-sm font-semibold">
                KB
              </span>
              <h2 className="text-xl font-bold tracking-tight text-[#0A0A0C]">
                Knowledge Base &amp; Grounding
              </h2>
            </div>
            <p className="text-xs text-neutral-500 mt-1 max-w-2xl leading-relaxed">
              Equip <strong className="text-neutral-900 font-semibold">{agentName}</strong> with business policies, product specs, and FAQs. The agent retrieves facts in real time to ground every answer with zero hallucination.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-pill-blue text-xs shadow-pill-blue flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Add Knowledge Source</span>
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-black/[0.04]">
          <div className="p-4 bg-[#F8F9FA] rounded-2xl border border-black/[0.04]">
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Documents</div>
            <div className="text-2xl font-bold text-[#0A0A0C] mt-1">{documents.length}</div>
          </div>
          <div className="p-4 bg-[#F8F9FA] rounded-2xl border border-black/[0.04]">
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Vector Chunks</div>
            <div className="text-2xl font-bold text-[#0066FF] mt-1">{totalChunks}</div>
          </div>
          <div className="p-4 bg-[#F8F9FA] rounded-2xl border border-black/[0.04]">
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Indexed Tokens</div>
            <div className="text-2xl font-bold text-neutral-800 mt-1">~{totalTokens.toLocaleString()}</div>
          </div>
          <div className="p-4 bg-[#F8F9FA] rounded-2xl border border-black/[0.04]">
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Vector Search</div>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-semibold text-emerald-600">Indexed &amp; Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Documents List ─── */}
      <div className="fintech-card p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-black/[0.04]">
          <h3 className="text-sm font-bold text-[#0A0A0C] flex items-center gap-2">
            <span>Indexed Knowledge Sources</span>
            <span className="px-2 py-0.5 text-[11px] bg-neutral-100 text-neutral-600 rounded-full font-normal">
              {documents.length}
            </span>
          </h3>

          <button
            onClick={loadDocuments}
            disabled={loading}
            className="text-xs text-neutral-500 hover:text-black transition-colors flex items-center gap-1"
          >
            <span>🔄</span> Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-neutral-400">
            <div className="w-7 h-7 border-2 border-[#0066FF] border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-xs">Loading knowledge sources...</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-[#F43F5E] text-xs">
            {error}
          </div>
        ) : documents.length === 0 ? (
          <div className="py-12 px-4 text-center border border-dashed border-black/[0.08] rounded-2xl bg-[#F8F9FA]">
            <div className="w-12 h-12 mx-auto mb-3 bg-white rounded-2xl shadow-xs flex items-center justify-center text-xl">
              📖
            </div>
            <h4 className="text-sm font-semibold text-[#0A0A0C]">No knowledge documents yet</h4>
            <p className="text-xs text-neutral-400 mt-1 max-w-md mx-auto">
              Ground your agent in company guidelines, return policies, or product specs so it answers questions authoritatively.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-pill-blue text-xs shadow-pill-blue"
              >
                + Add First Document
              </button>
              <button
                onClick={() => {
                  setShowAddModal(true);
                  setModalTab("presets");
                }}
                className="btn-pill-secondary text-xs"
              >
                ⚡ Try Quick Preset
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04]">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#F8F9FA] px-3 rounded-2xl transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white border border-black/[0.06] flex items-center justify-center text-base shadow-xs shrink-0">
                    {doc.sourceType === "faq" && "❓"}
                    {doc.sourceType === "text" && "📄"}
                    {doc.sourceType === "url" && "🌐"}
                    {doc.sourceType === "file" && "📁"}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-semibold text-[#0A0A0C] truncate max-w-md">
                        {doc.title}
                      </h4>

                      {doc.status === "ready" && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Ready
                        </span>
                      )}
                      {doc.status === "processing" && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-100 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          Chunking...
                        </span>
                      )}
                      {doc.status === "failed" && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-red-50 text-[#F43F5E] border border-red-100 rounded-full">
                          Failed
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-1 flex-wrap">
                      <span className="capitalize">{doc.sourceType} source</span>
                      <span>&middot;</span>
                      <span>{doc.chunkCount} {doc.chunkCount === 1 ? "chunk" : "chunks"}</span>
                      <span>&middot;</span>
                      <span>~{doc.tokenCount} tokens</span>
                      <span>&middot;</span>
                      <span>Added {new Date(doc.createdAt).toLocaleDateString()}</span>
                    </div>

                    {doc.errorMessage && (
                      <p className="text-[11px] text-[#F43F5E] mt-1">Error: {doc.errorMessage}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    onClick={() => handleReindex(doc.id)}
                    title="Re-run chunking and embedding"
                    className="btn-pill-secondary text-[11px] py-1 px-3"
                  >
                    <span>🔄</span>
                    <span>Re-index</span>
                  </button>

                  <button
                    onClick={() => handleDelete(doc.id, doc.title)}
                    title="Delete document"
                    className="px-3 py-1 text-[11px] font-medium text-[#F43F5E] hover:bg-red-50 rounded-full border border-red-100 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Interactive Vector Retrieval Tester ─── */}
      <div className="fintech-card p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[#0066FF]">⚡</span>
          <h3 className="text-sm font-bold text-[#0A0A0C]">Live Retrieval Simulator</h3>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Test semantic vector retrieval directly against your agent&apos;s vector store to preview top matching chunks and grounding context before testing voice.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTestSearch()}
            placeholder="e.g. What is your refund policy? / What are clinic hours? / How do I track shipping?"
            className="flex-1 bg-[#F8F9FA] border border-black/[0.08] rounded-full px-4 py-2 text-xs text-[#0A0A0C] placeholder-neutral-400 focus:outline-none focus:border-[#0066FF] transition-colors"
          />
          <button
            onClick={() => handleTestSearch()}
            disabled={searching || !searchQuery.trim()}
            className="btn-pill-blue text-xs shadow-pill-blue flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            {searching ? (
              <span>Searching...</span>
            ) : (
              <>
                <span>🔍</span>
                <span>Query Store</span>
              </>
            )}
          </button>
        </div>

        {/* Quick Test Chips */}
        <div className="flex items-center gap-2 mt-3 flex-wrap text-xs text-neutral-500">
          <span className="text-[11px]">Try query:</span>
          {["refund policy", "clinic hours", "shipping cost", "how to cancel"].map((query) => (
            <button
              key={query}
              onClick={() => {
                setSearchQuery(query);
                handleTestSearch(query);
              }}
              className="px-2.5 py-0.5 bg-[#F8F9FA] hover:bg-neutral-100 text-neutral-600 rounded-full border border-black/[0.06] text-[11px] transition-colors"
            >
              &ldquo;{query}&rdquo;
            </button>
          ))}
        </div>

        {/* Retrieval Results */}
        {searchResult && (
          <div className="mt-6 pt-6 border-t border-black/[0.04] space-y-3">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                Found <strong className="text-[#0A0A0C]">{searchResult.chunks.length}</strong> matching chunks for query:
                <em className="text-[#0066FF] ml-1">&ldquo;{searchResult.query}&rdquo;</em>
              </span>
              <span className="font-mono text-[#0066FF] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 text-[11px]">
                Latency: {searchResult.latencyMs}ms
              </span>
            </div>

            {searchResult.chunks.length === 0 ? (
              <div className="p-4 bg-[#F8F9FA] border border-black/[0.06] rounded-2xl text-center text-xs text-neutral-400">
                No chunks met the similarity threshold (0.15). Try adding more relevant knowledge or changing your query terms.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {searchResult.chunks.map((chunk, idx) => (
                  <div
                    key={chunk.id}
                    className="p-4 bg-[#F8F9FA] border border-black/[0.06] rounded-2xl space-y-2 hover:border-[#0066FF]/40 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="font-semibold text-[#0A0A0C] flex items-center gap-1.5 truncate">
                        <span className="text-[#0066FF]">#{idx + 1}</span>
                        <span className="truncate">{chunk.title}</span>
                      </div>
                      <span className="px-2 py-0.5 font-mono text-[10px] font-semibold bg-blue-50 text-[#0066FF] border border-blue-100 rounded-full shrink-0">
                        {(chunk.score * 100).toFixed(0)}% match
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-600 line-clamp-4 leading-relaxed font-mono bg-white p-2.5 rounded-xl border border-black/[0.04]">
                      {chunk.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Add Knowledge Source Modal ─── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white border border-black/[0.08] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-card space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-black/[0.04] pb-4">
              <div>
                <h3 className="text-base font-bold text-[#0A0A0C] flex items-center gap-2">
                  <span>➕</span> Add Knowledge Source
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Content will be normalized, chunked, and embedded into the vector search engine.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-full bg-[#F8F9FA] hover:bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-black text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex gap-1 p-1 bg-[#F8F9FA] border border-black/[0.06] rounded-full overflow-x-auto">
              {[
                { key: "text", label: "📝 Text" },
                { key: "faq", label: "❓ FAQ" },
                { key: "file", label: "📁 File" },
                { key: "url", label: "🌐 URL" },
                { key: "presets", label: "⚡ Presets" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setModalTab(tab.key as any)}
                  className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-full transition-all ${
                    modalTab === tab.key
                      ? "bg-[#0066FF] text-white shadow-pill-blue"
                      : "text-neutral-600 hover:text-black"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Form Content */}
            {modalTab === "presets" ? (
              <div className="space-y-3 py-2">
                <p className="text-xs text-neutral-500">
                  Select a pre-built industry knowledge template to populate your agent with realistic business grounding:
                </p>

                <div className="space-y-2.5">
                  {PRESET_TEMPLATES.map((preset, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-[#F8F9FA] border border-black/[0.06] rounded-2xl flex items-center justify-between gap-4 hover:border-black/[0.12] transition-colors"
                    >
                      <div>
                        <h4 className="text-xs font-bold text-[#0A0A0C]">{preset.title}</h4>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          {preset.sourceType === "faq"
                            ? `${preset.faqItems?.length} structured Q&A pairs`
                            : "Structured policy document with headings and rules"}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleApplyPreset(preset)}
                        className="btn-pill-blue text-xs shadow-pill-blue shrink-0"
                      >
                        {submitting ? "Adding..." : "Use Template"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateDocument} className="space-y-4">
                {modalTab === "text" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                        Document Title
                      </label>
                      <input
                        type="text"
                        value={textTitle}
                        onChange={(e) => setTextTitle(e.target.value)}
                        placeholder="e.g. Return Policy, Pricing Sheet, Opening Hours"
                        required
                        className="w-full bg-[#F8F9FA] border border-black/[0.08] rounded-xl px-3.5 py-2 text-xs text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                        Content (Markdown / Plain Text)
                      </label>
                      <textarea
                        rows={8}
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        placeholder="Paste policies, documentation, FAQs, or business instructions here..."
                        required
                        className="w-full bg-[#F8F9FA] border border-black/[0.08] rounded-xl p-3.5 text-xs text-[#0A0A0C] font-mono focus:outline-none focus:border-[#0066FF]"
                      />
                    </div>
                  </>
                )}

                {modalTab === "faq" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                        FAQ Collection Title
                      </label>
                      <input
                        type="text"
                        value={faqTitle}
                        onChange={(e) => setFaqTitle(e.target.value)}
                        placeholder="e.g. General Customer FAQ, Delivery Q&A"
                        required
                        className="w-full bg-[#F8F9FA] border border-black/[0.08] rounded-xl px-3.5 py-2 text-xs text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                          Questions &amp; Answers
                        </label>
                        <button
                          type="button"
                          onClick={handleAddFaqRow}
                          className="text-xs text-[#0066FF] hover:underline flex items-center gap-1 font-medium"
                        >
                          <span>+</span> Add Q&amp;A Pair
                        </button>
                      </div>

                      <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                        {faqList.map((faq, i) => (
                          <div
                            key={i}
                            className="p-3 bg-[#F8F9FA] border border-black/[0.06] rounded-2xl space-y-2 relative"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-neutral-500">
                                Question #{i + 1}
                              </span>
                              {faqList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFaq(i)}
                                  className="text-neutral-400 hover:text-[#F43F5E] text-xs"
                                >
                                  ✕ Remove
                                </button>
                              )}
                            </div>

                            <input
                              type="text"
                              value={faq.question}
                              onChange={(e) => handleUpdateFaq(i, "question", e.target.value)}
                              placeholder="e.g. What are your opening hours?"
                              className="w-full bg-white border border-black/[0.08] rounded-xl px-3 py-1.5 text-xs text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
                            />

                            <textarea
                              rows={2}
                              value={faq.answer}
                              onChange={(e) => handleUpdateFaq(i, "answer", e.target.value)}
                              placeholder="e.g. We are open Mon-Fri from 9am to 6pm..."
                              className="w-full bg-white border border-black/[0.08] rounded-xl px-3 py-1.5 text-xs text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {modalTab === "file" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                        Title
                      </label>
                      <input
                        type="text"
                        value={fileTitle}
                        onChange={(e) => setFileTitle(e.target.value)}
                        placeholder="Document title"
                        required
                        className="w-full bg-[#F8F9FA] border border-black/[0.08] rounded-xl px-3.5 py-2 text-xs text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
                      />
                    </div>

                    <div className="border border-dashed border-black/[0.12] rounded-2xl p-6 text-center bg-[#F8F9FA]">
                      <input
                        type="file"
                        id="fileInput"
                        accept=".txt,.md,.json,.csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <label
                        htmlFor="fileInput"
                        className="cursor-pointer flex flex-col items-center justify-center gap-2"
                      >
                        <div className="w-10 h-10 bg-white shadow-xs rounded-xl flex items-center justify-center text-xl">
                          📁
                        </div>
                        <span className="text-xs font-semibold text-[#0066FF]">
                          {fileName ? fileName : "Choose a file or click to browse"}
                        </span>
                        <span className="text-[11px] text-neutral-400">
                          Supports .txt, .md, .json, .csv (up to 5MB)
                        </span>
                      </label>
                    </div>

                    {filePayload && (
                      <div className="text-xs text-neutral-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                        <span className="text-emerald-700 font-semibold">✓ Ready to index:</span>{" "}
                        {fileName} (~{Math.round(fileSize / 1024)} KB)
                      </div>
                    )}
                  </>
                )}

                {modalTab === "url" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                        Document Title
                      </label>
                      <input
                        type="text"
                        value={urlTitle}
                        onChange={(e) => setUrlTitle(e.target.value)}
                        placeholder="e.g. Website Documentation, Product Page"
                        required
                        className="w-full bg-[#F8F9FA] border border-black/[0.08] rounded-xl px-3.5 py-2 text-xs text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                        Web URL
                      </label>
                      <input
                        type="url"
                        value={urlAddress}
                        onChange={(e) => setUrlAddress(e.target.value)}
                        placeholder="https://example.com/policies"
                        required
                        className="w-full bg-[#F8F9FA] border border-black/[0.08] rounded-xl px-3.5 py-2 text-xs text-[#0A0A0C] focus:outline-none focus:border-[#0066FF]"
                      />
                      <p className="text-[11px] text-neutral-400 mt-1">
                        Our ingestion engine will fetch the page, strip HTML scripts/styles, extract plain text, and generate vector chunks.
                      </p>
                    </div>
                  </>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/[0.04]">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="btn-pill-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-pill-blue text-xs shadow-pill-blue flex items-center gap-1.5"
                  >
                    {submitting ? (
                      <span>Indexing Document...</span>
                    ) : (
                      <span>Index &amp; Save Document</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
