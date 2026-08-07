/* ==========================================================================
   Ivaan — Dropout Traders AI Financial Assistant
   Phase 1: Chat widget, futuristic mini-robot mascot edition.
   Phase 2: Persistent chat history (loads from the Worker's database).
   Phase 3: PDF upload & analysis + Dropout Score + Compare & Score (multi-doc).
   Phase 4: Image / screenshot analysis (broker app screenshots, charts, etc.)
   Phase 10: Mascot replaced with a Three.js holographic orb — a lightweight
             version always running in the launcher, a fuller version with
             MediaPipe hand-tracking (pinch-to-rotate, two-hand pinch-to-zoom)
             active only while the chat panel is open.
   Talks to a Cloudflare Worker backend — see ivaan-worker.js
   ========================================================================== */
(function () {
  // 1) Point this at your deployed Worker URL, ending in /chat
  const WORKER_URL = "https://ivaan.dinankarparmar12345.workers.dev/chat";
  const HISTORY_URL = WORKER_URL.replace(/\/chat\/?$/, "/history");
  const VISION_URL = WORKER_URL.replace(/\/chat\/?$/, "/vision");

  // PDFs are read entirely in the visitor's own browser using pdf.js —
  // nothing is uploaded anywhere, keeping this free and private. Images ARE
  // sent to the Worker (a vision model has to actually look at them), but
  // nothing is stored — only the resulting text description is kept.
  const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
  const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const MAX_PDF_PAGES = 200;
  // Document analysis now runs on a model with a real 24,000-token context
  // window (confirmed from an actual error, not a guess) — these budgets
  // leave room for the system prompt and the model's own reply within that.
  const MAX_PDF_CHARS = 55000;          // single-document mode
  const COMPARE_CHARS_PER_DOC = 12000;  // per-document cap when comparing several at once
  const MAX_COMPARE_DOCS = 5;
  const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25MB per file
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB per image
  const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

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

  // Reconstructs page text in actual visual reading order (top-to-bottom,
  // left-to-right) instead of the PDF's raw internal storage order — dense
  // financial tables otherwise come out with numbers and labels scrambled.
  function reconstructPageText(content) {
    const items = content.items;
    if (!items.length) return "";
    const yTolerance = 3;
    const lines = [];
    for (const item of items) {
      const x = item.transform[4];
      const y = item.transform[5];
      let line = lines.find((l) => Math.abs(l.y - y) <= yTolerance);
      if (!line) { line = { y, items: [] }; lines.push(line); }
      line.items.push({ x, str: item.str });
    }
    lines.sort((a, b) => b.y - a.y); // PDF y increases upward — sort top to bottom
    return lines
      .map((line) => line.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(" "))
      .join("\n");
  }

  // These specific fields have repeatedly come back missing even when
  // present in the report — so once the whole document is scanned, pages
  // that cover them get pulled in first when the budget is tight.
  const HIGH_PRIORITY_TERMS = [
    "return on equity", "roe", "return on capital employed", "roce",
    "return on investment", " roi ",
    "price to earning", "p/e ratio", "price/earning", "pe ratio",
    "price to book", "p/b ratio", "price/book", "pb ratio",
    "shareholding pattern", "promoter holding", "promoter shareholding",
  ];

  async function extractPdfText(file, charCap) {
    const cap = charCap || MAX_PDF_CHARS;
    await ensurePdfLib();
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);

    // Don't read the whole report front-to-back — only pull in pages that
    // actually relate to what the Dropout Score needs. Scan every page for
    // a match FIRST (rather than stopping once the budget fills), then fill
    // the budget starting with whichever matched pages cover the fields that
    // most often go missing — so a budget cutoff never silently skips a
    // later page holding exactly the ratio that's needed.
    const candidates = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = reconstructPageText(content);
      const lower = pageText.toLowerCase();
      if (!KEY_SECTION_TERMS.some((term) => lower.includes(term))) continue;
      const priority = HIGH_PRIORITY_TERMS.reduce((n, term) => n + (lower.includes(term) ? 1 : 0), 0);
      candidates.push({ pageNum: i, text: pageText, priority });
    }
    candidates.sort((a, b) => (b.priority - a.priority) || (a.pageNum - b.pageNum));

    let text = "";
    let matchedPages = 0;
    for (const c of candidates) {
      if (text.length > cap) break;
      text += `[Page ${c.pageNum}]\n${c.text}\n\n`;
      matchedPages++;
    }

    const truncated = pdf.numPages > pageCount || matchedPages < candidates.length || text.length > cap;
    return { text: text.slice(0, cap), truncated, pages: pdf.numPages, matchedPages };
  }

  // Terms tied directly to the four Dropout Score pillars — a page is only
  // included if it mentions at least one of these.
  const KEY_SECTION_TERMS = [
    // Business Quality & Moat
    "competitive advantage", "market leadership", "market share", "pricing power",
    "economic moat", "brand strength", "industry outlook", "sector outlook",
    "growth drivers", "business overview", "management discussion and analysis",
    // Financial Strength
    "return on equity", "return on capital employed", "roe", "roce",
    "debt to equity", "debt-equity", "net debt", "free cash flow",
    "operating cash flow", "cash flow from operat", "financial highlights",
    "year financial", "ratio analysis", "ebitda margin", "net profit margin",
    // Management Quality
    "shareholding pattern", "promoter holding", "promoter shareholding",
    "corporate governance", "board of directors", "related party",
    "code of conduct", "whistle blower", "vigil mechanism", "chairman's message",
    "managing director",
    // Valuation
    "price to earning", "price/earning", "p/e ratio", "earnings per share",
    "book value per share", "market capitalisation", "market capitalization",
    "dividend per share", "dividend payout",
  ];

  // ── Phase 4: image / screenshot reading ────────────────────────────────
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read image file"));
      reader.readAsDataURL(file);
    });
  }

  // Sends the image to the Worker's vision endpoint and gets back a text
  // transcription of everything readable in it (numbers, labels, ratios).
  async function describeImage(file) {
    const dataUrl = await fileToDataURL(file);
    const res = await fetch(VISION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Status ${res.status}: ${errText}`);
    }
    const data = await res.json();
    return data.description || "";
  }

  // ── Tiny, safe markdown-lite renderer for bot replies ─────────────────────
  // Escapes HTML first (AI text is untrusted), then supports **bold** and
  // "- " bullet lists so the Dropout Score breakdown reads cleanly.
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderMarkdownLite(text) {
    const escaped = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const lines = escaped.split("\n");
    let html = "";
    let inList = false;
    for (const line of lines) {
      const bulletMatch = line.match(/^\s*[-*]\s+(.*)/);
      if (bulletMatch) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${bulletMatch[1]}</li>`;
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        if (line.trim() === "") continue;
        html += `<p>${line}</p>`;
      }
    }
    if (inList) html += "</ul>";
    return html || escaped;
  }

  const STYLE = `
  @keyframes ai-pulse{0%,100%{box-shadow:0 0 0 0 rgba(212,175,55,.55),0 8px 26px -4px rgba(212,175,55,.55);}
    50%{box-shadow:0 0 0 10px rgba(212,175,55,0),0 8px 26px -4px rgba(212,175,55,.7);}}
  @keyframes ai-border-spin{to{--ai-angle:360deg;}}
  @property --ai-angle{syntax:'<angle>';inherits:false;initial-value:0deg;}
  @keyframes ai-dot{0%,80%,100%{opacity:.25;transform:translateY(0);}40%{opacity:1;transform:translateY(-2px);}}

  .ai-fab{position:fixed;left:26px;bottom:26px;z-index:2147483647;width:60px;height:60px;border-radius:50%;
    background:radial-gradient(circle at 35% 30%,#3a2f10,#0d0d11 70%);
    border:1.5px solid rgba(212,175,55,.6);display:flex;align-items:center;justify-content:center;
    cursor:pointer;transition:transform .3s ease;animation:ai-pulse 2.6s ease-in-out infinite;padding:0;overflow:hidden;}
  .ai-fab:hover{transform:translateY(-3px) scale(1.06);}
  .ai-fab-orb{width:100%;height:100%;display:block;}

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
  .ai-head{position:relative;padding:12px 16px;border-bottom:1px solid rgba(212,175,55,.22);
    display:flex;align-items:center;gap:10px;background:rgba(212,175,55,0.05);}
  .ai-mini-orb-dot{width:14px;height:14px;border-radius:50%;flex-shrink:0;
    background:radial-gradient(circle at 35% 30%,#f3d576,#7a6118);
    box-shadow:0 0 8px rgba(212,175,55,.6);}
  .ai-head h4{margin:0;font-family:'Playfair Display',serif;font-size:15px;color:#f6f4ee;}
  .ai-head span{display:block;font-family:'Space Mono',monospace;font-size:9.5px;letter-spacing:.1em;
    color:#d4af37;text-transform:uppercase;margin-top:2px;}
  .ai-head-dot{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 6px #4ade80;margin-left:auto;}
  .ai-clear{background:none;border:none;color:#a8a49b;cursor:pointer;font-size:10.5px;padding:4px 6px;
    font-family:'Space Mono',monospace;letter-spacing:.03em;}
  .ai-clear:hover{color:#d4af37;}
  .ai-close{background:none;border:none;color:#a8a49b;cursor:pointer;font-size:18px;line-height:1;padding:4px;margin-left:2px;}

  /* ── Orb stage — the full holographic orb, shown once the panel is open ── */
  .ai-orb-stage{position:relative;height:112px;flex-shrink:0;border-bottom:1px solid rgba(212,175,55,.18);
    background:radial-gradient(ellipse 260px 140px at 50% 45%, rgba(212,175,55,.08), transparent 70%);overflow:hidden;}
  .ai-orb-canvas{width:100%;height:100%;display:block;}

  .ai-body{position:relative;flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;}
  .ai-row{display:flex;align-items:flex-end;gap:8px;}
  .ai-row.user{justify-content:flex-end;}
  .ai-mini-face{width:22px;height:22px;flex-shrink:0;margin-bottom:2px;border-radius:50%;
    background:radial-gradient(circle at 35% 30%,#f3d576,#7a6118);box-shadow:0 0 7px rgba(212,175,55,.55);}
  .ai-msg{max-width:82%;font-size:13.5px;line-height:1.55;padding:10px 13px;border-radius:12px;white-space:pre-wrap;}
  .ai-msg.bot{background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,.15);color:#f6f4ee;}
  .ai-msg.user{background:linear-gradient(135deg,#f3d576,#d4af37);color:#1a1305;}
  .ai-msg.file{background:rgba(212,175,55,.12);border:1px dashed rgba(212,175,55,.5);color:#f3d576;
    font-family:'Space Mono',monospace;font-size:12px;}
  .ai-msg p{margin:0 0 8px;}
  .ai-msg p:last-child{margin-bottom:0;}
  .ai-msg ul{margin:2px 0 8px;padding-left:18px;}
  .ai-msg ul:last-child{margin-bottom:0;}
  .ai-msg li{margin-bottom:3px;}
  .ai-msg strong{color:#f3d576;}
  .ai-typing-dots{display:flex;gap:4px;padding:4px 2px;}
  .ai-typing-dots span{width:5px;height:5px;border-radius:50%;background:#d4af37;animation:ai-dot 1.2s infinite;}
  .ai-typing-dots span:nth-child(2){animation-delay:.15s;}
  .ai-typing-dots span:nth-child(3){animation-delay:.3s;}
  .ai-staged{position:relative;padding:0 12px;display:flex;flex-wrap:wrap;gap:6px;}
  .ai-staged:empty{padding:0;}
  .ai-staged-chip{display:flex;align-items:center;gap:6px;background:rgba(212,175,55,.12);
    border:1px dashed rgba(212,175,55,.5);color:#f3d576;font-family:'Space Mono',monospace;
    font-size:11px;padding:5px 8px;border-radius:8px;max-width:200px;}
  .ai-staged-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .ai-staged-chip button{background:none;border:none;color:#f3d576;cursor:pointer;font-size:13px;
    line-height:1;padding:0;flex-shrink:0;opacity:.7;}
  .ai-staged-chip button:hover{opacity:1;}
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

  const PAPERCLIP_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;

  function injectStyle() {
    const s = document.createElement("style");
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  // ── Phase 10: the holographic orb ────────────────────────────────────────
  // Three.js is loaded once (dynamic import — works fine inside a plain
  // script, no need for this file itself to be type="module") and shared
  // by both orb instances. The hand-tracking library is loaded separately,
  // and only when someone actually taps "Enable Hand Control".
  const BRASS = 0xc9a227;
  const BRASS_BRIGHT = 0xecc766;
  const BRASS_DEEP = 0x7a6118;

  let threePromise = null;
  function ensureThree() {
    if (!threePromise) threePromise = import("https://unpkg.com/three@0.160.0/build/three.module.js");
    return threePromise;
  }

  // Builds one orb instance bound to a canvas. `full: true` adds rings,
  // debris, dust, ticker sprites, and bloom/chromatic-aberration
  // post-processing — used for the panel stage. `full: false` (the FAB)
  // stays deliberately minimal since it runs non-stop on every page.
  async function createOrb(canvas, { full }) {
    const THREE = await ensureThree();

    const scene = new THREE.Scene();
    const getSize = () => ({ w: canvas.clientWidth || canvas.width, h: canvas.clientHeight || canvas.height });
    const { w, h } = getSize();
    const camera = new THREE.PerspectiveCamera(45, w / h || 1, 0.1, 100);
    camera.position.set(0, 0, full ? 7 : 4.2);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: full });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, full ? 2 : 1));
    renderer.setSize(w || 1, h || 1, false);

    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    const shellCount = full ? 3 : 2;
    const shells = [];
    const radii = full ? [1.5, 1.9, 2.3] : [1.1, 1.4];
    radii.slice(0, shellCount).forEach((radius, i) => {
      const geo = new THREE.IcosahedronGeometry(radius, 1);
      const wireGeo = new THREE.WireframeGeometry(geo);
      const mat = new THREE.LineBasicMaterial({ color: BRASS_BRIGHT, transparent: true, opacity: 0.45 - i * 0.1 });
      const mesh = new THREE.LineSegments(wireGeo, mat);
      mesh.userData.speed = 0.04 + i * 0.015;
      mesh.userData.axis = new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
      shells.push(mesh);
      orbGroup.add(mesh);
    });

    const coreGeo = new THREE.IcosahedronGeometry(full ? 0.55 : 0.42, full ? 2 : 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: BRASS_BRIGHT });
    const core = new THREE.Mesh(coreGeo, coreMat);
    orbGroup.add(core);
    const coreLight = new THREE.PointLight(BRASS_BRIGHT, full ? 8 : 4, 6);
    orbGroup.add(coreLight);

    let rings = [], debris = [], dust = null, tickerSprites = [];
    let composer = null, bloomPass = null;

    if (full) {
      [[2.6, 0.02, Math.PI / 2.2], [2.9, 0.015, -Math.PI / 3]].forEach(([radius, tube, tilt]) => {
        const geo = new THREE.TorusGeometry(radius, tube, 8, 80);
        const mat = new THREE.MeshBasicMaterial({ color: BRASS, transparent: true, opacity: 0.3 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = tilt;
        mesh.userData.speed = 0.01 + Math.random() * 0.015;
        rings.push(mesh);
        orbGroup.add(mesh);
      });

      for (let i = 0; i < 20; i++) {
        const pivot = new THREE.Object3D();
        pivot.rotation.x = Math.random() * Math.PI;
        pivot.rotation.y = Math.random() * Math.PI;
        const size = 0.02 + Math.random() * 0.04;
        const geo = new THREE.IcosahedronGeometry(size, 0);
        const mat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? BRASS_BRIGHT : BRASS_DEEP, transparent: true, opacity: 0.7 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.x = 2.7 + Math.random() * 1.1;
        pivot.add(mesh);
        pivot.userData.speed = (Math.random() - 0.5) * 0.02;
        debris.push(pivot);
        orbGroup.add(pivot);
      }

      const dustCount = 350;
      const dustPositions = new Float32Array(dustCount * 3);
      for (let i = 0; i < dustCount; i++) {
        const r = 4 + Math.random() * 5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        dustPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        dustPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
        dustPositions[i * 3 + 2] = r * Math.cos(phi);
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
      const dustMat = new THREE.PointsMaterial({ color: BRASS, size: 0.02, transparent: true, opacity: 0.5 });
      dust = new THREE.Points(dustGeo, dustMat);
      scene.add(dust);

      function makeTextSprite(text) {
        const c = document.createElement("canvas");
        c.width = 256; c.height = 64;
        const ctx = c.getContext("2d");
        ctx.font = "600 30px JetBrains Mono, monospace";
        ctx.fillStyle = "rgba(236,199,102,0.85)";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(text, 128, 32);
        const texture = new THREE.CanvasTexture(c);
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.75 });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(1.0, 0.26, 1);
        return sprite;
      }
      ["NIFTY", "TCS", "+2.4%", "IVAAN"].forEach((label, i, arr) => {
        const sprite = makeTextSprite(label);
        const angle = (i / arr.length) * Math.PI * 2;
        const radius = 3.4;
        sprite.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 1.6, Math.sin(angle) * radius);
        sprite.userData.baseY = sprite.position.y;
        sprite.userData.phase = Math.random() * Math.PI * 2;
        tickerSprites.push(sprite);
        scene.add(sprite);
      });

      try {
        const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { ShaderPass }, { RGBShiftShader }] = await Promise.all([
          import("https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js"),
          import("https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js"),
          import("https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js"),
          import("https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js"),
          import("https://unpkg.com/three@0.160.0/examples/jsm/shaders/RGBShiftShader.js"),
        ]);
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 1.0, 0.6, 0.2);
        composer.addPass(bloomPass);
        const rgbShift = new ShaderPass(RGBShiftShader);
        rgbShift.uniforms["amount"].value = 0.0012;
        composer.addPass(rgbShift);
      } catch {
        composer = null; // bloom is cosmetic — orb still renders fine without it
      }
    }

    let idleRotation = true;
    let targetZoom = camera.position.z;
    const clock = new THREE.Clock();
    let rafId = null;
    let running = false;

    function resize() {
      const { w, h } = getSize();
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      if (composer) composer.setSize(w, h);
    }

    function frame() {
      if (!running) return;
      rafId = requestAnimationFrame(frame);
      const t = clock.getElapsedTime();
      const delta = Math.min(clock.getDelta(), 0.05);

      shells.forEach((s) => s.rotateOnAxis(s.userData.axis, s.userData.speed * delta * 5));
      rings.forEach((r) => { r.rotation.z += r.userData.speed; });
      debris.forEach((d) => { d.rotation.y += d.userData.speed; });
      core.rotation.y += 0.3 * delta;
      core.rotation.x += 0.15 * delta;
      coreLight.intensity = (full ? 7 : 3.5) + Math.sin(t * 2) * (full ? 1.5 : 0.8);
      if (dust) dust.rotation.y += 0.01 * delta;
      tickerSprites.forEach((s) => { s.position.y = s.userData.baseY + Math.sin(t * 0.6 + s.userData.phase) * 0.15; });

      if (idleRotation) orbGroup.rotation.y += (full ? 0.12 : 0.18) * delta;
      camera.position.z += (targetZoom - camera.position.z) * 0.08;

      if (composer) composer.render(); else renderer.render(scene, camera);
    }

    return {
      start() { if (running) return; running = true; resize(); frame(); },
      stop() { running = false; if (rafId) cancelAnimationFrame(rafId); },
      resize,
      setIdle(v) { idleRotation = v; },
      rotate(dx, dy) {
        idleRotation = false;
        orbGroup.rotation.y += dx;
        orbGroup.rotation.x = THREE.MathUtils.clamp(orbGroup.rotation.x + dy, -1, 1);
      },
      zoomBy(delta) {
        const min = full ? 3.5 : 2.5, max = full ? 12 : 6;
        targetZoom = THREE.MathUtils.clamp(targetZoom - delta * 14, min, max);
      },
      resumeIdle() { idleRotation = true; },
      dispose() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        renderer.dispose();
      },
    };
  }

  function buildUI() {
    let sessionId = getSessionId();

    const fab = document.createElement("button");
    fab.className = "ai-fab";
    fab.setAttribute("aria-label", "Ask Ivaan");
    fab.innerHTML = `<canvas class="ai-fab-orb" id="ai-fab-orb"></canvas>`;

    const panel = document.createElement("div");
    panel.className = "ai-panel";
    panel.innerHTML = `
      <div class="ai-panel-inner">
        <div class="ai-head">
          <span class="ai-mini-orb-dot"></span>
          <div><h4>Ivaan</h4><span>AI Financial Assistant</span></div>
          <span class="ai-head-dot" title="Online"></span>
          <button class="ai-clear" title="Clear conversation">Clear</button>
          <button class="ai-close" aria-label="Close">✕</button>
        </div>
        <div class="ai-orb-stage" id="ai-orb-stage">
          <canvas class="ai-orb-canvas" id="ai-orb-canvas"></canvas>
        </div>
        <div class="ai-body" id="ai-body"></div>
        <div class="ai-staged" id="ai-staged"></div>
        <div class="ai-foot">
          <button class="ai-attach" type="button" title="Attach up to 5 PDFs/screenshots, add a message if you like, then hit Ask">${PAPERCLIP_SVG}</button>
          <input type="file" id="ai-file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple style="display:none">
          <input id="ai-input" type="text" placeholder="e.g. What is P/E ratio?" autocomplete="off">
          <button id="ai-send" class="ai-send-btn">Ask</button>
        </div>
        <div class="ai-disclaimer">Educational information only — not investment advice.</div>
      </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    // Lightweight orb in the launcher — runs continuously, low cost by design.
    const fabCanvas = fab.querySelector("#ai-fab-orb");
    let fabOrb = null;
    createOrb(fabCanvas, { full: false }).then((orb) => {
      fabOrb = orb;
      orb.start();
    }).catch(() => {}); // if this fails for any reason, the launcher still works, just without the orb visual

    // Fuller orb in the panel stage — only rendered while the panel is open.
    const stageCanvas = panel.querySelector("#ai-orb-canvas");
    let stageOrb = null;
    let stageOrbReady = null;

    function ensureStageOrb() {
      if (!stageOrbReady) {
        stageOrbReady = createOrb(stageCanvas, { full: true }).then((orb) => { stageOrb = orb; return orb; });
      }
      return stageOrbReady;
    }

    const clearBtn = panel.querySelector(".ai-clear");
    const closeBtn = panel.querySelector(".ai-close");
    const body = panel.querySelector("#ai-body");
    const staged = panel.querySelector("#ai-staged");
    const input = panel.querySelector("#ai-input");
    const sendBtn = panel.querySelector("#ai-send");
    const attachBtn = panel.querySelector(".ai-attach");
    const fileInput = panel.querySelector("#ai-file");

    const GREETING = "Hi, I'm Ivaan. Ask me anything about stocks, forex, crypto, options, valuation, or investing concepts. Tap the paperclip to attach a PDF and/or screenshots (up to 5) — add a message about what you want to know if you like, then hit Ask. 2+ PDFs together compares and ranks them.";

    fab.addEventListener("click", () => {
      panel.classList.toggle("open");
      const isOpen = panel.classList.contains("open");
      if (isOpen) {
        input.focus();
        ensureStageOrb().then((orb) => { orb.start(); orb.resize(); });
      } else {
        if (stageOrb) stageOrb.stop();
      }
    });
    closeBtn.addEventListener("click", () => panel.classList.remove("open"));

    let history = [];
    let pendingFiles = []; // files attached but not yet sent

    function renderStaged() {
      staged.innerHTML = "";
      pendingFiles.forEach((f, idx) => {
        const chip = document.createElement("div");
        chip.className = "ai-staged-chip";
        chip.innerHTML = `<span>📎 ${f.name}</span><button type="button" aria-label="Remove">✕</button>`;
        chip.querySelector("button").addEventListener("click", () => {
          pendingFiles.splice(idx, 1);
          renderStaged();
        });
        staged.appendChild(chip);
      });
    }

    function addRow(html, cls, isBot) {
      const row = document.createElement("div");
      row.className = "ai-row " + cls;
      row.innerHTML = isBot
        ? `<span class="ai-mini-face"></span>${html}`
        : html;
      body.appendChild(row);
      body.scrollTop = body.scrollHeight;
      return row;
    }

    function addMsg(text, cls) {
      const bubble = `<div class="ai-msg ${cls}"></div>`;
      const row = addRow(bubble, cls, cls === "bot");
      const el = row.querySelector(".ai-msg");
      if (cls === "bot") el.innerHTML = renderMarkdownLite(text);
      else el.textContent = text;
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

    function addStatus(text) {
      const row = addMsg(text, "bot");
      return {
        update(t) { row.querySelector(".ai-msg").textContent = t; },
        remove() { row.remove(); },
      };
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
    async function sendToIvaan(messagesForModel, persistLabel, maxTokens) {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesForModel,
          session_id: sessionId,
          persist_label: persistLabel || undefined,
          max_tokens: maxTokens || undefined,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Status ${res.status}: ${errText}`);
      }
      const data = await res.json();
      return data.reply || "Sorry, I couldn't get an answer just now.";
    }

    async function sendMessage() {
      const q = input.value.trim();
      const files = pendingFiles.slice();

      if (files.length === 0) {
        if (!q) return;
        addMsg(q, "user");
        history.push({ role: "user", content: q });
        input.value = "";
        sendBtn.disabled = true;
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
          sendBtn.disabled = false;
          input.focus();
        }
        return;
      }

      // Files attached — validate types/sizes before doing anything else.
      for (const f of files) {
        if (f.type !== "application/pdf" && !IMAGE_TYPES.includes(f.type)) {
          addMsg(`"${f.name}" isn't a PDF or a supported image (PNG/JPEG/WebP) — please remove it and try a different file.`, "bot");
          return;
        }
        if (f.type === "application/pdf" && f.size > MAX_PDF_BYTES) {
          addMsg(`"${f.name}" is too large (over 25MB) — try a smaller file.`, "bot");
          return;
        }
        if (IMAGE_TYPES.includes(f.type) && f.size > MAX_IMAGE_BYTES) {
          addMsg(`"${f.name}" is too large (over 8MB) — try a smaller image.`, "bot");
          return;
        }
      }

      const pdfFiles = files.filter((f) => f.type === "application/pdf");
      const imageFiles = files.filter((f) => IMAGE_TYPES.includes(f.type));
      const isCompare = pdfFiles.length > 1;
      const orderedFiles = [...pdfFiles, ...imageFiles];

      orderedFiles.forEach((f) => addFileChip(f.name));
      if (q) addMsg(q, "user");
      pendingFiles = [];
      renderStaged();
      input.value = "";
      sendBtn.disabled = true;
      attachBtn.style.opacity = ".5";
      attachBtn.style.pointerEvents = "none";

      const status = addStatus(
        isCompare
          ? `Reading report 1 of ${orderedFiles.length}: ${orderedFiles[0].name}…`
          : "Reading what you uploaded for the data that feeds the Dropout Score — this can take a moment, please hang on."
      );

      try {
        const docBlocks = [];
        const perDocCap = isCompare ? COMPARE_CHARS_PER_DOC : MAX_PDF_CHARS;

        for (let i = 0; i < orderedFiles.length; i++) {
          const f = orderedFiles[i];
          const isImage = IMAGE_TYPES.includes(f.type);
          if (orderedFiles.length > 1) status.update(`Reading ${i + 1} of ${orderedFiles.length}: ${f.name}…`);

          if (isImage) {
            try {
              const description = await describeImage(f);
              docBlocks.push(
                !description.trim()
                  ? `Screenshot: "${f.name}"\n[Could not read any text from this image.]`
                  : `Screenshot: "${f.name}"\n${description}`
              );
            } catch (err) {
              docBlocks.push(`Screenshot: "${f.name}"\n[Image analysis failed: ${err && err.message ? err.message : "unknown error"}]`);
            }
            continue;
          }

          const { text, truncated, pages, matchedPages } = await extractPdfText(f, perDocCap);
          if (!text.trim() || matchedPages === 0) {
            docBlocks.push(`Document: "${f.name}"\n[No pages matching the scoring-relevant terms were found — this may be a scanned image without selectable text, or a document that doesn't use standard annual-report terminology.]`);
            continue;
          }
          const notice = `\n[Note: this is a targeted extract — ${matchedPages} page(s) out of ${pages} total that matched scoring-relevant terms (business quality, financials, governance, valuation), not the full document.${truncated ? " Some matching pages may have been left out due to length limits." : ""}]`;
          docBlocks.push(`Document: "${f.name}"\n${text}${notice}`);
        }

        status.remove();
        const typing = addTyping();

        const userNote = q ? `\n\nThe user's specific question/note alongside these files: "${q}" — address this directly as well.` : "";
        let prompt, maxTokens, persistLabel;
        const allNames = orderedFiles.map((f) => f.name).join(", ");
        if (isCompare) {
          prompt = `[The user uploaded ${orderedFiles.length} files to compare — some may be supporting screenshots rather than separate companies, use judgment based on the labels]\n\n${docBlocks.join("\n\n---\n\n")}\n\nFor EACH company/document above, compute a Dropout Score with its full breakdown, using only what's in the extracted/transcribed text. Then give a final ranked comparison (best to worst) with a one-line reason for each ranking. If something has too little information to score fairly, say so plainly instead of guessing.${userNote}`;
          maxTokens = 1600;
          persistLabel = `[Compared ${orderedFiles.length} files: ${allNames}]${q ? ` — note: "${q}"` : ""}`;
        } else {
          const sourceDesc = imageFiles.length && pdfFiles.length
            ? "a document plus one or more supporting screenshots"
            : imageFiles.length
              ? (imageFiles.length > 1 ? "screenshots" : "a screenshot")
              : "a document";
          prompt = `[The user uploaded ${sourceDesc}: ${allNames}]\n\n${docBlocks.join("\n\n---\n\n")}\n\nAnalyze this as financial evidence about one company (combine information across all sources above): give a brief business overview, revenue/profitability trends, cash flow and debt notes, key risks and opportunities, then compute a Dropout Score with its full breakdown. If important figures aren't present anywhere in the material, say so rather than guessing.${userNote}`;
          maxTokens = 1400;
          persistLabel = `[Uploaded ${sourceDesc}: ${allNames}]${q ? ` — note: "${q}"` : ""}`;
        }

        const messagesForModel = history.slice(-4).concat([{ role: "user", content: prompt }]);
        const reply = await sendToIvaan(messagesForModel, persistLabel, maxTokens);
        typing.remove();
        addMsg(reply, "bot");
        history.push({ role: "user", content: persistLabel });
        history.push({ role: "assistant", content: reply });
      } catch (err) {
        status.remove();
        addMsg("I had trouble reading those files. Please try again — if it's a very large or complex PDF, try a shorter section.", "bot");
      } finally {
        sendBtn.disabled = false;
        attachBtn.style.opacity = "";
        attachBtn.style.pointerEvents = "";
      }
    }

    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });

    // ── Phase 3+4: attach files (staged — sent together with Ask) ──────────
    attachBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", () => {
      const picked = Array.from(fileInput.files || []);
      fileInput.value = "";
      if (picked.length === 0) return;

      if (pendingFiles.length + picked.length > MAX_COMPARE_DOCS) {
        addMsg(`You can attach up to ${MAX_COMPARE_DOCS} files at a time.`, "bot");
        return;
      }
      for (const f of picked) {
        if (f.type !== "application/pdf" && !IMAGE_TYPES.includes(f.type)) {
          addMsg(`"${f.name}" isn't a PDF or a supported image (PNG/JPEG/WebP) — skipped.`, "bot");
          continue;
        }
        pendingFiles.push(f);
      }
      renderStaged();
      input.focus();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectStyle();
    buildUI();
  });
})();

