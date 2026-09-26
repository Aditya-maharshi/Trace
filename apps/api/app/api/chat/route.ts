/**
 * app/api/chat/route.ts
 *
 * Streaming SSE chat endpoint.
 * Accepts the attribution context + a user question via POST body.
 * Streams the answer token-by-token as it is generated (Gemini, with a
 * Groq fallback — see lib/domains/ai/gemini.ts:streamChatAnswer) instead of
 * blocking on a single round trip.
 *
 * SSE event types:
 *   event: token     data: { "token": "..." }
 *   event: citation  data: { "pathIndex": 0, "hopIndex": 2, "address": "0x..." }
 *   event: done      data: {}
 *   event: error     data: { "message": "..." }
 */

import { streamChatAnswer } from "../../../lib/domains/ai/gemini";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request): Promise<Response> {
  let body: { question?: string; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { question, context } = body;

  if (!question || typeof question !== "string" || !context) {
    return new Response(JSON.stringify({ error: "Missing question or context" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Client disconnected mid-stream — nothing left to do.
        }
      };

      try {
        // streamChatAnswer is an async generator: each chunk is enqueued as
        // soon as it arrives from the model, so the response starts
        // streaming immediately instead of waiting for the full answer —
        // and, being async, it never blocks the Node event loop while other
        // requests are in flight.
        for await (const chunk of streamChatAnswer(context, question)) {
          if (chunk.type === "token") {
            enqueue(sseEvent("token", { token: chunk.token }));
          } else if (chunk.type === "citation") {
            // streamChatAnswer already resolves the cited hop to an address.
            enqueue(sseEvent("citation", chunk));
          }
        }
        enqueue(sseEvent("done", {}));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Trace AI could not answer that.";
        console.error("[/api/chat] streamChatAnswer error:", err);
        enqueue(sseEvent("error", { message }));
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Client disconnected. streamChatAnswer doesn't currently accept an
      // AbortSignal, so the in-flight Gemini/Groq call runs to completion in
      // the background — its result is just discarded (enqueue() above is a
      // no-op once the stream is canceled). Worth adding a signal param to
      // streamChatAnswer if abandoned-request cost becomes an issue.
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
