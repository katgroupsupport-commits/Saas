import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

type AgentRequest = {
  question: string;
  messages?: AgentMessage[];
  context?: Record<string, unknown>;
};

const MODEL = "gpt-4.1-mini";

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function textFromResponse(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = (payload?.output || [])
    .flatMap((item: any) => item?.content || [])
    .map((content: any) => content?.text || "")
    .filter(Boolean);
  return parts.join("\n").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return jsonResponse({ error: "Missing authorization." }, 401);

    const openAiKey = requiredEnv("OPENAI_API_KEY");
    const body = await req.json() as AgentRequest;
    const question = String(body.question || "").trim();
    if (!question) return jsonResponse({ error: "Question is required." }, 400);

    const recentMessages = (body.messages || [])
      .slice(-8)
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n");

    const financeContext = JSON.stringify(body.context || {}, null, 2).slice(0, 18000);
    const input = [
      {
        role: "system",
        content: [
          "You are the Finance Assistant for Bachat Gat Finance Platform.",
          "Answer using only the finance context supplied by the app.",
          "Be concise, practical, and careful with INR amounts.",
          "Migrated savings are opening savings. Migrated principal, interest, and penalty are opening dues, not collected income.",
          "Pending interest or penalty must never be described as group gain until collected.",
          "You are read-only. Do not claim that you posted transactions, approved items, changed data, or contacted members.",
          "If data is missing, say what is missing and what screen/action the user should check."
        ].join(" ")
      },
      {
        role: "user",
        content: [
          "Finance context:",
          financeContext,
          recentMessages ? `Recent conversation:\n${recentMessages}` : "",
          `Current question:\n${question}`
        ].filter(Boolean).join("\n\n")
      }
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        input,
        temperature: 0.2,
        max_output_tokens: 900
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      return jsonResponse({
        error: payload?.error?.message ?? "AI agent request failed.",
        details: payload
      }, 502);
    }

    const answer = textFromResponse(payload);
    return jsonResponse({
      answer: answer || "I could not generate an answer from the supplied context.",
      model: MODEL
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to run finance agent." }, 500);
  }
});
