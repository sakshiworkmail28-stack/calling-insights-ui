import axios from "axios";

const SYSTEM_PROMPT = `You are an expert at extracting professional profile data.

From the following text, extract:

- current_company (most recent / current role only)
- current_role
- previous_company (if mentioned, e.g. "Ex-CompanyName" or "formerly at CompanyName")
- years_of_experience (number or null)
- function (one of: marketing, finance, product, sales, tech, hr, operations, consulting, legal, leadership, other)
- confidence (high / medium / low)

Rules:
- Prioritize CURRENT role over past roles
- If "Ex-" appears before a company name, treat it as previous_company, NOT current_company
- Ignore partial or broken phrases
- If unclear, return null (do not guess)
- Do NOT invent or hallucinate any values

Return JSON only. No markdown, no explanation.`;

export async function POST(request: Request) {
  const { summary } = await request.json();

  if (!summary || typeof summary !== "string") {
    return Response.json({
      current_company: null,
      current_role: null,
      previous_company: null,
      years_of_experience: null,
      function: null,
      confidence: "low",
    });
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Text:\n${summary}` },
        ],
        temperature: 0,
        max_tokens: 300,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const raw = response.data.choices?.[0]?.message?.content ?? "{}";
    // Strip markdown fences if present
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const extracted = JSON.parse(cleaned);

    return Response.json({
      current_company: extracted.current_company ?? null,
      current_role: extracted.current_role ?? null,
      previous_company: extracted.previous_company ?? null,
      years_of_experience: extracted.years_of_experience ?? null,
      function: extracted.function ?? null,
      confidence: extracted.confidence ?? "low",
    });
  } catch {
    return Response.json(
      {
        current_company: null,
        current_role: null,
        previous_company: null,
        years_of_experience: null,
        function: null,
        confidence: "low",
        error: "LLM extraction failed",
      },
      { status: 200 }
    );
  }
}
