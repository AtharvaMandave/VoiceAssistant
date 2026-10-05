/**
 * VoiceFlow AI — Embeddable Widget Loader
 * 
 * Usage on any website:
 *   <script
 *     src="https://your-domain.com/widget/voiceflow-widget.js"
 *     data-agent-id="agent_abc123"
 *   ></script>
 * 
 * This lightweight loader (~4KB):
 *   1. Reads the data-agent-id from the script tag
 *   2. Fetches public widget config from the API
 *   3. Injects a sandboxed iframe with the widget UI
 *   4. Manages postMessage communication between host and widget
 */
(function () {
  "use strict";

  // ─── Configuration ──────────────────────────────────────────────────
  const WIDGET_VERSION = "1.0.0";

  // Find our own script tag to read data attributes
  const scriptTag =
    document.currentScript ||
    document.querySelector("script[data-agent-id]");

  if (!scriptTag) {
    console.error("[VoiceFlow] Widget script tag not found. Add data-agent-id attribute.");
    return;
  }

  const agentId = scriptTag.getAttribute("data-agent-id");
  if (!agentId) {
    console.error("[VoiceFlow] data-agent-id attribute is required.");
    return;
  }

  // Derive API base from the script src, or fallback to same-origin
  const scriptSrc = scriptTag.getAttribute("src") || "";
  let API_BASE = "";
  try {
    if (scriptSrc && scriptSrc.startsWith("http")) {
      const url = new URL(scriptSrc);
      API_BASE = url.origin;
    }
  } catch (_) {
    // Use same-origin
  }
  // Allow explicit override
  const apiOverride = scriptTag.getAttribute("data-api-url");
  if (apiOverride) API_BASE = apiOverride;

  // Widget iframe URL (co-located with the API)
  const WIDGET_IFRAME_URL = `${API_BASE}/widget/embed.html?agentId=${encodeURIComponent(agentId)}&v=${WIDGET_VERSION}`;
  const CONFIG_URL = `${API_BASE}/api/widget/config/${encodeURIComponent(agentId)}`;

  // ─── Styles ─────────────────────────────────────────────────────────
  const CONTAINER_ID = "voiceflow-widget-container";
  const FAB_ID = "voiceflow-widget-fab";
  const IFRAME_ID = "voiceflow-widget-iframe";

  function injectStyles(config) {
    const color = (config && config.widget && config.widget.primaryColor) || "#6366f1";
    const position = (config && config.widget && config.widget.position) || "bottom-right";
    const isRight = position === "bottom-right";

    const style = document.createElement("style");
    style.textContent = `
      #${CONTAINER_ID} {
        position: fixed;
        ${isRight ? "right: 20px" : "left: 20px"};
        bottom: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      #${FAB_ID} {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: ${color};
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.25), 0 0 0 0 ${color}40;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        animation: vf-pulse 2s infinite;
      }

      #${FAB_ID}:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 28px rgba(0,0,0,0.35);
      }

      #${FAB_ID} svg {
        width: 26px;
        height: 26px;
        fill: white;
      }

      #${FAB_ID}.vf-open svg.vf-mic { display: none; }
      #${FAB_ID}.vf-open svg.vf-close { display: block; }
      #${FAB_ID}:not(.vf-open) svg.vf-mic { display: block; }
      #${FAB_ID}:not(.vf-open) svg.vf-close { display: none; }

      #${IFRAME_ID} {
        display: none;
        position: absolute;
        ${isRight ? "right: 0" : "left: 0"};
        bottom: 76px;
        width: 380px;
        height: 560px;
        max-height: calc(100vh - 120px);
        max-width: calc(100vw - 40px);
        border: none;
        border-radius: 16px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05);
        background: #0f0f14;
        overflow: hidden;
      }

      #${IFRAME_ID}.vf-visible {
        display: block;
        animation: vf-slide-up 0.3s ease;
      }

      @keyframes vf-slide-up {
        from { opacity: 0; transform: translateY(16px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes vf-pulse {
        0%   { box-shadow: 0 4px 20px rgba(0,0,0,0.25), 0 0 0 0 ${color}40; }
        70%  { box-shadow: 0 4px 20px rgba(0,0,0,0.25), 0 0 0 12px ${color}00; }
        100% { box-shadow: 0 4px 20px rgba(0,0,0,0.25), 0 0 0 0 ${color}00; }
      }

      @media (max-width: 480px) {
        #${IFRAME_ID}.vf-visible {
          width: calc(100vw - 20px);
          height: calc(100vh - 100px);
          ${isRight ? "right: -10px" : "left: -10px"};
          bottom: 72px;
          border-radius: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ─── DOM Construction ───────────────────────────────────────────────
  function buildWidget(config) {
    // Container
    const container = document.createElement("div");
    container.id = CONTAINER_ID;

    // Iframe
    const iframe = document.createElement("iframe");
    iframe.id = IFRAME_ID;
    iframe.src = WIDGET_IFRAME_URL;
    iframe.allow = "microphone; autoplay";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-forms");
    iframe.title = (config && config.widget && config.widget.title) || "AI Voice Assistant";

    // FAB (floating action button)
    const fab = document.createElement("button");
    fab.id = FAB_ID;
    fab.setAttribute("aria-label", "Open voice assistant");
    fab.innerHTML = `
      <svg class="vf-mic" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
      </svg>
      <svg class="vf-close" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:none">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    `;

    let isOpen = false;

    fab.addEventListener("click", function () {
      isOpen = !isOpen;
      if (isOpen) {
        iframe.classList.add("vf-visible");
        fab.classList.add("vf-open");
        fab.setAttribute("aria-label", "Close voice assistant");
        // Stop pulse animation once opened
        fab.style.animation = "none";
        // Notify iframe it is now visible
        iframe.contentWindow?.postMessage({ type: "voiceflow:widget-opened" }, "*");
      } else {
        iframe.classList.remove("vf-visible");
        fab.classList.remove("vf-open");
        fab.setAttribute("aria-label", "Open voice assistant");
        iframe.contentWindow?.postMessage({ type: "voiceflow:widget-closed" }, "*");
      }
    });

    container.appendChild(iframe);
    container.appendChild(fab);
    document.body.appendChild(container);
  }

  // ─── PostMessage Handler ────────────────────────────────────────────
  function setupPostMessageHandler() {
    window.addEventListener("message", function (event) {
      if (!event.data || !event.data.type) return;
      // Only accept messages from our iframe
      const iframe = document.getElementById(IFRAME_ID);
      if (!iframe || event.source !== iframe.contentWindow) return;

      const { type, payload } = event.data;

      switch (type) {
        case "voiceflow:open-route":
          if (payload && payload.path) {
            window.location.href = payload.path;
          }
          break;

        case "voiceflow:go-back":
          window.history.back();
          break;

        case "voiceflow:open-external-link":
          if (payload && payload.url) {
            window.open(payload.url, "_blank", "noopener,noreferrer");
          }
          break;

        case "voiceflow:scroll-to":
          if (payload && payload.selector) {
            const el = document.querySelector(payload.selector);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          break;

        case "voiceflow:close-widget":
          const fab = document.getElementById(FAB_ID);
          if (fab) fab.click();
          break;

        case "voiceflow:resize":
          if (payload && iframe) {
            if (payload.height) iframe.style.height = payload.height + "px";
            if (payload.width) iframe.style.width = payload.width + "px";
          }
          break;
      }
    });
  }

  // ─── Initialization ─────────────────────────────────────────────────
  async function init() {
    let config = null;

    // Fetch widget config from API (best-effort — widget works with defaults)
    try {
      const res = await fetch(CONFIG_URL, {
        headers: { "Accept": "application/json" },
      });
      if (res.ok) {
        const json = await res.json();
        config = json.data || json;
      }
    } catch (err) {
      console.warn("[VoiceFlow] Could not fetch widget config, using defaults:", err);
    }

    injectStyles(config);
    buildWidget(config);
    setupPostMessageHandler();

    console.log(`[VoiceFlow] Widget v${WIDGET_VERSION} loaded for agent ${agentId}`);
  }

  // Wait for DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
