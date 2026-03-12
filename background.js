/**
 * background.js  –  Talentify Service Worker (Manifest V3)
 *
 * Routes all AI analysis requests through a secure Supabase Edge Function.
 * The OpenAI API key never touches the extension — it lives in Supabase Secrets.
 */

const SUPABASE_FUNCTION_URL = "https://rgzsifpftjyicwlwkzlo.supabase.co/functions/v1/analyze-profile";

// Public anon key — safe to include here (this is NOT the secret/service_role key)
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnenNpZnBmdGp5aWN3bHdremxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyOTI5ODEsImV4cCI6MjA4ODg2ODk4MX0.tnriJrwPFgqMRzhLbGKXTR8fNVgFPaxgA6nyFzLCkfQ";

/**
 * Sends profile data to the Supabase Edge Function for analysis.
 */
async function analyzeProfileWithBackend(profile) {
  try {
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(profile),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend error: ${response.status} - ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    console.error("Analysis Failed:", err);
    throw err;
  }
}

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ANALYZE_PROFILE") {
    analyzeProfileWithBackend(message.profile)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message || "Failed to analyze profile via backend." }));
    return true; // keep channel open for async response
  }
});
