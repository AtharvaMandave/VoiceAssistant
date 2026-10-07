import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { synthesizeSpeech } from "../lib/api";
import { useAuthStore } from "../stores/authStore";

// ─── Minimal Audio Spectrum Visualizer Component ─────────────────────────────
function AudioVisualizerCanvas({
  isActive,
  mode,
}: {
  isActive: boolean;
  mode: "idle" | "listening" | "thinking" | "speaking";
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;
    const numBars = 32;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = 3;
      const gap = (width - numBars * barWidth) / (numBars - 1);

      phase += 0.08;

      for (let i = 0; i < numBars; i++) {
        let barHeight = 4;

        if (mode === "speaking") {
          // Dynamic harmonic sound spectrum with electric blue gradient
          const harmonic1 = Math.sin(phase * 1.8 + i * 0.45);
          const harmonic2 = Math.cos(phase * 2.2 - i * 0.35);
          const combined = (harmonic1 + harmonic2 * 0.7) / 1.7;
          const normalized = Math.max(0.1, Math.abs(combined));
          const envelope = Math.sin((i / (numBars - 1)) * Math.PI);
          barHeight = 6 + normalized * (height - 12) * Math.max(0.35, envelope);
        } else if (mode === "listening") {
          // Soft organic ripples
          const wave = Math.sin(phase * 1.4 + i * 0.3);
          barHeight = 6 + Math.abs(wave) * 18;
        } else if (mode === "thinking") {
          const wave = Math.sin(phase * 2.2 + i * 0.5);
          barHeight = 5 + (wave > 0 ? wave * 14 : 2);
        } else {
          // Minimal calm pulse
          const wave = Math.sin(phase * 0.5 + i * 0.2);
          barHeight = 4 + Math.abs(wave) * 5;
        }

        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (mode === "speaking") {
          gradient.addColorStop(0, "#0066FF");
          gradient.addColorStop(1, "#60A5FA");
        } else if (mode === "listening") {
          gradient.addColorStop(0, "#F43F5E");
          gradient.addColorStop(1, "#FB7185");
        } else if (mode === "thinking") {
          gradient.addColorStop(0, "#0066FF");
          gradient.addColorStop(1, "#93C5FD");
        } else {
          gradient.addColorStop(0, "#CBD5E1");
          gradient.addColorStop(1, "#94A3B8");
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isActive, mode]);

  return (
    <canvas
      ref={canvasRef}
      width={220}
      height={40}
      className="w-full max-w-[220px] h-[36px] mx-auto block"
    />
  );
}

export default function LandingPage() {
  const { isAuthenticated, user, initializeAuth, logout } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // ─── Voice Persona State ──────────────────────────────────────────────────
  const [selectedVoice, setSelectedVoice] = useState("af_heart");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [auditionSpeed, setAuditionSpeed] = useState<number>(1.0);
  const [customAuditionText, setCustomAuditionText] = useState("");
  const personaAudioRef = useRef<HTMLAudioElement | null>(null);

  const VOICE_PERSONAS = [
    {
      id: "af_heart",
      name: "Heart",
      gender: "Female",
      accent: "American",
      tone: "Warm & Natural",
      sample: "Hello! I am your AI assistant trained on your business. How can I assist you today?",
    },
    {
      id: "af_nicole",
      name: "Nicole",
      gender: "Female",
      accent: "American",
      tone: "Clear & Executive",
      sample: "Hi there! I can look up your orders, verify inventory, and schedule consultations.",
    },
    {
      id: "am_adam",
      name: "Adam",
      gender: "Male",
      accent: "American",
      tone: "Confident & Direct",
      sample: "Hey! Looking forward to helping you with any product questions or technical workflows right now.",
    },
    {
      id: "bf_emma",
      name: "Emma",
      gender: "Female",
      accent: "British",
      tone: "Refined & Articulate",
      sample: "Good day. It is an absolute pleasure to assist you with our services and documentation.",
    },
  ];

  // ─── Live Demo State ──────────────────────────────────────────────────────
  const [demoState, setDemoState] = useState<
    "idle" | "listening" | "thinking" | "speaking"
  >("idle");
  const [demoCustomInput, setDemoCustomInput] = useState("");
  const [demoUserTurn, setDemoUserTurn] = useState<string | null>(null);
  const [demoAiResponse, setDemoAiResponse] = useState(
    "Hello! I am your autonomous AI voice agent. Ask me anything or select a scenario below."
  );
  const [demoActivePrompt, setDemoActivePrompt] = useState<string | null>(null);
  const [demoLatency, setDemoLatency] = useState({
    stt: 64,
    llm: 142,
    tts: 94,
    total: 300,
  });
  const [demoToolExecution, setDemoToolExecution] = useState<{
    name: string;
    input: string;
    output: string;
    durationMs: number;
  } | null>(null);
  const [demoRagSnippet, setDemoRagSnippet] = useState<{
    doc: string;
    score: number;
    text: string;
  } | null>(null);

  // Microphone recording
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micStatusMsg, setMicStatusMsg] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // ROI Calculator
  const [monthlyCalls, setMonthlyCalls] = useState(4000);

  // Architecture Tabs
  const [activeArchTab, setActiveArchTab] = useState<
    "vad" | "rag" | "tools" | "quality"
  >("vad");

  // Pricing Toggle
  const [annualBilling, setAnnualBilling] = useState(true);

  // FAQ
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [faqCategory, setFaqCategory] = useState<string>("all");

  const demoAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (demoAudioRef.current) {
        demoAudioRef.current.pause();
        demoAudioRef.current = null;
      }
      if (personaAudioRef.current) {
        personaAudioRef.current.pause();
        personaAudioRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const playAudioVoice = useCallback(
    async (text: string, voiceId: string, speed = 1.0) => {
      if (demoAudioRef.current) {
        demoAudioRef.current.pause();
        demoAudioRef.current = null;
      }

      try {
        const res = await synthesizeSpeech(text, voiceId, speed);
        if (res?.audioBase64) {
          const audio = new Audio(`data:audio/mp3;base64,${res.audioBase64}`);
          demoAudioRef.current = audio;
          audio.onended = () => setDemoState("idle");
          audio.onerror = () => {
            playBrowserSpeechFallback(text, () => setDemoState("idle"));
          };
          await audio.play();
          return;
        }
      } catch (err) {
        console.warn("Server TTS fallback to browser speech:", err);
      }

      playBrowserSpeechFallback(text, () => setDemoState("idle"));
    },
    []
  );

  function playBrowserSpeechFallback(text: string, onEnd?: () => void) {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => {
        if (onEnd) onEnd();
      };
      utterance.onerror = () => {
        if (onEnd) onEnd();
      };
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => {
        if (onEnd) onEnd();
      }, 3000);
    }
  }

  // ─── Quick Scenarios ────────────────────────────────────────────────────────
  const INTERACTIVE_PROMPTS = [
    {
      id: "order",
      title: "Check Order #9824",
      tag: "Tool Call",
      query: "Can you check the delivery status of order #9824?",
      response:
        "Order #9824 for Jane Doe was dispatched via Express Courier and is currently out for delivery. Estimated arrival is today at 3:45 PM.",
      tool: {
        name: "check_order",
        input: 'orderId: "ORD-9824"',
        output: "Out for delivery (Carrier: Express, ETA: 3:45 PM)",
        durationMs: 42,
      },
      rag: {
        doc: "Fulfillment_SOP.pdf",
        score: 98.4,
        text: "Orders dispatched before 11:00 AM qualify for same-day localized express delivery with live GPS courier updates.",
      },
      latency: { stt: 62, llm: 138, tts: 90, total: 290 },
    },
    {
      id: "stock",
      title: "Verify Inventory",
      tag: "Catalog",
      query: "Do you have the Wireless Studio Headset in stock right now?",
      response:
        "Yes, we currently have 18 units of the Wireless Studio Headset in stock at our Central Warehouse, available for complimentary priority dispatch.",
      tool: {
        name: "search_product",
        input: 'query: "Studio Headset", category: "Audio"',
        output: "Found: 18 units available at $129.00 (SKU-9921)",
        durationMs: 36,
      },
      rag: {
        doc: "Product_Catalog.csv",
        score: 96.2,
        text: "SKU-9921: Wireless Studio Headset with Active Noise Cancellation. Warehouse Stock: Active.",
      },
      latency: { stt: 66, llm: 145, tts: 92, total: 303 },
    },
    {
      id: "booking",
      title: "Book Consultation",
      tag: "Calendar",
      query: "I'd like to book a 30-minute product consultation for tomorrow afternoon.",
      response:
        "I've reserved a 30-minute consultation for tomorrow at 2:00 PM with our senior specialist. A confirmation calendar invite has been sent to your email.",
      tool: {
        name: "book_appointment",
        input: 'date: "Tomorrow", time: "14:00", service: "Consultation"',
        output: "Confirmed (ID: APT-4412, Calendar Invite Dispatched)",
        durationMs: 48,
      },
      rag: {
        doc: "Scheduling_Rules.txt",
        score: 95.1,
        text: "Consultation slots are available Monday through Friday between 9:00 AM and 5:00 PM in 30-minute blocks.",
      },
      latency: { stt: 70, llm: 160, tts: 98, total: 328 },
    },
    {
      id: "policy",
      title: "Refund Policy",
      tag: "Vector RAG",
      query: "What is your return policy for items opened within 30 days?",
      response:
        "We offer a 30-day hassle-free return window. If the packaging has been opened, items in original condition qualify for a full store credit or refund with your receipt.",
      tool: null,
      rag: {
        doc: "Customer_Returns_Master.pdf",
        score: 99.1,
        text: "Customers may initiate a return within 30 days of receiving their shipment for full store credit or original payment method refund.",
      },
      latency: { stt: 60, llm: 140, tts: 88, total: 288 },
    },
  ];

  async function handleTriggerPrompt(item: (typeof INTERACTIVE_PROMPTS)[0]) {
    setDemoActivePrompt(item.id);
    setDemoState("listening");
    setDemoUserTurn(item.query);
    setDemoCustomInput(item.query);
    setDemoToolExecution(null);
    setDemoRagSnippet(null);

    setTimeout(() => {
      setDemoState("thinking");
      setDemoRagSnippet(item.rag);
      if (item.tool) setDemoToolExecution(item.tool);

      setTimeout(async () => {
        setDemoState("speaking");
        setDemoAiResponse(item.response);
        setDemoLatency(item.latency);
        await playAudioVoice(item.response, selectedVoice);
      }, 500);
    }, 450);
  }

  async function handleCustomQuestionSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const query = demoCustomInput.trim();
    if (!query) return;

    setDemoActivePrompt(null);
    setDemoState("listening");
    setDemoUserTurn(query);
    setDemoToolExecution(null);
    setDemoRagSnippet(null);

    const lower = query.toLowerCase();
    let responseText = "";
    let toolResult: any = null;
    let ragResult: any = null;

    if (lower.includes("order") || lower.includes("track") || lower.includes("delivery")) {
      responseText =
        "Your order #9824 is currently in transit with Express Courier, on schedule for delivery today before 4:00 PM.";
      toolResult = {
        name: "check_order",
        input: `orderId: "ORD-9824"`,
        output: "Status: In Transit (Carrier: Express, ETA: Today 4:00 PM)",
        durationMs: 44,
      };
      ragResult = {
        doc: "Fulfillment_SOP.pdf",
        score: 97.5,
        text: "Orders dispatched before 11:00 AM qualify for same-day localized express delivery with tracking updates.",
      };
    } else if (lower.includes("return") || lower.includes("refund")) {
      responseText =
        "Our return policy allows 30 days from delivery. Unopened and opened items in original condition qualify for a full refund or direct exchange.";
      ragResult = {
        doc: "Returns_Master.pdf",
        score: 98.6,
        text: "Customers may initiate a return within 30 days of receiving their shipment for full refund or store credit.",
      };
    } else if (lower.includes("book") || lower.includes("appointment") || lower.includes("schedule")) {
      responseText =
        "I've reserved a 30-minute consultation slot for tomorrow at 2:00 PM. A calendar confirmation has been sent to your email.";
      toolResult = {
        name: "book_appointment",
        input: 'date: "Tomorrow", time: "14:00", service: "Consultation"',
        output: "Confirmed (ID: APT-8821, Calendar Invite Sent)",
        durationMs: 50,
      };
      ragResult = {
        doc: "Scheduling_Rules.txt",
        score: 94.8,
        text: "Consultation slots are available Monday through Friday in 30-minute increments.",
      };
    } else {
      responseText =
        "Based on your verified documents, our autonomous voice system operates 24/7 with zero hallucinations and sub-400ms latency. How else may I assist you?";
      ragResult = {
        doc: "Knowledge_Base.pdf",
        score: 95.8,
        text: "VoiceFlow AI provides enterprise-grade autonomous voice capabilities with verified data grounding.",
      };
    }

    setTimeout(() => {
      setDemoState("thinking");
      setDemoRagSnippet(ragResult);
      if (toolResult) setDemoToolExecution(toolResult);

      setTimeout(async () => {
        setDemoState("speaking");
        setDemoAiResponse(responseText);
        setDemoLatency({
          stt: Math.floor(58 + Math.random() * 15),
          llm: Math.floor(130 + Math.random() * 25),
          tts: Math.floor(85 + Math.random() * 20),
          total: Math.floor(280 + Math.random() * 35),
        });
        await playAudioVoice(responseText, selectedVoice);
      }, 480);
    }, 400);
  }

  function handleToggleMicrophone() {
    if (isRecordingMic) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsRecordingMic(false);
      setMicStatusMsg(null);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMicStatusMsg("Speech recognition is not supported in this browser. Please type below.");
      setTimeout(() => setMicStatusMsg(null), 3500);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsRecordingMic(true);
        setDemoState("listening");
        setMicStatusMsg("Listening... speak your question.");
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((res: any) => res[0].transcript)
          .join("");
        setDemoCustomInput(transcript);
        if (event.results[0].isFinal) {
          setIsRecordingMic(false);
          setMicStatusMsg(null);
          setDemoUserTurn(transcript);
          setTimeout(() => {
            handleCustomQuestionSubmit();
          }, 250);
        }
      };

      recognition.onerror = () => {
        setIsRecordingMic(false);
        setMicStatusMsg("Microphone access unavailable. You can type below.");
        setTimeout(() => setMicStatusMsg(null), 3000);
      };

      recognition.onend = () => {
        setIsRecordingMic(false);
      };

      recognition.start();
    } catch {
      setIsRecordingMic(false);
      setMicStatusMsg("Microphone unavailable.");
      setTimeout(() => setMicStatusMsg(null), 3000);
    }
  }

  function handleEndDemo() {
    if (demoAudioRef.current) {
      demoAudioRef.current.pause();
      demoAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setDemoState("idle");
    setDemoActivePrompt(null);
    setDemoUserTurn(null);
    setDemoAiResponse("Hello! I am your autonomous AI voice agent. Ask me anything or select a scenario below.");
    setDemoToolExecution(null);
    setDemoRagSnippet(null);
  }

  async function handleAuditionPersona(persona: (typeof VOICE_PERSONAS)[0]) {
    setSelectedVoice(persona.id);
    if (playingVoiceId === persona.id) {
      if (personaAudioRef.current) {
        personaAudioRef.current.pause();
        personaAudioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setPlayingVoiceId(null);
      return;
    }

    if (personaAudioRef.current) {
      personaAudioRef.current.pause();
      personaAudioRef.current = null;
    }

    setPlayingVoiceId(persona.id);
    const sampleText = customAuditionText.trim() || persona.sample;

    try {
      const res = await synthesizeSpeech(sampleText, persona.id, auditionSpeed);
      if (res?.audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${res.audioBase64}`);
        personaAudioRef.current = audio;
        audio.onended = () => setPlayingVoiceId(null);
        audio.onerror = () => {
          playBrowserSpeechFallback(sampleText, () => setPlayingVoiceId(null));
        };
        await audio.play();
        return;
      }
    } catch {
      // ignore
    }

    playBrowserSpeechFallback(sampleText, () => setPlayingVoiceId(null));
  }

  const roiData = useMemo(() => {
    const humanCostPerCall = 3.5;
    const aiCostPerCall = 0.12;
    const humanTotal = Math.round(monthlyCalls * humanCostPerCall);
    const aiTotal = Math.round(monthlyCalls * aiCostPerCall);
    const monthlySavings = humanTotal - aiTotal;
    const annualSavings = monthlySavings * 12;
    const percentReduction = Math.round(((humanTotal - aiTotal) / humanTotal) * 100);

    return {
      humanTotal,
      aiTotal,
      monthlySavings,
      annualSavings,
      percentReduction,
      hoursSaved: Math.round((monthlyCalls * 6.5) / 60),
    };
  }, [monthlyCalls]);

  const FAQS = [
    {
      category: "voice",
      q: "How fast is the voice response in production?",
      a: "VoiceFlow achieves sub-400ms first-audio latency. By streaming Silero VAD, streaming speech recognition, fast LLM reasoning, and chunked neural TTS, callers hear natural conversational speech with zero awkward pauses.",
    },
    {
      category: "rag",
      q: "How does VoiceFlow AI train on business documents?",
      a: "Simply upload your PDFs, DOCX files, raw text, or provide your website URL. VoiceFlow chunks the content into dense vector embeddings stored in MongoDB Atlas Vector Search. Every voice answer is grounded in verified documentation with zero hallucinations.",
    },
    {
      category: "tools",
      q: "Can the voice agent actually perform actions like looking up orders?",
      a: "Yes. Unlike simple FAQ bots, VoiceFlow features an autonomous Tool Calling engine. Your agent can execute safe actions like check_order, search_product, book_appointment, and create_ticket, or trigger custom REST API webhooks.",
    },
    {
      category: "security",
      q: "What happens if a caller gets frustrated or asks for a human?",
      a: "VoiceFlow continuously scores customer sentiment. If repeated frustration triggers or explicit requests for a representative occur, the session is tagged as escalated in real-time, routing the caller and full transcript to your human team.",
    },
    {
      category: "voice",
      q: "Can callers interrupt the agent while it is speaking?",
      a: "Yes, fully supported. Our streaming architecture features instantaneous barge-in detection. The moment the caller speaks, the server halts TTS audio streaming in under 60ms and processes the interruption.",
    },
  ];

  const filteredFaqs = useMemo(() => {
    if (faqCategory === "all") return FAQS;
    return FAQS.filter((f) => f.category === faqCategory);
  }, [faqCategory]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#0A0A0C] font-sans antialiased selection:bg-[#0066FF] selection:text-white">
      {/* ─── Ultra-Minimal Navigation ────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#F8F9FA]/90 backdrop-blur-md border-b border-black/[0.04]">
        <div className="max-w-7xl mx-auto px-6 h-16 sm:h-20 flex items-center justify-between">
          {/* Minimal Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-[#0A0A0C] flex items-center justify-center text-white font-medium shadow-xs group-hover:scale-105 transition-transform">
              <span className="text-sm font-semibold tracking-tighter">V</span>
            </div>
            <span className="text-base font-semibold tracking-tight text-[#0A0A0C]">
              VoiceFlow
            </span>
          </Link>

          {/* Thin, Minimalist Navigation Links with Lots of Whitespace */}
          <nav className="hidden md:flex items-center gap-9 text-xs font-normal text-neutral-500 tracking-normal">
            <a href="#demo" className="hover:text-black transition-colors">
              Platform
            </a>
            <a href="#architecture" className="hover:text-black transition-colors">
              Architecture
            </a>
            <a href="#voices" className="hover:text-black transition-colors">
              Voices
            </a>
            <a href="#calculator" className="hover:text-black transition-colors">
              ROI
            </a>
            <a href="#pricing" className="hover:text-black transition-colors">
              Pricing
            </a>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  className="btn-pill-blue flex items-center gap-2 py-2 px-4 text-xs font-semibold shadow-pill-blue hover:shadow-pill-blue-lg"
                >
                  <span>Dashboard</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
                <div className="flex items-center gap-2 pl-2 border-l border-neutral-200">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-[#0066FF] flex items-center justify-center text-xs font-semibold overflow-hidden border border-blue-200">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name || "User"} className="w-full h-full object-cover" />
                    ) : (
                      (user?.name?.[0] || user?.email?.[0] || "U").toUpperCase()
                    )}
                  </div>
                  <button
                    onClick={() => logout()}
                    className="text-xs text-neutral-500 hover:text-red-600 transition-colors px-1 py-1"
                    title="Sign out"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-xs font-medium text-neutral-600 hover:text-black px-3 py-1.5 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="btn-pill-blue"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ─── Hero Section with Large Rounded White Card & 3D Blobs ───────────── */}
      <section className="relative pt-12 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto overflow-visible">
        {/* Soft 3D Abstract Floating Blobs in Background */}
        <div className="absolute -top-12 -left-10 w-44 h-44 glossy-3d-blob-blue opacity-70 animate-float pointer-events-none -z-10" />
        <div className="absolute top-40 -right-8 w-36 h-36 glossy-3d-blob-pink opacity-60 animate-float-slow pointer-events-none -z-10" />
        <div className="absolute top-1/2 left-1/12 w-20 h-20 glossy-3d-sphere-white opacity-80 animate-float-reverse pointer-events-none -z-10" />

        {/* Hero Header Content */}
        <div className="max-w-3xl mx-auto text-center space-y-5 pt-4 pb-12">
          {/* Subtle Pill Tag */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-black/[0.06] shadow-xs text-[11px] font-medium text-neutral-600">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0066FF] animate-pulse" />
            <span>Autonomous Voice Infrastructure &middot; Sub-400ms Latency</span>
          </div>

          {/* Large Bold Black Headline */}
          <h1 className="text-4xl sm:text-6xl md:text-[68px] font-bold tracking-tight text-[#0A0A0C] leading-[1.04]">
            AI Voice Agents for Modern Business.
          </h1>

          {/* Small Subtle Gray Supporting Text */}
          <p className="max-w-xl mx-auto text-sm sm:text-base text-neutral-500 font-normal leading-relaxed">
            Build, ground with your private documentation, connect business tools, and deploy natural-sounding voice assistants that talk to customers 24/7.
          </p>

          {/* Minimal Pill Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
            <Link
              to={isAuthenticated ? "/dashboard" : "/register"}
              className="btn-pill-blue px-6 py-3 text-sm shadow-pill-blue hover:shadow-pill-blue-lg flex items-center gap-2"
            >
              <span>{isAuthenticated ? "Go to Dashboard" : "Start Free Trial"}</span>
              {isAuthenticated && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              )}
            </Link>
            <a
              href="#demo"
              className="btn-pill-secondary px-6 py-3 text-sm"
            >
              Explore Live Canvas
            </a>
          </div>
        </div>

        {/* ─── Main Container: Large White Rounded Rectangle with Soft Shadow ─── */}
        <div id="demo" className="fintech-card p-6 sm:p-10 md:p-14 relative mt-2">
          {/* Card Top Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 mb-8 border-b border-black/[0.05]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0066FF] text-sm">
                🎙️
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#0A0A0C] tracking-tight">
                  Voice Session Sandbox
                </h3>
                <p className="text-xs text-neutral-400">
                  Streaming WebSockets &middot; RAG Grounding &middot; Safe Tool Execution
                </p>
              </div>
            </div>

            {/* State Pill */}
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium tracking-tight flex items-center gap-1.5 transition-all ${
                  demoState === "listening"
                    ? "bg-rose-50 text-[#F43F5E] border border-rose-200"
                    : demoState === "thinking"
                    ? "bg-blue-50 text-[#0066FF] border border-blue-200 animate-pulse"
                    : demoState === "speaking"
                    ? "bg-blue-50 text-[#0066FF] border border-blue-200"
                    : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    demoState === "listening"
                      ? "bg-[#F43F5E] animate-ping"
                      : demoState === "thinking"
                      ? "bg-[#0066FF]"
                      : demoState === "speaking"
                      ? "bg-[#0066FF] animate-bounce"
                      : "bg-neutral-400"
                  }`}
                />
                <span>
                  {demoState === "idle"
                    ? "Ready"
                    : demoState === "listening"
                    ? "Listening..."
                    : demoState === "thinking"
                    ? "Evaluating..."
                    : "Speaking..."}
                </span>
              </span>

              {demoState !== "idle" && (
                <button
                  type="button"
                  onClick={handleEndDemo}
                  className="px-2.5 py-1 rounded-full text-xs font-medium text-neutral-500 hover:text-black bg-neutral-100 border border-neutral-200"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* 3-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            {/* Left Column: Caller Turn & Tool Execution */}
            <div className="space-y-4 order-2 lg:order-1">
              {/* Telemetry Box 1: Caller Turn */}
              <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-neutral-500">Caller Audio In</span>
                  <span className="font-mono text-[10px] text-neutral-400">
                    STT {demoLatency.stt}ms
                  </span>
                </div>
                <p className="text-sm font-medium text-[#0A0A0C] mt-2 leading-snug">
                  {demoUserTurn ? `"${demoUserTurn}"` : `"Can you track package #9824?"`}
                </p>
                <div className="text-[11px] text-neutral-400 mt-2 pt-2 border-t border-black/[0.04] flex items-center justify-between font-mono">
                  <span>Silero VAD Filtered</span>
                  <span className="text-[#0066FF] font-medium">Opus 24kHz</span>
                </div>
              </div>

              {/* Telemetry Box 2: Tool Executed */}
              <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-neutral-500">Tool Execution</span>
                  <span className="font-mono text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    {demoToolExecution ? `✓ ${demoToolExecution.durationMs}ms` : "Active"}
                  </span>
                </div>
                <div className="mt-2 font-mono text-xs text-[#0A0A0C] bg-white p-2.5 rounded-xl border border-black/[0.05] overflow-x-auto">
                  {demoToolExecution ? (
                    <div>
                      <span className="text-[#0066FF]">{demoToolExecution.name}</span>({demoToolExecution.input})
                    </div>
                  ) : (
                    <div>
                      <span className="text-[#0066FF]">check_order</span>(&quot;ORD-9824&quot;)
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400 mt-2 flex items-center justify-between">
                  <span>Result:</span>
                  <span className="text-neutral-700 font-mono text-[10px] truncate max-w-[150px]">
                    {demoToolExecution ? demoToolExecution.output : "Out for delivery"}
                  </span>
                </p>
              </div>
            </div>

            {/* Center Column: Glossy Futuristic Voice Orb & Waveform */}
            <div className="flex flex-col items-center justify-center p-3 text-center order-1 lg:order-2">
              <div className="relative flex items-center justify-center w-40 h-40 sm:w-48 sm:h-48 rounded-full p-2">
                {/* 3D Glossy Light Halo */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-b from-blue-100/60 to-slate-100/40 blur-xl pointer-events-none" />

                {/* Concentric floating ring */}
                <div
                  className={`absolute inset-2 rounded-full border border-blue-200/80 ${
                    demoState === "speaking" ? "animate-spin" : "animate-pulse-subtle"
                  }`}
                  style={{ animationDuration: "10s" }}
                />

                {/* Core White Glossy Sphere with Subtle Shadow */}
                <div className="w-full h-full rounded-full bg-white border border-black/[0.06] shadow-card flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="w-8 h-8 rounded-full bg-blue-50 text-[#0066FF] flex items-center justify-center mb-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a4 4 0 00-4 4v4a4 4 0 008 0V6a4 4 0 00-4-4zm6 8a6 6 0 11-12 0v-.5a.75.75 0 011.5 0V10a4.5 4.5 0 109 0v-.5a.75.75 0 011.5 0V10z" />
                    </svg>
                  </div>

                  <span className="text-[9px] font-mono font-medium uppercase tracking-widest text-neutral-400">
                    VOICE AI
                  </span>

                  {/* Clean Audio Visualizer Canvas */}
                  <div className="mt-1 w-full flex justify-center px-4">
                    <AudioVisualizerCanvas
                      isActive={demoState === "speaking"}
                      mode={demoState}
                    />
                  </div>
                </div>
              </div>

              {/* Agent Speech Quote */}
              <div className="mt-5 max-w-sm">
                <p className="text-sm sm:text-base font-medium text-[#0A0A0C] leading-snug">
                  &ldquo;{demoAiResponse}&rdquo;
                </p>
                <p className="text-[11px] text-neutral-400 mt-1 font-mono">
                  Kokoro 24kHz &middot; Sub-400ms First-Audio
                </p>
              </div>
            </div>

            {/* Right Column: RAG Grounding & Turn Latency Breakdown */}
            <div className="space-y-4 order-3">
              {/* Telemetry Box 3: Document Grounding */}
              <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-neutral-500">Vector Grounding</span>
                  <span className="font-mono text-[10px] text-[#0066FF] bg-blue-50 px-1.5 py-0.5 rounded">
                    {demoRagSnippet ? `${demoRagSnippet.score}%` : "98.6%"} Match
                  </span>
                </div>
                <div className="mt-2 text-xs text-[#0A0A0C]">
                  <span className="text-neutral-400 text-[11px]">Source Document:</span>
                  <p className="font-mono text-xs font-medium text-neutral-700 truncate mt-0.5">
                    {demoRagSnippet ? demoRagSnippet.doc : "Returns_Master.pdf"}
                  </p>
                </div>
                <p className="text-[11px] text-neutral-500 mt-2 border-t border-black/[0.04] pt-2 line-clamp-2 leading-relaxed">
                  {demoRagSnippet
                    ? demoRagSnippet.text
                    : "1,248 semantic chunks indexed with MongoDB Atlas Vector Search."}
                </p>
              </div>

              {/* Telemetry Box 4: Latency Breakdown */}
              <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-neutral-500">Turn Latency</span>
                  <span className="font-mono text-xs font-semibold text-[#0066FF]">
                    {demoLatency.total}ms Total
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono">
                  <div className="bg-white p-1.5 rounded-xl border border-black/[0.04]">
                    <span className="text-neutral-400 block">STT</span>
                    <strong className="text-neutral-800">{demoLatency.stt}ms</strong>
                  </div>
                  <div className="bg-white p-1.5 rounded-xl border border-black/[0.04]">
                    <span className="text-neutral-400 block">LLM</span>
                    <strong className="text-neutral-800">{demoLatency.llm}ms</strong>
                  </div>
                  <div className="bg-white p-1.5 rounded-xl border border-black/[0.04]">
                    <span className="text-neutral-400 block">TTS</span>
                    <strong className="text-neutral-800">{demoLatency.tts}ms</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Input Bar */}
          <div className="mt-8 pt-6 border-t border-black/[0.05]">
            <form onSubmit={handleCustomQuestionSubmit} className="mb-4">
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative w-full">
                  <input
                    type="text"
                    value={demoCustomInput}
                    onChange={(e) => setDemoCustomInput(e.target.value)}
                    placeholder="Type any inquiry (e.g. 'Can I return an opened item?' or 'Track package #9824')..."
                    className="w-full pl-5 pr-28 py-3 rounded-full bg-[#F8F9FA] border border-black/[0.06] text-xs sm:text-sm text-[#0A0A0C] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleToggleMicrophone}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all ${
                      isRecordingMic
                        ? "bg-[#F43F5E] text-white animate-pulse"
                        : "bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-300"
                    }`}
                  >
                    <span>{isRecordingMic ? "Speaking..." : "🎙️ Speak"}</span>
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full sm:w-auto btn-pill-blue whitespace-nowrap"
                >
                  Send Query &rarr;
                </button>
              </div>

              {micStatusMsg && (
                <p className="text-xs text-neutral-500 mt-2 pl-4">
                  {micStatusMsg}
                </p>
              )}
            </form>

            {/* Quick Scenario Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-medium text-neutral-400 mr-1">
                Preset scenarios:
              </span>
              {INTERACTIVE_PROMPTS.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => handleTriggerPrompt(prompt)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    demoActivePrompt === prompt.id
                      ? "bg-blue-50 border-[#0066FF] text-[#0066FF]"
                      : "bg-[#F8F9FA] hover:bg-white border-black/[0.05] text-neutral-700"
                  }`}
                >
                  <span>{prompt.title}</span>
                  <span className="ml-1.5 text-[9px] uppercase tracking-wider text-neutral-400 font-mono">
                    {prompt.tag}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Minimalist Brand Logos Bar ──────────────────────────────────────── */}
      <section className="py-12 px-6 border-y border-black/[0.04]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <span className="text-xs font-medium text-neutral-400 tracking-tight">
            TRUSTED BY MODERN COMMERCE &amp; SAAS TEAMS
          </span>

          <div className="flex flex-wrap items-center gap-8 sm:gap-12 opacity-40">
            <span className="font-semibold text-sm tracking-tight text-neutral-800">ApexCare</span>
            <span className="font-semibold text-sm tracking-tight text-neutral-800">HyperScale</span>
            <span className="font-semibold text-sm tracking-tight text-neutral-800">Lumina Logix</span>
            <span className="font-semibold text-sm tracking-tight text-neutral-800">Meridian</span>
            <span className="font-semibold text-sm tracking-tight text-neutral-800">Veloce</span>
          </div>
        </div>
      </section>

      {/* ─── Architecture Deep Dive ──────────────────────────────────────────── */}
      <section id="architecture" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="max-w-2xl mx-auto text-center space-y-3 mb-14">
          <span className="text-xs font-medium uppercase tracking-widest text-[#0066FF]">
            Platform Architecture
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0A0A0C]">
            Engineered for Sub-400ms Voice Conversations.
          </h2>
          <p className="text-sm text-neutral-500 leading-relaxed">
            A pipelined architecture integrating streaming speech recognition, dense vector retrieval, and autonomous tool calling.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {[
            { id: "vad", label: "01. Streaming Audio & VAD" },
            { id: "rag", label: "02. Dense Vector RAG" },
            { id: "tools", label: "03. Tool Calling Engine" },
            { id: "quality", label: "04. Quality & Escalation" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveArchTab(tab.id as any)}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${
                activeArchTab === tab.id
                  ? "bg-[#0A0A0C] text-white shadow-xs"
                  : "bg-white text-neutral-600 hover:text-black border border-black/[0.06]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Large White Rounded Container */}
        <div className="fintech-card p-8 sm:p-12">
          {activeArchTab === "vad" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div className="space-y-4">
                <span className="text-xs font-mono text-[#0066FF] font-medium uppercase">
                  Silero VAD &middot; Whisper ASR &middot; Kokoro TTS
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-[#0A0A0C] tracking-tight">
                  Sub-400ms Streaming &amp; Instant Barge-In
                </h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Audio frames stream over low-overhead WebSockets at 24kHz. Silero voice activity detection detects caller pauses instantly while sentence-level chunking feeds Kokoro TTS in parallel.
                </p>
                <div className="space-y-2 pt-2 text-xs text-neutral-700">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0066FF]" />
                    <span><strong>Barge-in Interrupt:</strong> Server audio halts within 60ms when the user speaks.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0066FF]" />
                    <span><strong>Opus Encoding:</strong> Optimized for crystal-clear audio even on mobile connections.</span>
                  </div>
                </div>
              </div>

              {/* Latency Pipeline Visual */}
              <div className="p-6 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-neutral-400 pb-2 border-b border-black/[0.05]">
                  <span>Pipeline Component</span>
                  <span>Average Latency</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-black/[0.04] flex items-center justify-between">
                  <span>Silero VAD + Speech ASR</span>
                  <span className="text-[#0066FF] font-medium">~64ms</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-black/[0.04] flex items-center justify-between">
                  <span>Groq LLM Reasoning</span>
                  <span className="text-[#0066FF] font-medium">~142ms</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-black/[0.04] flex items-center justify-between">
                  <span>Kokoro Neural Audio Stream</span>
                  <span className="text-[#0066FF] font-medium">~94ms</span>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 text-[#0066FF] font-medium flex items-center justify-between">
                  <span>First-Audio Playback</span>
                  <span>300ms Total</span>
                </div>
              </div>
            </div>
          )}

          {activeArchTab === "rag" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div className="space-y-4">
                <span className="text-xs font-mono text-[#0066FF] font-medium uppercase">
                  Atlas Vector Search &middot; Semantic Grounding
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-[#0A0A0C] tracking-tight">
                  Trained on Your Real Documents
                </h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Upload your PDFs, internal guidelines, or website URLs. VoiceFlow chunks content into 500-token embeddings in MongoDB Atlas Vector Search, ensuring every response is grounded with zero hallucinations.
                </p>
                <div className="space-y-2 pt-2 text-xs text-neutral-700">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0066FF]" />
                    <span><strong>Strict Guardrails:</strong> Rejects out-of-domain inquiries politely.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0066FF]" />
                    <span><strong>Live Re-indexing:</strong> Syncs updated documents instantly without model retraining.</span>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] space-y-2 font-mono text-xs">
                <div className="p-3 rounded-xl bg-white border border-black/[0.04] flex items-center justify-between">
                  <span>📄 Returns_Policy.pdf</span>
                  <span className="text-[#0066FF]">99.1% Confidence</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-black/[0.04] flex items-center justify-between">
                  <span>📄 Product_Catalog.csv</span>
                  <span className="text-[#0066FF]">96.4% Confidence</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-black/[0.04] flex items-center justify-between">
                  <span>🌐 https://store.com/faq</span>
                  <span className="text-neutral-500">Synced</span>
                </div>
              </div>
            </div>
          )}

          {activeArchTab === "tools" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div className="space-y-4">
                <span className="text-xs font-mono text-[#0066FF] font-medium uppercase">
                  LLM Function Calling &middot; Safe Execution
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-[#0A0A0C] tracking-tight">
                  Autonomous Actions, Not Just Answers
                </h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Your voice agent does not merely read FAQs &mdash; it tracks shipments, reserves appointments on Google Calendar, looks up live inventory, and files CRM support tickets.
                </p>
                <div className="space-y-2 pt-2 text-xs text-neutral-700">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0066FF]" />
                    <span><strong>Safe Built-in Tools:</strong> check_order, search_product, book_appointment, create_ticket.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0066FF]" />
                    <span><strong>Custom Webhooks:</strong> Connect your private ERP, CRM, or Stripe endpoints.</span>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] space-y-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-white border border-black/[0.04] space-y-1">
                  <div className="flex items-center justify-between text-[#0066FF] font-medium">
                    <span>check_order(orderId: &quot;ORD-9824&quot;)</span>
                    <span className="text-neutral-400">42ms</span>
                  </div>
                  <p className="text-neutral-500 text-[11px] font-sans">
                    Carrier: Express &middot; Status: Out for delivery
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white border border-black/[0.04] space-y-1">
                  <div className="flex items-center justify-between text-[#0066FF] font-medium">
                    <span>book_appointment(time: &quot;14:00&quot;)</span>
                    <span className="text-neutral-400">48ms</span>
                  </div>
                  <p className="text-neutral-500 text-[11px] font-sans">
                    Slot reserved &middot; Calendar invite sent
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeArchTab === "quality" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div className="space-y-4">
                <span className="text-xs font-mono text-[#0066FF] font-medium uppercase">
                  Sentiment Evaluation &middot; Human Escalation
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-[#0A0A0C] tracking-tight">
                  Session Analytics &amp; Human Handoff
                </h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Review every caller turn with millisecond latency breakdowns, audio recordings, and sentiment scoring. If frustration is detected, VoiceFlow tags the session for human handoff.
                </p>
                <div className="space-y-2 pt-2 text-xs text-neutral-700">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0066FF]" />
                    <span><strong>Sentiment Scoring:</strong> Automatically categorizes calls as Positive, Neutral, or Frustrated.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0066FF]" />
                    <span><strong>Escalation Tagging:</strong> Routes live caller and full transcript to human staff.</span>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-[#F8F9FA] border border-black/[0.04] space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-3 rounded-xl bg-white border border-black/[0.04]">
                    <span className="text-neutral-400 text-[10px] block">Avg Latency</span>
                    <strong className="text-neutral-800 text-sm">0.82s</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-black/[0.04]">
                    <span className="text-neutral-400 text-[10px] block">Escalation</span>
                    <strong className="text-[#F43F5E] text-sm">1.8%</strong>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-black/[0.04]">
                    <span className="text-neutral-400 text-[10px] block">Grounding</span>
                    <strong className="text-[#0066FF] text-sm">98.4%</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Neural Voice Studio ─────────────────────────────────────────────── */}
      <section id="voices" className="py-24 px-6 max-w-7xl mx-auto border-t border-black/[0.04]">
        <div className="max-w-2xl mx-auto text-center space-y-3 mb-12">
          <span className="text-xs font-medium uppercase tracking-widest text-[#0066FF]">
            Neural Audio
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0A0A0C]">
            Audition Studio Voices.
          </h2>
          <p className="text-sm text-neutral-500">
            Natural, expressive neural personas powered by Kokoro models.
          </p>
        </div>

        {/* Custom phrase test */}
        <div className="max-w-xl mx-auto mb-10 p-3 rounded-full bg-white border border-black/[0.06] shadow-xs flex items-center gap-2">
          <input
            type="text"
            value={customAuditionText}
            onChange={(e) => setCustomAuditionText(e.target.value)}
            placeholder="Type a custom phrase to audition with any voice..."
            className="w-full px-4 text-xs bg-transparent focus:outline-none text-[#0A0A0C] placeholder:text-neutral-400"
          />
          <div className="flex items-center gap-1 pr-1">
            {[0.85, 1.0, 1.15].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setAuditionSpeed(spd)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-all ${
                  auditionSpeed === spd
                    ? "bg-[#0A0A0C] text-white"
                    : "text-neutral-500 hover:text-black"
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* 4 Voice Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {VOICE_PERSONAS.map((persona) => {
            const isPlaying = playingVoiceId === persona.id;
            const isSelected = selectedVoice === persona.id;

            return (
              <div
                key={persona.id}
                className={`fintech-card p-5 flex flex-col justify-between transition-all ${
                  isSelected ? "ring-2 ring-[#0066FF] border-transparent" : ""
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
                    <span>{persona.gender} &middot; {persona.accent}</span>
                    {isSelected && (
                      <span className="text-[#0066FF] font-medium text-[10px]">Active</span>
                    )}
                  </div>

                  <h4 className="text-lg font-bold text-[#0A0A0C] mt-2">
                    {persona.name}
                  </h4>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {persona.tone}
                  </p>

                  <div className="mt-4 p-3 rounded-xl bg-[#F8F9FA] text-xs text-neutral-700 leading-relaxed border border-black/[0.03]">
                    &ldquo;{customAuditionText.trim() || persona.sample}&rdquo;
                  </div>
                </div>

                <div className="pt-5 mt-4 border-t border-black/[0.04] space-y-2">
                  <button
                    type="button"
                    onClick={() => handleAuditionPersona(persona)}
                    className={`w-full py-2 px-3 rounded-full text-xs font-medium transition-all ${
                      isPlaying
                        ? "bg-[#0066FF] text-white shadow-pill-blue animate-pulse"
                        : "btn-pill-secondary"
                    }`}
                  >
                    {isPlaying ? "Stop" : "Audition Voice"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedVoice(persona.id)}
                    className="w-full text-center text-[11px] text-neutral-400 hover:text-black font-medium"
                  >
                    {isSelected ? "Selected for Demo" : "Select Voice"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── ROI Calculator ──────────────────────────────────────────────────── */}
      <section id="calculator" className="py-24 px-6 max-w-5xl mx-auto border-t border-black/[0.04]">
        <div className="max-w-xl mx-auto text-center space-y-3 mb-12">
          <span className="text-xs font-medium uppercase tracking-widest text-[#0066FF]">
            ROI &amp; Savings
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0A0A0C]">
            Calculate Your Cost Reduction.
          </h2>
          <p className="text-sm text-neutral-500">
            Compare traditional call center agent wages with autonomous sub-second voice streams.
          </p>
        </div>

        <div className="fintech-card p-8 sm:p-12">
          <div className="space-y-4 mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="fintech-slider" className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                Monthly Voice Inbound Calls:
              </label>
              <span className="text-2xl font-bold text-[#0066FF]">
                {monthlyCalls.toLocaleString()} calls
              </span>
            </div>

            <input
              id="fintech-slider"
              type="range"
              min="500"
              max="25000"
              step="500"
              value={monthlyCalls}
              onChange={(e) => setMonthlyCalls(Number(e.target.value))}
              className="fintech-slider"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-black/[0.05]">
            <div className="p-4 rounded-2xl bg-[#F8F9FA] border border-black/[0.04]">
              <span className="text-xs text-neutral-400 font-medium">Traditional Staff</span>
              <p className="text-2xl font-bold text-neutral-800 mt-1">
                ${roiData.humanTotal.toLocaleString()}
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">~$3.50 / call average</p>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100">
              <span className="text-xs text-[#0066FF] font-medium">VoiceFlow AI</span>
              <p className="text-2xl font-bold text-[#0066FF] mt-1">
                ${roiData.aiTotal.toLocaleString()}
              </p>
              <p className="text-[11px] text-blue-600 mt-1">~$0.12 / call streaming</p>
            </div>

            <div className="p-4 rounded-2xl bg-[#0A0A0C] text-white">
              <span className="text-xs text-neutral-400 font-medium">Annual Savings</span>
              <p className="text-2xl font-bold text-white mt-1">
                ${roiData.annualSavings.toLocaleString()}
              </p>
              <p className="text-[11px] text-emerald-400 mt-1">{roiData.percentReduction}% Cost Reduction</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Pricing Tiers with Annual Toggle ────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 max-w-7xl mx-auto border-t border-black/[0.04]">
        <div className="max-w-xl mx-auto text-center space-y-3 mb-10">
          <span className="text-xs font-medium uppercase tracking-widest text-[#0066FF]">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0A0A0C]">
            Predictable Plans for Every Scale.
          </h2>
          <p className="text-sm text-neutral-500">
            Start free, scale smoothly as your voice volume grows.
          </p>

          <div className="pt-4 flex items-center justify-center gap-3">
            <span className={`text-xs font-medium ${!annualBilling ? "text-[#0A0A0C]" : "text-neutral-400"}`}>
              Monthly
            </span>
            <button
              type="button"
              onClick={() => setAnnualBilling(!annualBilling)}
              className="w-12 h-6 rounded-full bg-neutral-200 p-0.5 flex items-center transition-colors"
            >
              <div
                className={`w-5 h-5 rounded-full bg-[#0066FF] transition-transform ${
                  annualBilling ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
            <span className={`text-xs font-medium flex items-center gap-1.5 ${annualBilling ? "text-[#0A0A0C]" : "text-neutral-400"}`}>
              <span>Annual</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[#0066FF]">
                Save 20%
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Starter Plan */}
          <div className="fintech-card p-8 flex flex-col justify-between">
            <div>
              <span className="text-xs font-mono font-medium text-neutral-400 uppercase">
                Starter
              </span>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-[#0A0A0C]">
                  ${annualBilling ? "39" : "49"}
                </span>
                <span className="text-xs text-neutral-400">/ mo</span>
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                Ideal for boutique operations and startups adding voice support.
              </p>

              <ul className="mt-6 space-y-2.5 text-xs text-neutral-700">
                <li className="flex items-center gap-2">✓ 1 Active Voice Agent</li>
                <li className="flex items-center gap-2">✓ 600 Voice Minutes / mo</li>
                <li className="flex items-center gap-2">✓ 50 Knowledge Documents</li>
                <li className="flex items-center gap-2">✓ Standard Neural Voice</li>
                <li className="flex items-center gap-2">✓ Embeddable Website Widget</li>
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-black/[0.04]">
              <Link
                to="/dashboard/agents/new"
                className="w-full btn-pill-secondary text-center"
              >
                Start Starter
              </Link>
            </div>
          </div>

          {/* Growth Plan (Popular) */}
          <div className="fintech-card p-8 flex flex-col justify-between border-[#0066FF] ring-2 ring-[#0066FF]/20 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#0066FF] text-white text-[10px] font-medium tracking-wide uppercase">
              Most Popular
            </span>

            <div>
              <span className="text-xs font-mono font-medium text-[#0066FF] uppercase">
                Growth
              </span>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-[#0A0A0C]">
                  ${annualBilling ? "159" : "199"}
                </span>
                <span className="text-xs text-neutral-400">/ mo</span>
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                For scaling teams handling hundreds of customer voice inquiries daily.
              </p>

              <ul className="mt-6 space-y-2.5 text-xs text-neutral-700 font-medium">
                <li className="flex items-center gap-2">✓ 5 Active Voice Agents</li>
                <li className="flex items-center gap-2">✓ 3,000 Voice Minutes / mo</li>
                <li className="flex items-center gap-2">✓ 250 Knowledge Documents</li>
                <li className="flex items-center gap-2">✓ Autonomous Tool Calling &amp; Actions</li>
                <li className="flex items-center gap-2">✓ Sentiment Scoring &amp; Escalation</li>
                <li className="flex items-center gap-2">✓ Priority Kokoro Neural Engine</li>
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-black/[0.04]">
              <Link
                to="/dashboard/agents/new"
                className="w-full btn-pill-blue text-center"
              >
                Get Started
              </Link>
            </div>
          </div>

          {/* Enterprise Plan */}
          <div className="fintech-card p-8 flex flex-col justify-between">
            <div>
              <span className="text-xs font-mono font-medium text-neutral-400 uppercase">
                Enterprise
              </span>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-[#0A0A0C]">
                  ${annualBilling ? "559" : "699"}
                </span>
                <span className="text-xs text-neutral-400">/ mo</span>
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                For high-volume operations requiring dedicated instances and SLA.
              </p>

              <ul className="mt-6 space-y-2.5 text-xs text-neutral-700">
                <li className="flex items-center gap-2">✓ Unlimited Voice Agents</li>
                <li className="flex items-center gap-2">✓ 12,000+ Voice Minutes</li>
                <li className="flex items-center gap-2">✓ Custom API &amp; Webhook Registry</li>
                <li className="flex items-center gap-2">✓ Dedicated Telephony &amp; SIP Trunking</li>
                <li className="flex items-center gap-2">✓ SOC-2 / HIPAA Security SLA</li>
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-black/[0.04]">
              <Link
                to="/dashboard"
                className="w-full btn-pill-secondary text-center"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Frequently Asked Questions (FAQ) ──────────────────────────────── */}
      <section className="py-24 px-6 max-w-3xl mx-auto border-t border-black/[0.04]">
        <div className="text-center space-y-3 mb-10">
          <span className="text-xs font-medium uppercase tracking-widest text-[#0066FF]">
            Support
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0A0A0C]">
            Frequently Asked Questions.
          </h2>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {[
            { id: "all", label: "All Questions" },
            { id: "voice", label: "Voice & Latency" },
            { id: "rag", label: "Knowledge & RAG" },
            { id: "tools", label: "Tool Calling" },
            { id: "security", label: "Safety & Escalation" },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setFaqCategory(cat.id);
                setActiveFaq(null);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                faqCategory === cat.id
                  ? "bg-[#0A0A0C] text-white shadow-xs"
                  : "bg-white text-neutral-600 border border-black/[0.06] hover:bg-neutral-100"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filteredFaqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div
                key={idx}
                className="fintech-card overflow-hidden transition-all cursor-pointer"
                onClick={() => setActiveFaq(isOpen ? null : idx)}
              >
                <div className="p-4 sm:p-5 flex items-center justify-between text-sm font-semibold text-[#0A0A0C]">
                  <span>{faq.q}</span>
                  <span className="text-neutral-400 text-base font-normal ml-3">
                    {isOpen ? "−" : "+"}
                  </span>
                </div>
                {isOpen && (
                  <div className="px-4 sm:px-5 pb-5 text-xs text-neutral-500 leading-relaxed border-t border-black/[0.03] pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Minimal Bottom CTA Banner ───────────────────────────────────────── */}
      <section className="py-20 px-6 max-w-5xl mx-auto">
        <div className="fintech-card p-10 sm:p-14 text-center space-y-5 bg-[#0A0A0C] text-white relative overflow-hidden">
          {/* Subtle 3D Glossy Accents */}
          <div className="absolute -top-16 -left-16 w-44 h-44 glossy-3d-blob-blue opacity-30 pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-44 h-44 glossy-3d-blob-pink opacity-25 pointer-events-none" />

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight">
            Ready to give your business a voice?
          </h2>
          <p className="max-w-md mx-auto text-xs sm:text-sm text-neutral-400 leading-relaxed">
            Build and deploy your first autonomous AI voice agent in under 2 minutes.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/dashboard/agents/new"
              className="btn-pill-blue px-6 py-3 text-sm shadow-pill-blue"
            >
              Start Free Trial &rarr;
            </Link>
            <Link
              to="/dashboard"
              className="btn-pill-secondary px-6 py-3 text-sm"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Ultra-Minimal Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-black/[0.04] py-12 px-6 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-800">VoiceFlow AI</span>
            <span>&copy; {new Date().getFullYear()} All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="hover:text-black transition-colors">Dashboard</Link>
            <Link to="/dashboard/agents" className="hover:text-black transition-colors">Agents</Link>
            <Link to="/dashboard/conversations" className="hover:text-black transition-colors">Conversations</Link>
            {isAuthenticated ? (
              <button
                onClick={() => logout()}
                className="hover:text-black transition-colors"
              >
                Sign out
              </button>
            ) : (
              <Link to="/login" className="hover:text-black transition-colors">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
