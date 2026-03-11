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

// â”€â”€ Helpers: DOM waiting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ LinkedIn Profile Parser (inlined from linkedinParser.js) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function parseLinkedInProfile() {
  await waitForElement("h1", 8000);

  const name = document.querySelector("h1")?.innerText?.trim() || "";

  const headline =
    document.querySelector(".text-body-medium")?.innerText?.trim() || "";

  const location =
    document
      .querySelector(".text-body-small.inline.t-black--light.break-words")
      ?.innerText?.trim() || "";

  const allSections = Array.from(document.querySelectorAll("section"));

  // About â€” full text lives in aria-hidden span to avoid duplicate screen-reader reading
  const aboutSection = allSections.find((s) =>
    s.innerText?.includes("About")
  );
  const about =
    aboutSection
      ?.querySelector("span[aria-hidden='true']")
      ?.innerText?.trim() || "";

  // Experience
  const expSection = allSections.find((s) =>
    s.innerText?.includes("Experience")
  );
  const experience = expSection
    ? Array.from(expSection.querySelectorAll("li"))
        .map((li) => li.innerText?.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .slice(0, 10)
    : [];

  // Skills
  const skillsSection = allSections.find((s) =>
    s.innerText?.includes("Skills")
  );
  const skills = skillsSection
    ? Array.from(skillsSection.querySelectorAll("li"))
        .map((li) => li.innerText?.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return { name, headline, location, about, experience, skills };
}

// â”€â”€ Panel HTML builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildPanelHTML() {
  return `
    <div id="talentify-panel" role="dialog" aria-label="Talentify Profile Analyzer">
      <div class="talentify-header">
        <div class="talentify-logo">
          <span class="talentify-icon">âœ¦</span>
          <span class="talentify-brand">Talentify</span>
        </div>
        <button id="talentify-close" aria-label="Close panel" title="Close">âœ•</button>
      </div>

      <div id="talentify-body">
        <!-- Loading state -->
        <div id="talentify-loading" class="talentify-loading-wrap">
          <div class="talentify-spinner"></div>
          <p class="talentify-loading-text">Analyzing your profile with AIâ€¦</p>
        </div>

        <!-- Error state (hidden by default) -->
        <div id="talentify-error" class="talentify-error-wrap" hidden>
          <span class="talentify-error-icon">âš ï¸</span>
          <p id="talentify-error-msg" class="talentify-error-msg"></p>
          <button id="talentify-retry" class="talentify-btn-secondary">Retry</button>
        </div>

        <!-- Results state (hidden by default) -->
        <div id="talentify-results" hidden>

          <!-- Score ring -->
          <div class="talentify-score-section">
            <div class="talentify-score-ring">
              <svg viewBox="0 0 120 120" class="talentify-ring-svg">
                <circle cx="60" cy="60" r="52" class="talentify-ring-bg"/>
                <circle cx="60" cy="60" r="52" id="talentify-ring-progress" class="talentify-ring-progress"/>
              </svg>
              <div class="talentify-score-inner">
                <span id="talentify-score-num" class="talentify-score-number">â€”</span>
                <span class="talentify-score-label">/ 100</span>
              </div>
            </div>
            <p class="talentify-score-caption">Profile Score</p>
          </div>

          <!-- Recruiter Impression -->
          <div class="talentify-card">
            <h3 class="talentify-card-title">ðŸ‘¤ Recruiter Impression</h3>
            <p id="talentify-recruiter" class="talentify-card-body"></p>
          </div>

          <!-- Headline -->
          <div class="talentify-card">
            <h3 class="talentify-card-title">âœï¸ Headline</h3>
            <p class="talentify-feedback-label">Feedback</p>
            <p id="talentify-headline-feedback" class="talentify-card-body"></p>
            <p class="talentify-feedback-label improved">Improved Version</p>
            <p id="talentify-headline-improved" class="talentify-card-body improved-text"></p>
            <button class="talentify-copy-btn" data-target="talentify-headline-improved">Copy â†—</button>
          </div>

          <!-- About -->
          <div class="talentify-card">
            <h3 class="talentify-card-title">ðŸ“ About Section</h3>
            <p class="talentify-feedback-label">Feedback</p>
            <p id="talentify-about-feedback" class="talentify-card-body"></p>
            <p class="talentify-feedback-label improved">Improved Version</p>
            <p id="talentify-about-improved" class="talentify-card-body improved-text"></p>
            <button class="talentify-copy-btn" data-target="talentify-about-improved">Copy â†—</button>
          </div>

          <!-- Missing Skills -->
          <div class="talentify-card">
            <h3 class="talentify-card-title">ðŸŽ¯ Missing Skills</h3>
            <div id="talentify-missing-skills" class="talentify-skills-wrap"></div>
          </div>

          <!-- Networking Tips -->
          <div class="talentify-card">
            <h3 class="talentify-card-title">ðŸ”— Networking Tips</h3>
            <ul id="talentify-networking-tips" class="talentify-tips-list"></ul>
          </div>

          <!-- Viral Share Section -->
          <div class="talentify-share-section">
            <h3 class="talentify-share-title">ðŸš€ Share Your Score</h3>
            <p id="talentify-share-text" class="talentify-share-body"></p>
            <div class="talentify-share-actions">
              <button id="talentify-copy-result" class="talentify-btn-primary">ðŸ“‹ Copy Result</button>
              <button id="talentify-share-linkedin" class="talentify-btn-linkedin">ðŸ’¼ Share on LinkedIn</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;
}

// â”€â”€ Inject Panel into page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function injectPanel() {
  // Avoid double injection
  if (document.getElementById("talentify-host")) return;

  // 1. Create a host element to hold the Shadow DOM
  const host = document.createElement("div");
  host.id = "talentify-host";
  
  // 2. Attach Shadow DOM to isolate our HTML/CSS from LinkedIn's React app completely
  // This prevents React Hydration Error #418
  const shadow = host.attachShadow({ mode: "open" });

  // 3. Inject our inlined CSS and HTML inside the shadow root
  shadow.innerHTML = `
    <link rel="stylesheet" href="${chrome.runtime.getURL('styles.css')}">
    <div id="talentify-root">
      ${buildPanelHTML()}
    </div>
  `;

  // 4. Append host safely to document (since its inner structure is hidden, React ignores it)
  document.documentElement.appendChild(host);

  // 5. Close button logic (events must be queried from within the shadow root)
  shadow.getElementById("talentify-close").addEventListener("click", () => {
    host.remove();
    window.__talentifyInjected = false;
  });
}

// â”€â”€ Override document.getElementById queries to search inside the Shadow DOM â”€â”€
// Since renderResults() relies on standard document.getElementById, we wrap it
// so it looks inside our shadow root.
const SHADOW_ROOT = () => document.getElementById("talentify-host")?.shadowRoot;

function getEl(id) {
  return SHADOW_ROOT()?.getElementById(id);
}

// â”€â”€ Render results into the panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderResults(analysis, score) {
  // Hide loading
  getEl("talentify-loading").hidden = true;
  getEl("talentify-results").hidden = false;

  // Score ring animation
  const scoreEl = getEl("talentify-score-num");
  const ringProgress = getEl("talentify-ring-progress");
  const circumference = 2 * Math.PI * 52; // r=52
  ringProgress.style.strokeDasharray = circumference;
  ringProgress.style.strokeDashoffset = circumference; // start empty

  // Animate counter and ring
  let current = 0;
  const target = Math.min(Math.max(parseInt(score) || 0, 0), 100);
  const step = Math.ceil(target / 60);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    scoreEl.textContent = current;
    const offset = circumference - (current / 100) * circumference;
    ringProgress.style.strokeDashoffset = offset;
    // Color the ring based on score
    ringProgress.classList.toggle("ring-low", current < 40);
    ringProgress.classList.toggle("ring-mid", current >= 40 && current < 70);
    ringProgress.classList.toggle("ring-high", current >= 70);
    if (current >= target) clearInterval(timer);
  }, 20);

  // Text fields
  setText("talentify-recruiter", analysis.recruiterImpression);
  setText("talentify-headline-feedback", analysis.headlineFeedback);
  setText("talentify-headline-improved", analysis.headlineImproved);
  setText("talentify-about-feedback", analysis.aboutFeedback);
  setText("talentify-about-improved", analysis.aboutImproved);

  // Missing skills chips
  const skillsWrap = getEl("talentify-missing-skills");
  skillsWrap.innerHTML = "";
  (analysis.missingSkills || []).forEach((skill) => {
    const chip = document.createElement("span");
    chip.className = "talentify-skill-chip";
    chip.textContent = skill;
    skillsWrap.appendChild(chip);
  });
  if (!analysis.missingSkills?.length) {
    skillsWrap.textContent = "âœ… No obvious gaps!";
  }

  // Networking tips
  const tipsList = getEl("talentify-networking-tips");
  tipsList.innerHTML = "";
  (analysis.networkingTips || []).forEach((tip) => {
    const li = document.createElement("li");
    li.textContent = tip;
    tipsList.appendChild(li);
  });

  // Share text
  const shareText = `My LinkedIn profile scored ${target}/100 using Talentify AI.\nImprove yours here â†’ https://talentify.ai`;
  getEl("talentify-share-text").textContent = shareText;

  // Copy result button
  getEl("talentify-copy-result").addEventListener("click", () => {
    copyToClipboard(shareText, getEl("talentify-copy-result"));
  });

  // Share on LinkedIn button
  getEl("talentify-share-linkedin").addEventListener("click", () => {
    const encodedText = encodeURIComponent(shareText);
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Ftalentify.ai&summary=${encodedText}`,
      "_blank"
    );
  });

  // Generic copy buttons
  SHADOW_ROOT().querySelectorAll(".talentify-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const text = getEl(targetId)?.textContent || "";
      copyToClipboard(text, btn);
    });
  });
}

function setText(id, value) {
  const el = getEl(id);
  if (el) el.textContent = value || "â€”";
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = "âœ“ Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("copied");
    }, 2000);
  });
}

// â”€â”€ Show error in panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showError(message) {
  getEl("talentify-loading").hidden = true;
  const errWrap = getEl("talentify-error");
  errWrap.hidden = false;
  getEl("talentify-error-msg").textContent = message;

  getEl("talentify-retry").addEventListener("click", () => {
    errWrap.hidden = true;
    getEl("talentify-loading").hidden = false;
    runAnalysis();
  });
}

// â”€â”€ Core analysis flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function runAnalysis() {
  try {
    const profile = await parseLinkedInProfile();
    // Guard: if the extension was reloaded/updated while this tab was open,
    // chrome.runtime.id becomes undefined â€” catch this before sending a message
    // to avoid the "chrome-extension://invalid/" net::ERR_FAILED error.
    if (!chrome.runtime?.id) {
      showError(
        "Extension was reloaded. Please refresh this page and try again."
      );
      return;
    }

    // Send to background service worker for secure API call
    chrome.runtime.sendMessage(
      { action: "ANALYZE_PROFILE", profile },
      (response) => {
        if (chrome.runtime.lastError) {
          showError(
            "Could not reach background script: " +
              chrome.runtime.lastError.message
          );
          return;
        }
        if (!response || !response.success) {
          showError(response?.error || "Unknown error from AI service.");
          return;
        }
        renderResults(response.data, response.data.profileScore);
      }
    );
  } catch (err) {
    showError(err.message || "Failed to parse LinkedIn profile.");
  }
}

// â”€â”€ Entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function initTalentify() {
  // Wait for at least the main profile heading before doing anything
  await waitForElement("h1", 10000);

  injectPanel();
  runAnalysis();
}


})();
