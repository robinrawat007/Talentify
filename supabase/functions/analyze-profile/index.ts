// analyze-profile/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Groq is OpenAI-compatible & FREE — 14,400 requests/day
const AI_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const AI_MODEL = "llama-3.3-70b-versatile"; // Free, fast, and capable

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const profile = await req.json();

    // Reads from Supabase Secrets — never exposed to the extension
    const apiKey = Deno.env.get("GROQ_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY secret is not set in Supabase." }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const prompt = `You are a professional LinkedIn coach. Analyze this profile and return ONLY a valid JSON object (no markdown, no explanation):
${JSON.stringify(profile)}

{
  "score": <number 0-100>,
  "improvements": ["<actionable tip>", "<actionable tip>", "<actionable tip>"],
  "recruiterVisibility": "Low" or "Medium" or "High",
  "recruiterImpression": "<one sentence first impression a recruiter would have>"
}`;

    const aiRes = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        response_format: { type: "json_object" },
      }),
    });

    const aiData = await aiRes.json();

    if (!aiRes.ok || aiData.error) {
      return new Response(
        JSON.stringify({ error: aiData.error?.message || "AI API error", details: aiData }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const content = aiData?.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(
        JSON.stringify({ error: "Empty AI response", raw: aiData }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const result = JSON.parse(content);
    return new Response(JSON.stringify(result), { headers: CORS_HEADERS });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: CORS_HEADERS }
    );
  }
});
