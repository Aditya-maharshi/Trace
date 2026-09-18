/**
 * app/api/chat/route.ts
 *
 * Streaming SSE chat endpoint.
 * Accepts the attribution context + a user question via POST body.
 * Returns an SSE stream of { token } and { citation } events.
 *
 * SSE event types:
 *   event: token     data: { "token": "..." }
 *   event: citation  data: { "pathIndex": 0, "hopIndex": 2, "address": "0x..." }
 *   event: done      data: {}
 *   event: error     data: { "message": "..." }
 */

import { NextRequest } from "next/server";

export async function POST(req: NextRequest): Promise<Response> {
  let body: { question?: string; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { 
      status: 400, 
      headers: { "Content-Type": "application/json" } 
    });
  }

  const { question, context } = body;

  if (!question || !context) {
    return new Response(JSON.stringify({ error: "Missing question or context" }), { 
      status: 400, 
      headers: { "Content-Type": "application/json" } 
    });
  }

  try {
    // 1. Call External Chatbot API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const apiKey = process.env.EXTERNAL_CHATBOT_API_KEY || "mock-key";
    const externalApiUrl = "https://api.adityabot.com/v1/chat";

    const response = await fetch(externalApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ question, traceContext: context }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return new Response(JSON.stringify({ reply: data.reply || data.answer || "No response received." }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    throw new Error(`External API failed with status ${response.status}`);
  } catch (err) {
    console.error("External Chatbot API error, falling back:", err);
    // 2. Fallback rule-based behavior
    const c = context as any;
    const fallbackReply = `(Fallback) Regarding wallet ${c?.wallet}, the nearest VASP is ${c?.nearestVaspLabel || 'Unknown'} at ${c?.hops} hops. The risk level is ${c?.risk}. Please verify manually as the AI service is unavailable.`;
    
    return new Response(JSON.stringify({ reply: fallbackReply }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}
