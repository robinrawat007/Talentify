// analyze-profile/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Groq is OpenAI-compatible & FREE
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

    const systemPrompt = `You are an expert LinkedIn career coach and recruiter. Analyze the provided LinkedIn profile data and return a detailed JSON assessment based on the following 100-point weighted scoring model:

1. Profile Strength (20 pts): Headline quality, Profile photo presence, Banner presence.
2. About Section (15 pts): Keyword density, clarity of value proposition, length.
3. Experience (20 pts): Measurable achievements, role clarity, tech stack presence.
4. Skills (15 pts): Number of relevant skills, endorsement context.
5. Social Proof (10 pts): Number of recommendations, featured section links (GitHub/Portfolio).
6. Network Strength (10 pts): Connection count, perceived recruiter network.
7. Activity (10 pts): Posting frequency, engagement indicators.

REQUIRED JSON FORMAT:
{
  "score": <total_integer_0_100>,
  "breakdown": {
    "profileStrength": <0_20>,
    "about": <0_15>,
    "experience": <0_20>,
    "skills": <0_15>,
    "socialProof": <0_10>,
    "network": <0_10>,
    "activity": <0_10>
  },
  "recruiterVisibility": "Low" | "Medium" | "High",
  "recruiterImpression": "<One sentence first impression>",
  "improvements": ["<specific actionable tip>", "<specific actionable tip>", "<specific actionable tip>", "<specific actionable tip>"]
}

Guidelines:
- Analyze headline effectiveness and search visibility.
- Look for credibility signals and missing sections.
- Return ONLY the JSON object. No markdown, no fences.`;

    const userPrompt = `Analyze this profile data for the weighted score:
${JSON.stringify(profile, null, 2)}

Ensure the total score is the sum of the breakdown components. Provide specific, high-impact improvements.`;

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
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok || aiData.error) {
      return new Response(
        JSON.stringify({ error: aiData.error?.message || "AI API error" }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const content = aiData?.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), { status: 502, headers: CORS_HEADERS });
    }

    // Robust JSON parsing
    let jsonStr = content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    const result = JSON.parse(jsonStr);

    // Final sanity check on score
    if (typeof result.score !== "number") {
      const sum = Object.values(result.breakdown || {}).reduce((a: any, b: any) => a + b, 0);
      result.score = sum || 15;
    }
    result.score = Math.min(Math.max(Math.round(result.score), 0), 100);

    return new Response(JSON.stringify(result), { headers: CORS_HEADERS });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: CORS_HEADERS }
    );
  }
});
