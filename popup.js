/**
 * popup.js  –  Talentify Extension Popup
 *
 * Responsibilities:
 *  1. Load saved API key from storage and populate the input
 *  2. Save API key to storage via background script
 *  3. Detect if active tab is a LinkedIn profile page
 *  4. Trigger profile analysis (inject & run content script) on demand
 */

// ── Query current tab ─────────────────────────────────────────────────────────
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Returns true if the URL is a LinkedIn /in/ profile page */
function isLinkedInProfile(url = "") {
  return /https?:\/\/(www\.)?linkedin\.com\/in\//.test(url);
}

// ── Toast helper ──────────────────────────────────────────────────────────────
function showToast(message, type = "success", duration = 3000) {
  const toast = document.getElementById("popup-toast");
  toast.textContent = message;
  toast.className = type;
  toast.style.display = "block";
  setTimeout(() => (toast.style.display = "none"), duration);
}

// ── Initialise popup state ────────────────────────────────────────────────────
async function init() {
  const tab = await getCurrentTab();
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const analyzeBtn = document.getElementById("btn-analyze");

  if (isLinkedInProfile(tab?.url)) {
    statusDot.className = "status-dot active";
    statusText.textContent = "LinkedIn profile detected ✓";
    analyzeBtn.disabled = false;
  } else {
    statusDot.className = "status-dot inactive";
    statusText.textContent = "Open a LinkedIn profile page to analyze";
    analyzeBtn.disabled = true;
  }
}

// ── Analyze current profile ───────────────────────────────────────────────────
document.getElementById("btn-analyze").addEventListener("click", async () => {
  const tab = await getCurrentTab();
  if (!tab?.id || !isLinkedInProfile(tab.url)) {
    showToast("Navigate to a LinkedIn profile first.", "error");
    return;
  }

  // Inject the content script programmatically (in case it wasn't auto-injected)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["contentScript.js"],
    });
    showToast("Analyzing profile…", "success");
    window.close(); // close popup so the panel is visible
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
