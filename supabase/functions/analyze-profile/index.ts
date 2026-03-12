// analyze-profile/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Groq is OpenAI-compatible & FREE — 14,400 requests/day
const AI_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const AI_MODEL = "llama-3.3-70b-versatile";

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

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY secret is not set in Supabase." }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const systemPrompt = `You are an expert LinkedIn career coach and recruiter. Analyze LinkedIn profile data and return a JSON assessment.

Return ONLY a valid JSON object. No markdown, no code fences, no explanation.
Required JSON structure:
{
  "score": <integer 0-100>,
  "recruiterVisibility": "Low" | "Medium" | "High",
  "improvements": ["tip1", "tip2", "tip3", "tip4"],
  "recruiterImpression": "<one sentence first impression>"
}

Scoring guide:
- 85-100: Excellent — strong headline, detailed About, 5+ jobs, education, 15+ skills
- 65-84: Good — most sections filled, minor gaps
- 45-64: Average — some key sections present but incomplete
- 25-44: Below average — minimal info, missing critical sections
- 10-24: Poor — barely any data (only name or title visible)
- 0-9: Reserve for a completely empty profile (no name, no title, nothing)

IMPORTANT: If the profile has a name OR a headline OR any experience entries, the minimum score is 15.
Always provide 4 specific, actionable improvement suggestions relevant to what is actually missing.`;

    const userPrompt = `Profile data to analyze:
${JSON.stringify(profile, null, 2)}

Return the JSON assessment now.`;

    const aiRes = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
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

    // Strip any accidental markdown fences
    let jsonStr = content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    const result = JSON.parse(jsonStr);

    // Sanitize score
    if (typeof result.score !== "number") {
      result.score = parseInt(String(result.score)) || 10;
    }
    result.score = Math.min(Math.max(Math.round(result.score), 0), 100);

    // Ensure improvements is always an array
    if (!Array.isArray(result.improvements)) {
      result.improvements = [result.improvements || "Complete your profile sections for better visibility."];
    }

    return new Response(JSON.stringify(result), { headers: CORS_HEADERS });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: CORS_HEADERS }
    );
  }
});
