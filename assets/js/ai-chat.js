/* ==========================================================================
   Ivaan — Dropout Traders AI Financial Assistant
   Phase 1: Chat widget, futuristic mini-robot mascot edition.
   Phase 2: Persistent chat history (loads from the Worker's database).
   Talks to a Cloudflare Worker backend — see ivaan-worker.js
   ========================================================================== */
(function () {
  // 1) Point this at your deployed Worker URL, ending in /chat
  const WORKER_URL = "https://ivaan.dinankarparmar12345.workers.dev/chat";
  const HISTORY_URL = WORKER_URL.replace(/\/chat\/?$/, "/history");

  // Each visitor gets a private, persistent ID stored only in their own
  // browser — this is how their chat history is found again on return visits.
  function getSessionId() {
    try {
      let id = localStorage.getItem("ivaan_session_id");
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
        localStorage.setItem("ivaan_session_id", id);
      }
      return id;
    } catch {
      return null; // localStorage unavailable (private mode etc.) — chat still works, just won't persist
    }
  }

  const STYLE = `
  @keyframes ai-pulse{0%,100%{box-shadow:0 0 0 0 rgba(212,175,55,.55),0 8px 26px -4px rgba(212,175,55,.55);}
    50%{box-shadow:0 0 0 10px rgba(212,175,55,0),0 8px 26px -4px rgba(212,175,55,.7);}}
  @keyframes ai-blink{0%,88%,100%{transform:scaleY(1);}92%{transform:scaleY(.1);}}
  @keyframes ai-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-2px);}}
  @keyframes ai-border-spin{to{--ai-angle:360deg;}}
  @property --ai-angle{syntax:'<angle>';inherits:false;initial-value:0deg;}
  @keyframes ai-dot{0%,80%,100%{opacity:.25;transform:translateY(0);}40%{opacity:1;transform:translateY(-2px);}}

  .ai-fab{position:fixed;left:26px;bottom:26px;z-index:2147483647;width:60px;height:60px;border-radius:50%;
    background:radial-gradient(circle at 35% 30%,#3a2f10,#0d0d11 70%);
    border:1.5px solid rgba(212,175,55,.6);display:flex;align-items:center;justify-content:center;
    cursor:pointer;transition:transform .3s ease;animation:ai-pulse 2.6s ease-in-out infinite;padding:0;}
  .ai-fab:hover{transform:translateY(-3px) scale(1.06);}
  .ai-bot-face{width:34px;height:34px;animation:ai-bob 3s ease-in-out infinite;}
  .ai-eye{animation:ai-blink 4.5s ease-in-out infinite;transform-origin:center;}

  .ai-panel{position:fixed;left:26px;bottom:96px;z-index:2147483647;width:360px;max-width:calc(100vw - 40px);
    height:520px;max-height:calc(100vh - 140px);border-radius:20px;overflow:hidden;
    opacity:0;pointer-events:none;transform:translateY(16px) scale(.97);
    transition:opacity .3s ease,transform .3s ease;font-family:'Inter',sans-serif;
    padding:1.5px;background:conic-gradient(from var(--ai-angle,0deg),#d4af37,#3a2f10,#f3d576,#3a2f10,#d4af37);
    animation:ai-border-spin 6s linear infinite;isolation:isolate;}
  .ai-panel.open{opacity:1;pointer-events:auto;transform:translateY(0) scale(1);}
  .ai-panel-inner{position:relative;width:100%;height:100%;border-radius:19px;background:#0a0a0e;
    display:flex;flex-direction:column;overflow:hidden;}
  .ai-panel-inner::before{content:'';position:absolute;inset:0;opacity:.05;pointer-events:none;
    background-image:linear-gradient(rgba(212,175,55,.6) 1px,transparent 1px),
    linear-gradient(90deg,rgba(212,175,55,.6) 1px,transparent 1px);background-size:22px 22px;}
  .ai-head{position:relative;padding:14px 16px;border-bottom:1px solid rgba(212,175,55,.22);
    display:flex;align-items:center;gap:10px;background:rgba(212,175,55,0.05);}
  .ai-head-face{width:34px;height:34px;flex-shrink:0;}
  .ai-head h4{margin:0;font-family:'Playfair Display',serif;font-size:15px;color:#f6f4ee;}
  .ai-head span{display:block;font-family:'Space Mono',monospace;font-size:9.5px;letter-spacing:.1em;
    color:#d4af37;text-transform:uppercase;margin-top:2px;}
  .ai-head-dot{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 6px #4ade80;margin-left:auto;}
  .ai-clear{background:none;border:none;color:#a8a49b;cursor:pointer;font-size:10.5px;padding:4px 6px;
    font-family:'Space Mono',monospace;letter-spacing:.03em;}
  .ai-clear:hover{color:#d4af37;}
  .ai-close{background:none;border:none;color:#a8a49b;cursor:pointer;font-size:18px;line-height:1;padding:4px;margin-left:2px;}
  .ai-body{position:relative;flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;}
  .ai-row{display:flex;align-items:flex-end;gap:8px;}
  .ai-row.user{justify-content:flex-end;}
  .ai-mini-face{width:22px;height:22px;flex-shrink:0;margin-bottom:2px;}
  .ai-msg{max-width:78%;font-size:13.5px;line-height:1.55;padding:10px 13px;border-radius:12px;white-space:pre-wrap;}
  .ai-msg.bot{background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,.15);color:#f6f4ee;}
  .ai-msg.user{background:linear-gradient(135deg,#f3d576,#d4af37);color:#1a1305;}
  .ai-typing-dots{display:flex;gap:4px;padding:4px 2px;}
  .ai-typing-dots span{width:5px;height:5px;border-radius:50%;background:#d4af37;animation:ai-dot 1.2s infinite;}
  .ai-typing-dots span:nth-child(2){animation-delay:.15s;}
  .ai-typing-dots span:nth-child(3){animation-delay:.3s;}
  .ai-foot{position:relative;padding:12px;border-top:1px solid rgba(212,175,55,.22);display:flex;gap:8px;}
  .ai-foot input{flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(212,175,55,.22);
    border-radius:10px;padding:10px 12px;color:#f6f4ee;font-size:13.5px;font-family:inherit;}
  .ai-foot input:focus{outline:none;border-color:#d4af37;box-shadow:0 0 0 2px rgba(212,175,55,.15);}
  .ai-foot button{background:linear-gradient(135deg,#f3d576,#d4af37);
    border:none;border-radius:10px;padding:0 16px;color:#1a1305;font-weight:600;cursor:pointer;font-size:13px;}
  .ai-foot button:disabled{opacity:.5;cursor:default;}
  .ai-disclaimer{position:relative;padding:6px 16px 10px;font-size:9.5px;line-height:1.5;color:#6f6c66;text-align:center;}
  @media (max-width:480px){.ai-panel{left:14px;right:14px;width:auto;bottom:90px;}.ai-fab{left:16px;bottom:16px;}}
  `;

  // Cute little robot mascot face — big glowing eyes, antenna, gentle smile.
  function botFaceSVG(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="32" y1="6" x2="32" y2="14" stroke="#f3d576" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="32" cy="5" r="3.2" fill="#f3d576"><animate attributeName="opacity" values="1;.4;1" dur="1.8s" repeatCount="indefinite"/></circle>
      <rect x="9" y="14" width="46" height="40" rx="16" fill="url(#aiBodyGrad)" stroke="#f3d576" stroke-width="1.6"/>
      <g class="ai-eye" style="transform-box:fill-box;">
        <circle cx="23" cy="34" r="7" fill="#1a1305"/>
        <circle cx="23" cy="34" r="7" fill="none" stroke="#6ee7ff" stroke-width="1.4"/>
        <circle cx="24.5" cy="32.5" r="2.4" fill="#aef1ff"/>
      </g>
      <g class="ai-eye" style="transform-box:fill-box;">
        <circle cx="41" cy="34" r="7" fill="#1a1305"/>
        <circle cx="41" cy="34" r="7" fill="none" stroke="#6ee7ff" stroke-width="1.4"/>
        <circle cx="42.5" cy="32.5" r="2.4" fill="#aef1ff"/>
      </g>
      <path d="M25 44c2.2 2.4 11.8 2.4 14 0" stroke="#3a2f10" stroke-width="2" stroke-linecap="round"/>
      <defs>
        <linearGradient id="aiBodyGrad" x1="9" y1="14" x2="55" y2="54" gradientUnits="userSpaceOnUse">
          <stop stop-color="#f3d576"/><stop offset="1" stop-color="#d4af37"/>
        </linearGradient>
      </defs>
    </svg>`;
  }

  function injectStyle() {
    const s = document.createElement("style");
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function buildUI() {
    let sessionId = getSessionId();

    const fab = document.createElement("button");
    fab.className = "ai-fab";
    fab.setAttribute("aria-label", "Ask Ivaan");
    fab.innerHTML = `<span class="ai-bot-face">${botFaceSVG(34)}</span>`;

    const panel = document.createElement("div");
    panel.className = "ai-panel";
    panel.innerHTML = `
      <div class="ai-panel-inner">
        <div class="ai-head">
          <span class="ai-head-face">${botFaceSVG(34)}</span>
          <div><h4>Ivaan</h4><span>AI Financial Assistant</span></div>
          <span class="ai-head-dot" title="Online"></span>
          <button class="ai-clear" title="Clear conversation">Clear</button>
          <button class="ai-close" aria-label="Close">✕</button>
        </div>
        <div class="ai-body" id="ai-body"></div>
        <div class="ai-foot">
          <input id="ai-input" type="text" placeholder="e.g. What is P/E ratio?" autocomplete="off">
          <button id="ai-send">Ask</button>
        </div>
        <div class="ai-disclaimer">Educational information only — not investment advice.</div>
      </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    const clearBtn = panel.querySelector(".ai-clear");
    const closeBtn = panel.querySelector(".ai-close");
    const body = panel.querySelector("#ai-body");
    const input = panel.querySelector("#ai-input");
    const send = panel.querySelector("#ai-send");

    const GREETING = "Hi, I'm Ivaan. Ask me anything about stocks, forex, crypto, options, valuation, or investing concepts.";

    fab.addEventListener("click", () => {
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) input.focus();
    });
    closeBtn.addEventListener("click", () => panel.classList.remove("open"));

    let history = [];

    function addRow(html, cls, isBot) {
      const row = document.createElement("div");
      row.className = "ai-row " + cls;
      row.innerHTML = isBot
        ? `<span class="ai-mini-face">${botFaceSVG(22)}</span>${html}`
        : html;
      body.appendChild(row);
      body.scrollTop = body.scrollHeight;
      return row;
    }

    function addMsg(text, cls) {
      const bubble = `<div class="ai-msg ${cls}"></div>`;
      const row = addRow(bubble, cls, cls === "bot");
      row.querySelector(".ai-msg").textContent = text;
      return row;
    }

    function addTyping() {
      const bubble = `<div class="ai-msg bot"><div class="ai-typing-dots"><span></span><span></span><span></span></div></div>`;
      return addRow(bubble, "bot", true);
    }

    function renderGreeting() {
      body.innerHTML = "";
      addMsg(GREETING, "bot");
    }

    // ── Phase 2: load this visitor's past conversation, if any ─────────────
    async function loadHistory() {
      if (!sessionId) { renderGreeting(); return; }
      try {
        const res = await fetch(`${HISTORY_URL}?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        const past = Array.isArray(data.messages) ? data.messages : [];
        if (past.length === 0) {
          renderGreeting();
          return;
        }
        body.innerHTML = "";
        for (const m of past) {
          addMsg(m.content, m.role === "user" ? "user" : "bot");
          history.push({ role: m.role, content: m.content });
        }
      } catch {
        renderGreeting();
      }
    }
    loadHistory();

    clearBtn.addEventListener("click", () => {
      history = [];
      try {
        localStorage.removeItem("ivaan_session_id");
      } catch {}
      sessionId = getSessionId(); // fresh ID so old history isn't reattached
      renderGreeting();
    });

    async function ask() {
      const q = input.value.trim();
      if (!q) return;
      addMsg(q, "user");
      history.push({ role: "user", content: q });
      input.value = "";
      send.disabled = true;
      const typing = addTyping();

      try {
        const res = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.slice(-10), session_id: sessionId }),
        });
        if (!res.ok) throw new Error("Request failed");
        const data = await res.json();
        typing.remove();
        const reply = data.reply || "Sorry, I couldn't get an answer just now.";
        addMsg(reply, "bot");
        history.push({ role: "assistant", content: reply });
      } catch (err) {
        typing.remove();
        addMsg("Something went wrong reaching Ivaan. Please try again shortly.", "bot");
      } finally {
        send.disabled = false;
        input.focus();
      }
    }

    send.addEventListener("click", ask);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") ask();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectStyle();
    buildUI();
  });
})();
