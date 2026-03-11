/**
 * background.js  –  Talentify Service Worker (Manifest V3)
 *
 * FIX: Inlined all OpenAI logic here instead of using importScripts().
 * importScripts() with relative paths is unreliable in MV3 service workers
 * and causes "chrome-extension://invalid/" errors when the SW fails to boot.
 *
 * Responsibilities:
 *  1. Listen for messages from contentScript.js (profile data)
 *  2. Retrieve API key from chrome.storage.sync
 *  3. Call the OpenAI API directly
 *  4. Return the AI analysis to the content script
 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Reads the OpenAI API key saved by the popup.
 * @returns {Promise<string|null>}
 */
function getStoredApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["talentify_api_key"], (result) => {
      resolve(result.talentify_api_key || null);
    });
  });
}

/**
 * Builds the structured GPT prompt from parsed profile data.
 * @param {Object} profile
 * @returns {string}
 */
function buildPrompt(profile) {
  return `You are a LinkedIn recruiter and career coach.

Analyze this LinkedIn profile data (provided as JSON):
${JSON.stringify(profile, null, 2)}

Score the profile based on these categories:
- Headline clarity (0-20)
- About section quality (0-20)
- Experience strength (0-20)
- Skills relevance (0-20)
- Keyword optimization (0-20)

Return ONLY valid JSON (no markdown, no explanation), matching exactly this schema:
{
  "profileScore": <number 0-100>,
  "headlineFeedback": "<string>",
  "headlineImproved": "<string>",
  "aboutFeedback": "<string>",
  "aboutImproved": "<string>",
  "missingSkills": ["<string>"],
  "recruiterImpression": "<string>",
  "networkingTips": ["<string>"]
}`;
}

/**
 * Sends the profile to OpenAI and returns the parsed analysis JSON.
 * Throws descriptive errors so the content script can display them.
 * @param {Object} profile
 * @returns {Promise<Object>}
 */
async function analyzeProfileWithAI(profile) {
  const apiKey = await getStoredApiKey();

  if (!apiKey) {
    throw new Error(
      "No API key found. Please set your OpenAI API key in the Talentify popup."
    );
  }

  const payload = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: buildPrompt(profile) }],
    temperature: 0.4,
    max_tokens: 1000,
    response_format: { type: "json_object" },
  };

  let response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw new Error(`Network error: ${networkErr.message}`);
  }

  if (!response.ok) {
    let msg = `OpenAI error ${response.status}: ${response.statusText}`;
    try {
      const errBody = await response.json();
      if (errBody.error?.message) msg = errBody.error.message;
    } catch (_) { /* ignore */ }
    throw new Error(msg);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;

  if (!rawContent) throw new Error("OpenAI returned an empty response.");

  try {
    return JSON.parse(rawContent);
  } catch (_) {
    throw new Error("OpenAI response was not valid JSON. Please try again.");
  }
}

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ANALYZE_PROFILE") {
    analyzeProfileWithAI(message.profile)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message || String(err) }));
    return true; // keep channel open for async response
  }

  if (message.action === "SAVE_API_KEY") {
    chrome.storage.sync.set({ talentify_api_key: message.apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === "GET_API_KEY") {
    chrome.storage.sync.get(["talentify_api_key"], (result) => {
      sendResponse({ apiKey: result.talentify_api_key || "" });
    });
    return true;
  }
});
