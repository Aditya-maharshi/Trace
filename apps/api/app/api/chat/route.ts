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

import { streamChatAnswer } from "../../../lib/gemini";
import { NextRequest } from "next/server";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: { question?: string; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(
      sseEvent("error", { message: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const { question, context } = body;

  if (!question || !context) {
    return new Response(
      sseEvent("error", { message: "Missing question or context" }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Client disconnected
        }
      };

      try {
        for await (const chunk of streamChatAnswer(context, question)) {
          if (chunk.type === "token") {
            enqueue(sseEvent("token", { token: chunk.token }));
          } else if (chunk.type === "citation") {
            enqueue(
              sseEvent("citation", {
                pathIndex: chunk.pathIndex,
                hopIndex: chunk.hopIndex,
                address: chunk.address,
              }),
            );
          }
        }
        enqueue(sseEvent("done", {}));
        controller.close();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Chat streaming error:", err);
        enqueue(sseEvent("error", { message }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    },
  });
}
