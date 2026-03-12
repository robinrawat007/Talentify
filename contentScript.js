/**
 * contentScript.js  –  Talentify
 *
 * Injected on every LinkedIn /in/* profile page.
 */

(function() {
if (window.__talentifyInjected) {
  window.dispatchEvent(new CustomEvent('talentify_re_analyze'));
  return;
}
window.__talentifyInjected = true;
let isAnalyzing = false; // Declared here so all handlers below can access it safely

window.addEventListener('talentify_re_analyze', () => {
  isAnalyzing = false; // Reset so re-trigger always works
  if (document.getElementById("talentify-host")) {
    runAnalysis();
  } else {
    initTalentify();
  }
});

// Listen for messages from the popup's Analyze button
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "TRIGGER_ANALYSIS") {
    // Reset so a second click always works, even if a previous run is stuck
    isAnalyzing = false;
    if (document.getElementById("talentify-host")) {
      runAnalysis();
    } else {
      initTalentify();
    }
  }
});

// ── Helpers: DOM waiting ───────────────────────────────────────────────────
function waitForElement(selector, timeout = 8000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const obs = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        obs.disconnect();
        resolve(found);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      resolve(null);
    }, timeout);
  });
}

// ── LinkedIn Profile Parser ──────────────────────────────────────────────────
async function parseLinkedInProfile() {
  await waitForElement("h1", 8000);

  const name = document.querySelector("h1")?.innerText?.trim() || "";
  const headline = document.querySelector(".text-body-medium")?.innerText?.trim() || "";
  
  const allSections = Array.from(document.querySelectorAll("section"));

  // About
  const aboutSection = allSections.find((s) => s.innerText?.includes("About"));
  const about = aboutSection?.querySelector("span[aria-hidden='true']")?.innerText?.trim() || "";

  // Experience
  const expSection = allSections.find((s) => s.innerText?.includes("Experience"));
  const experience = expSection
    ? Array.from(expSection.querySelectorAll("li"))
        .map((li) => li.innerText?.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .slice(0, 10)
    : [];

  // Skills
  const skillsSection = allSections.find((s) => s.innerText?.includes("Skills"));
  const skills = skillsSection
    ? Array.from(skillsSection.querySelectorAll("li"))
        .map((li) => li.innerText?.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return { name, headline, about, experience, skills };
}

// ── Panel HTML builder ───────────────────────────────────────────────────────
function buildPanelHTML() {
  return `
    <div id="talentify-panel" role="dialog" aria-label="Talentify Profile Analyzer">
      <div class="talentify-header">
        <div class="talentify-logo">
          <span class="talentify-icon">✦</span>
          <span class="talentify-brand">Talentify</span>
        </div>
        <button id="talentify-close" aria-label="Close panel" title="Close">✕</button>
      </div>

      <div id="talentify-body">
        <div id="talentify-loading" class="talentify-loading-wrap">
          <div class="talentify-spinner"></div>
          <p class="talentify-loading-text">Analyzing profile...</p>
        </div>

        <div id="talentify-error" class="talentify-error-wrap" hidden>
          <span class="talentify-error-icon">⚠️</span>
          <p id="talentify-error-msg" class="talentify-error-msg"></p>
          <button id="talentify-retry" class="talentify-btn-secondary">Retry</button>
        </div>

        <div id="talentify-results" hidden>
          <div class="talentify-score-section">
            <div class="talentify-score-ring">
              <svg viewBox="0 0 120 120" class="talentify-ring-svg">
                <circle cx="60" cy="60" r="52" class="talentify-ring-bg"/>
                <circle cx="60" cy="60" r="52" id="talentify-ring-progress" class="talentify-ring-progress"/>
              </svg>
              <div class="talentify-score-inner">
                <span id="talentify-score-num" class="talentify-score-number">—</span>
                <span class="talentify-score-label">/ 100</span>
              </div>
            </div>
            <p class="talentify-score-caption">Profile Score</p>
          </div>

          <div class="talentify-card">
            <h3 class="talentify-card-title">🛡️ Recruiter Visibility</h3>
            <div id="talentify-visibility" class="talentify-visibility-badge">Calculating...</div>
          </div>

          <div class="talentify-card">
            <h3 class="talentify-card-title">🚀 Improvement Suggestions</h3>
            <ul id="talentify-improvements" class="talentify-tips-list"></ul>
          </div>

          <div class="talentify-share-section">
            <button id="talentify-copy-result" class="talentify-btn-primary">📋 Copy Results</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Inject Panel ─────────────────────────────────────────────────────────────
function injectPanel() {
  if (document.getElementById("talentify-host")) return;

  const host = document.createElement("div");
  host.id = "talentify-host";
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      #talentify-root {
        position: fixed; top: 80px; right: 20px; z-index: 999999;
        width: 380px; max-height: calc(100vh - 100px);
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        font-size: 14px; line-height: 1.5;
      }
      #talentify-panel {
        background: #0d0d1a; border: 1px solid #2a2a45; border-radius: 18px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(108,71,255,0.15), inset 0 1px 0 rgba(255,255,255,0.05);
        overflow: hidden;
        animation: talentify-slide-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
      }
      @keyframes talentify-slide-in {
        from { opacity:0; transform:translateX(40px) scale(0.96); }
        to   { opacity:1; transform:translateX(0) scale(1); }
      }
      .talentify-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:14px 18px 12px;
        background: linear-gradient(135deg,#6c47ff 0%,#a855f7 100%);
      }
      .talentify-logo { display:flex; align-items:center; gap:8px; }
      .talentify-icon { font-size:20px; color:#fff; line-height:1; }
      .talentify-brand { font-size:18px; font-weight:700; color:#fff; letter-spacing:-0.3px; }
      #talentify-close {
        background:rgba(255,255,255,0.15); border:none; color:#fff;
        width:28px; height:28px; border-radius:50%; cursor:pointer;
        font-size:14px; display:flex; align-items:center; justify-content:center;
        transition:background 0.2s, transform 0.15s; line-height:1;
      }
      #talentify-close:hover { background:rgba(255,255,255,0.3); transform:rotate(90deg); }
      #talentify-body {
        max-height:calc(100vh - 200px); overflow-y:auto; padding:16px;
        display:flex; flex-direction:column; gap:12px;
        scrollbar-width:thin; scrollbar-color:#2a2a45 transparent;
      }
      .talentify-loading-wrap {
        display:flex; flex-direction:column; align-items:center;
        justify-content:center; gap:14px; padding:32px 0;
      }
      .talentify-spinner {
        width:44px; height:44px; border:3px solid #1e1e35;
        border-top-color:#6c47ff; border-right-color:#a855f7;
        border-radius:50%; animation:talentify-spin 0.8s linear infinite;
      }
      @keyframes talentify-spin { to { transform:rotate(360deg); } }
      .talentify-loading-text { color:#8b8ba8; font-size:13px; }
      .talentify-error-wrap {
        display:flex; flex-direction:column; align-items:center; gap:10px;
        padding:24px 16px; background:#1a0a0a; border:1px solid #5a1515;
        border-radius:12px; text-align:center;
      }
      .talentify-error-icon { font-size:28px; }
      .talentify-error-msg { color:#fca5a5; font-size:13px; }
      .talentify-btn-secondary {
        padding:8px 20px; border-radius:8px; border:1px solid #6c47ff;
        background:transparent; color:#a48bff; font-size:13px; font-weight:600;
        cursor:pointer; transition:background 0.2s;
      }
      .talentify-btn-secondary:hover { background:#6c47ff22; }
      .talentify-score-section { display:flex; flex-direction:column; align-items:center; gap:4px; padding:12px 0; }
      .talentify-score-ring { position:relative; width:120px; height:120px; }
      .talentify-ring-svg { width:100%; height:100%; transform:rotate(-90deg); }
      .talentify-ring-bg { fill:none; stroke:#1e1e35; stroke-width:10; }
      .talentify-ring-progress { fill:none; stroke:#6c47ff; stroke-width:10; stroke-linecap:round; transition:stroke-dashoffset 0.05s linear, stroke 0.3s; }
      .talentify-ring-progress.ring-low { stroke:#ef4444; }
      .talentify-ring-progress.ring-mid { stroke:#f59e0b; }
      .talentify-ring-progress.ring-high { stroke:#22c55e; }
      .talentify-score-inner { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
      .talentify-score-number { font-size:32px; font-weight:800; color:#e8e8f0; line-height:1; }
      .talentify-score-label { font-size:11px; color:#8b8ba8; margin-top:2px; }
      .talentify-score-caption { font-size:12px; color:#8b8ba8; text-transform:uppercase; letter-spacing:0.8px; font-weight:600; }
      .talentify-card { background:#13131f; border:1px solid #2a2a40; border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:8px; transition:border-color 0.2s; }
      .talentify-card:hover { border-color:#6c47ff44; }
      .talentify-card-title { font-size:13px; font-weight:700; color:#c4b5fd; margin:0; }
      .talentify-tips-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; }
      .talentify-tips-list li { font-size:13px; color:#c8c8d8; padding-left:18px; position:relative; }
      .talentify-tips-list li::before { content:"→"; position:absolute; left:0; color:#6c47ff; }
      .talentify-share-section { background:linear-gradient(135deg,#1a0f35 0%,#0f1a2e 100%); border:1px solid #6c47ff44; border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:10px; }
      .talentify-btn-primary { flex:1; padding:9px; border-radius:9px; border:none; background:linear-gradient(135deg,#6c47ff,#a855f7); color:#fff; font-size:13px; font-weight:600; cursor:pointer; transition:opacity 0.2s, transform 0.15s; width:100%; }
      .talentify-btn-primary:hover { opacity:0.9; transform:translateY(-1px); }
      .talentify-visibility-badge { display:inline-block; padding:4px 12px; border-radius:99px; font-size:12px; font-weight:700; background:#1e1e35; color:#c4b5fd; border:1px solid #2a2a55; }
      .talentify-visibility-badge.low { background:#2a0a0a; color:#fca5a5; border-color:#5a1515; }
      .talentify-visibility-badge.medium { background:#1a1a0a; color:#fde68a; border-color:#5a5015; }
      .talentify-visibility-badge.high { background:#0a2a0a; color:#86efac; border-color:#155a15; }
    </style>
    <div id="talentify-root">
      ${buildPanelHTML()}
    </div>
  `;

  document.documentElement.appendChild(host);

  shadow.getElementById("talentify-close").addEventListener("click", () => {
    host.remove();
    window.__talentifyInjected = false;
  });
}

const SHADOW_ROOT = () => document.getElementById("talentify-host")?.shadowRoot;
function getEl(id) { return SHADOW_ROOT()?.getElementById(id); }

// ── Render results ───────────────────────────────────────────────────────────
function renderResults(analysis, score) {
  getEl("talentify-loading").hidden = true;
  getEl("talentify-results").hidden = false;

  const scoreEl = getEl("talentify-score-num");
  const ringProgress = getEl("talentify-ring-progress");
  const circumference = 2 * Math.PI * 52;
  ringProgress.style.strokeDasharray = circumference;

  let current = 0;
  const target = Math.min(Math.max(parseInt(score) || 0, 0), 100);
  const step = Math.ceil(target / 60);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    scoreEl.textContent = current;
    const offset = circumference - (current / 100) * circumference;
    ringProgress.style.strokeDashoffset = offset;
    ringProgress.classList.toggle("ring-low", current < 40);
    ringProgress.classList.toggle("ring-mid", current >= 40 && current < 70);
    ringProgress.classList.toggle("ring-high", current >= 70);
    if (current >= target) clearInterval(timer);
  }, 20);

  const visEl = getEl("talentify-visibility");
  visEl.textContent = analysis.recruiterVisibility || "Unknown";
  visEl.className = "talentify-visibility-badge " + (analysis.recruiterVisibility?.toLowerCase() || "");

  const impList = getEl("talentify-improvements");
  impList.innerHTML = "";
  (analysis.improvements || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    impList.appendChild(li);
  });

  const shareText = `Talentify AI Profile Score: ${target}/100\nVisibility: ${analysis.recruiterVisibility}\nSuggestions: ${analysis.improvements?.join(", ")}`;
  getEl("talentify-copy-result").onclick = () => {
    navigator.clipboard.writeText(shareText).then(() => {
      const btn = getEl("talentify-copy-result");
      const original = btn.textContent;
      btn.textContent = "✓ Copied!";
      setTimeout(() => btn.textContent = original, 2000);
    });
  };
}

