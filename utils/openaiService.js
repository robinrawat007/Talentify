/**
 * openaiService.js
 * Handles all communication with the OpenAI Chat Completions API.
 * The API key is read from chrome.storage.sync so it is NEVER hardcoded.
 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Builds the structured prompt sent to GPT.
 * Returns JSON-only instructions so we can parse the response reliably.
 * @param {Object} profile - parsed LinkedIn profile data
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
  "missingSkills": ["<string>", ...],
  "recruiterImpression": "<string>",
  "networkingTips": ["<string>", ...]
}`;
}

/**
 * Retrieves the stored API key from chrome.storage.sync.
 * @returns {Promise<string|null>}
 */
async function getStoredApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["talentify_api_key"], (result) => {
      resolve(result.talentify_api_key || null);
    });
  });
}

/**
 * Sends the profile to the OpenAI API and returns the parsed AI analysis.
 * Throws a descriptive error on failure so the UI can show it.
 * @param {Object} profile - structured profile object from linkedinParser
 * @returns {Promise<Object>} - parsed AI analysis JSON
 */
async function analyzeProfileWithAI(profile) {
  const apiKey = await getStoredApiKey();

  if (!apiKey) {
    throw new Error(
      "No API key found. Please set your OpenAI API key in the Talentify popup."
    );
  }

  const payload = {
    model: "gpt-4o-mini", // cost-effective default; can be changed to gpt-4o
    messages: [
      {
        role: "user",
        content: buildPrompt(profile),
      },
    ],
    temperature: 0.4, // lower = more deterministic, structured output
    max_tokens: 1000,
    response_format: { type: "json_object" }, // force JSON mode (supported by gpt-4o-mini+)
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
  } catch (networkError) {
    throw new Error(
      `Network error when calling OpenAI: ${networkError.message}`
    );
  }

  if (!response.ok) {
    let errMsg = `OpenAI API error: ${response.status} ${response.statusText}`;
    try {
      const errBody = await response.json();
      if (errBody.error?.message) errMsg = errBody.error.message;
    } catch (_) {
      // ignore parse error on error body
    }
    throw new Error(errMsg);
  }

  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    throw new Error("Failed to parse response from OpenAI.");
  }

  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("OpenAI returned an empty response.");
  }

  let analysis;
  try {
    analysis = JSON.parse(rawContent);
  } catch (_) {
    throw new Error("OpenAI response was not valid JSON. Try again.");
  }

  return analysis;
}

// Expose for the background service worker (importScripts / module approach not needed in MV3 SW)
// The background.js imports this via the globalThis trick below.
globalThis.analyzeProfileWithAI = analyzeProfileWithAI;
globalThis.getStoredApiKey = getStoredApiKey;
