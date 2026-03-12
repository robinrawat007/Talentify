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

window.addEventListener('talentify_re_analyze', () => {
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
    <link rel="stylesheet" href="${chrome.runtime.getURL('styles.css')}">
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
let isAnalyzing = false;
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