function showError(message) {
  getEl("talentify-loading").hidden = true;
  getEl("talentify-error").hidden = false;
  getEl("talentify-error-msg").textContent = message;
  getEl("talentify-retry").onclick = () => {
    getEl("talentify-error").hidden = true;
    getEl("talentify-loading").hidden = false;
    runAnalysis();
  };
}

// ── Core Analysis Flow ───────────────────────────────────────────────────────
async function runAnalysis() {
  if (isAnalyzing) return;
  isAnalyzing = true;

  try {
    // Ensure the panel exists in the DOM before touching its elements
    if (!document.getElementById("talentify-host")) {
      injectPanel();
    }

    const profile = await parseLinkedInProfile();
    console.log("[Talentify] Profile parsed:", profile);

    if (!chrome.runtime?.id) {
      showError("Extension reloaded. Please refresh.");
      isAnalyzing = false;
      return;
    }

    getEl("talentify-loading").hidden = false;
    getEl("talentify-results").hidden = true;
    getEl("talentify-error").hidden = true;

    // 30-second timeout in case Supabase/Groq hangs
    const timeout = setTimeout(() => {
      if (isAnalyzing) {
        isAnalyzing = false;
        showError("Analysis timed out. Please try again.");
      }
    }, 30000);

    chrome.runtime.sendMessage({ action: "ANALYZE_PROFILE", profile }, (response) => {
      clearTimeout(timeout);
      isAnalyzing = false;
      console.log("[Talentify] Response:", response);
      if (chrome.runtime.lastError) {
        showError("Connection lost: " + chrome.runtime.lastError.message);
        return;
      }
      if (!response || !response.success) {
        showError(response?.error || "AI error.");
        return;
      }
      renderResults(response.data, response.data.score);
    });
  } catch (err) {
    isAnalyzing = false;
    console.error("[Talentify] Error:", err);
    showError(err.message || "Parse failed.");
  }
}

// ── SPA Navigation ───────────────────────────────────────────────────────────
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (location.href.includes("/in/")) {
      if (document.getElementById("talentify-host")) {
        runAnalysis();
      } else {
        initTalentify();
      }
    } else {
      document.getElementById("talentify-host")?.remove();
      window.__talentifyInjected = false;
    }
  }
});
urlObserver.observe(document.documentElement, { childList: true, subtree: true });

async function initTalentify() {
  if (!location.href.includes("/in/")) return;
  await waitForElement("h1", 10000);
  injectPanel();
  runAnalysis();
}

initTalentify();

})();
