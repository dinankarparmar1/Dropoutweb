/* ==========================================================================
   Ivaan — Dropout Traders AI Financial Assistant (Phase 1: Chat widget)
   Talks to a Cloudflare Worker backend — see ivaan-worker.js
   ========================================================================== */
(function () {
  // 1) Point this at your deployed Worker URL, ending in /chat
  const WORKER_URL = "https://ivaan.dinankarparmar12345.workers.dev/chat";

  const STYLE = `
  .ai-fab{position:fixed;left:26px;bottom:26px;z-index:2147483647;width:56px;height:56px;border-radius:50%;
    background:linear-gradient(135deg,var(--gold-bright),var(--gold) 55%,var(--gold-deep));
    box-shadow:0 8px 26px -4px rgba(212,175,55,0.55);display:flex;align-items:center;justify-content:center;
    border:none;cursor:pointer;transition:transform .3s ease,box-shadow .3s ease;}
  .ai-fab:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 14px 34px -4px rgba(212,175,55,0.7);}
  .ai-fab svg{width:26px;height:26px;color:#1a1305;}
  .ai-panel{position:fixed;left:26px;bottom:96px;z-index:2147483647;width:360px;max-width:calc(100vw - 40px);
    height:520px;max-height:calc(100vh - 140px);background:#0d0d11;background-color:#0d0d11;
    border:1px solid rgba(212,175,55,.45);border-radius:18px;isolation:isolate;
    display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.55);
    opacity:0;pointer-events:none;transform:translateY(16px) scale(.97);
    transition:opacity .3s ease,transform .3s ease;font-family:'Inter',sans-serif;}
  .ai-panel.open{opacity:1;pointer-events:auto;transform:translateY(0) scale(1);}
  .ai-head{padding:16px 18px;border-bottom:1px solid var(--panel-border,rgba(212,175,55,.22));
    display:flex;align-items:center;justify-content:space-between;background:rgba(212,175,55,0.05);}
  .ai-head h4{margin:0;font-family:'Playfair Display',serif;font-size:15px;color:var(--white,#f6f4ee);}
  .ai-head span{display:block;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.1em;
    color:var(--gold,#d4af37);text-transform:uppercase;margin-top:2px;}
  .ai-close{background:none;border:none;color:var(--muted,#a8a49b);cursor:pointer;font-size:18px;line-height:1;padding:4px;}
  .ai-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}
  .ai-msg{max-width:88%;font-size:13.5px;line-height:1.55;padding:10px 13px;border-radius:12px;white-space:pre-wrap;}
  .ai-msg.bot{align-self:flex-start;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:var(--white,#f6f4ee);}
  .ai-msg.user{align-self:flex-end;background:linear-gradient(135deg,var(--gold-bright,#f3d576),var(--gold,#d4af37));color:#1a1305;}
  .ai-msg.typing{align-self:flex-start;color:var(--muted-dim,#6f6c66);font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.05em;}
  .ai-foot{padding:12px;border-top:1px solid var(--panel-border,rgba(212,175,55,.22));display:flex;gap:8px;}
  .ai-foot input{flex:1;background:rgba(255,255,255,0.03);border:1px solid var(--panel-border,rgba(212,175,55,.22));
    border-radius:10px;padding:10px 12px;color:var(--white,#f6f4ee);font-size:13.5px;font-family:inherit;}
  .ai-foot input:focus{outline:none;border-color:var(--gold,#d4af37);}
  .ai-foot button{background:linear-gradient(135deg,var(--gold-bright,#f3d576),var(--gold,#d4af37));
    border:none;border-radius:10px;padding:0 16px;color:#1a1305;font-weight:600;cursor:pointer;font-size:13px;}
  .ai-foot button:disabled{opacity:.5;cursor:default;}
  .ai-disclaimer{padding:8px 16px 12px;font-size:10px;line-height:1.5;color:var(--muted-dim,#6f6c66);text-align:center;}
  @media (max-width:480px){.ai-panel{left:14px;right:14px;width:auto;bottom:90px;}.ai-fab{left:16px;bottom:16px;}}
  `;

  function injectStyle() {
    const s = document.createElement("style");
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function buildUI() {
    const fab = document.createElement("button");
    fab.className = "ai-fab";
    fab.setAttribute("aria-label", "Ask Ivaan");
    fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

    const panel = document.createElement("div");
    panel.className = "ai-panel";
    panel.innerHTML = `
      <div class="ai-head">
        <div><h4>Ivaan</h4><span>AI Financial Assistant</span></div>
        <button class="ai-close" aria-label="Close">✕</button>
      </div>
      <div class="ai-body" id="ai-body">
        <div class="ai-msg bot">Hi, I'm Ivaan. Ask me anything about stocks, forex, crypto, options, valuation, or investing concepts.</div>
      </div>
      <div class="ai-foot">
        <input id="ai-input" type="text" placeholder="e.g. What is P/E ratio?" autocomplete="off">
        <button id="ai-send">Ask</button>
      </div>
      <div class="ai-disclaimer">Educational information only — not investment advice.</div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    const closeBtn = panel.querySelector(".ai-close");
    const body = panel.querySelector("#ai-body");
    const input = panel.querySelector("#ai-input");
    const send = panel.querySelector("#ai-send");

    fab.addEventListener("click", () => {
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) input.focus();
    });
    closeBtn.addEventListener("click", () => panel.classList.remove("open"));

    let history = [];

    function addMsg(text, cls) {
      const d = document.createElement("div");
      d.className = "ai-msg " + cls;
      d.textContent = text;
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
      return d;
    }

    async function ask() {
      const q = input.value.trim();
      if (!q) return;
      addMsg(q, "user");
      history.push({ role: "user", content: q });
      input.value = "";
      send.disabled = true;
      const typing = addMsg("thinking…", "typing");

      try {
        const res = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.slice(-10) }),
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
