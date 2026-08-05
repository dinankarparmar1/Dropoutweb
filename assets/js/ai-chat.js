/* ==========================================================================
   Ivaan — Dropout Traders AI Financial Assistant
   Phase 1: Chat widget, futuristic mini-robot mascot edition.
   Phase 2: Persistent chat history (loads from the Worker's database).
   Phase 3: PDF upload & analysis (annual reports, statements, etc).
   Talks to a Cloudflare Worker backend — see ivaan-worker.js
   ========================================================================== */
(function () {
  // 1) Point this at your deployed Worker URL, ending in /chat
  const WORKER_URL = "https://ivaan.dinankarparmar12345.workers.dev/chat";
  const HISTORY_URL = WORKER_URL.replace(/\/chat\/?$/, "/history");

  // PDFs are read entirely in the visitor's own browser using pdf.js —
  // nothing is uploaded anywhere, keeping this free and private.
  const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
  const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const MAX_PDF_PAGES = 200;
  const MAX_PDF_CHARS = 90000; // ~22-25k tokens — safely fits the model's 128k context alongside chat history + reply
  const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25MB

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

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  let pdfLibPromise = null;
  function ensurePdfLib() {
    if (!pdfLibPromise) {
      pdfLibPromise = loadScript(PDFJS_URL).then(() => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      });
    }
    return pdfLibPromise;
  }

  async function extractPdfText(file) {
    await ensurePdfLib();
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n\n";
      if (text.length > MAX_PDF_CHARS) break;
    }
    const truncated = text.length > MAX_PDF_CHARS || pdf.numPages > MAX_PDF_PAGES;
    return { text: text.slice(0, MAX_PDF_CHARS), truncated, pages: pdf.numPages };
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
  .ai-msg.file{background:rgba(212,175,55,.12);border:1px dashed rgba(212,175,55,.5);color:#f3d576;
    font-family:'Space Mono',monospace;font-size:12px;}
  .ai-typing-dots{display:flex;gap:4px;padding:4px 2px;}
  .ai-typing-dots span{width:5px;height:5px;border-radius:50%;background:#d4af37;animation:ai-dot 1.2s infinite;}
  .ai-typing-dots span:nth-child(2){animation-delay:.15s;}
  .ai-typing-dots span:nth-child(3){animation-delay:.3s;}
  .ai-foot{position:relative;padding:12px;border-top:1px solid rgba(212,175,55,.22);display:flex;gap:8px;}
  .ai-attach{background:rgba(255,255,255,0.03);border:1px solid rgba(212,175,55,.22);border-radius:10px;
    width:38px;flex-shrink:0;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#d4af37;}
  .ai-attach:hover{border-color:#d4af37;}
  .ai-attach svg{width:17px;height:17px;}
  .ai-foot input[type=text]{flex:1;min-width:0;background:rgba(255,255,255,0.03);border:1px solid rgba(212,175,55,.22);
    border-radius:10px;padding:10px 12px;color:#f6f4ee;font-size:13.5px;font-family:inherit;}
  .ai-foot input[type=text]:focus{outline:none;border-color:#d4af37;box-shadow:0 0 0 2px rgba(212,175,55,.15);}
  .ai-foot button.ai-send-btn{background:linear-gradient(135deg,#f3d576,#d4af37);
    border:none;border-radius:10px;padding:0 16px;color:#1a1305;font-weight:600;cursor:pointer;font-size:13px;flex-shrink:0;}
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

  const PAPERCLIP_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;

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
          <button class="ai-attach" type="button" title="Upload a PDF (annual report, statement, etc.)">${PAPERCLIP_SVG}</button>
          <input type="file" id="ai-file" accept="application/pdf" style="display:none">
          <input id="ai-input" type="text" placeholder="e.g. What is P/E ratio?" autocomplete="off">
          <button id="ai-send" class="ai-send-btn">Ask</button>
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
    const attachBtn = panel.querySelector(".ai-attach");
    const fileInput = panel.querySelector("#ai-file");

    const GREETING = "Hi, I'm Ivaan. Ask me anything about stocks, forex, crypto, options, valuation, or investing concepts. You can also tap the paperclip to upload a PDF — like an annual report — and I'll analyze it.";

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

    function addFileChip(filename) {
      const bubble = `<div class="ai-msg file">📄 ${filename}</div>`;
      return addRow(bubble, "user", false);
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
      } catch (err) {
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

    // Sends a request to the Worker. `persistLabel`, when given, is what gets
    // saved to the database instead of the (possibly huge) actual prompt —
    // used for PDF uploads so we don't store the whole document text.
    async function sendToIvaan(messagesForModel, persistLabel) {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesForModel,
          session_id: sessionId,
          persist_label: persistLabel || undefined,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      return data.reply || "Sorry, I couldn't get an answer just now.";
    }

    async function ask() {
      const q = input.value.trim();
      if (!q) return;
      addMsg(q, "user");
      history.push({ role: "user", content: q });
      input.value = "";
      send.disabled = true;
      const typing = addTyping();

      try {
        const reply = await sendToIvaan(history.slice(-10));
        typing.remove();
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

    // ── Phase 3: PDF upload & analysis ──────────────────────────────────────
    attachBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      fileInput.value = ""; // allow re-selecting the same file later
      if (!file) return;

      if (file.type !== "application/pdf") {
        addMsg("I can only read PDF files right now — try exporting that as a PDF first.", "bot");
        return;
      }
      if (file.size > MAX_PDF_BYTES) {
        addMsg("That PDF is too large (over 25MB) — try a smaller file or an extracted section.", "bot");
        return;
      }

      addFileChip(file.name);
      send.disabled = true;
      attachBtn.style.opacity = ".5";
      attachBtn.style.pointerEvents = "none";
      addMsg("Reading and analyzing your document — for a long report this can take up to a minute, please hang on.", "bot");
      const typing = addTyping();

      try {
        const { text, truncated, pages } = await extractPdfText(file);
        if (!text.trim()) {
          typing.remove();
          addMsg("I couldn't find readable text in that PDF — it may be a scanned image rather than selectable text.", "bot");
          return;
        }

        const notice = truncated
          ? `\n\n[Note: only the first ${Math.min(pages, MAX_PDF_PAGES)} of ${pages} pages / ${MAX_PDF_CHARS} characters were read.]`
          : "";
        const prompt = `[The user uploaded a document: "${file.name}"]\n\nExtracted document text:\n${text}${notice}\n\nPlease analyze this as a financial document. Give: a brief business overview, revenue/profitability trends if visible in the text, cash flow and debt notes, key risks and opportunities, and any other notable observations. If important figures aren't present in the extracted text, say so rather than guessing.`;

        // Only the current short-term context plus this prompt goes to the
        // model — we don't want to keep resending the full document text on
        // every later question.
        const messagesForModel = history.slice(-4).concat([{ role: "user", content: prompt }]);
        const persistLabel = `[Uploaded document: ${file.name}]`;

        const reply = await sendToIvaan(messagesForModel, persistLabel);
        typing.remove();
        addMsg(reply, "bot");
        // Store only the short label in ongoing history, not the full text.
        history.push({ role: "user", content: persistLabel });
        history.push({ role: "assistant", content: reply });
      } catch (err) {
        typing.remove();
        addMsg("I had trouble reading that PDF. Please try a different file or try again.", "bot");
      } finally {
        send.disabled = false;
        attachBtn.style.opacity = "";
        attachBtn.style.pointerEvents = "";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectStyle();
    buildUI();
  });
})();
