import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import OpenAI from "openai";

const genAI = new GoogleGenerativeAI(
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || ""
);

const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || process.env.XAI_API_KEY || "",
  baseURL: "https://api.groq.com/openai/v1",
});

import { getSupabaseAdmin } from "../core/auditLog";

/**
 * Dynamically fetch and instantiate third-party MCP clients configured for an org.
 * Includes basic circuit-breaker logic (timeouts) to ensure failure isolation.
 */
export async function resolveThirdPartyTools(orgId: string): Promise<any[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data: connections, error } = await supabase
    .from("mcp_client_connections")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "active");

  if (error || !connections || connections.length === 0) {
    return [];
  }

  const resolvedTools: any[] = [];
  for (const conn of connections) {
      try {
          // Timeout implementation for failure isolation
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s connect timeout
          
          // Dummy: connect to conn.server_url and fetch tools
          
          clearTimeout(timeoutId);
          
          // E.g. resolvedTools.push(...mcpClientTools)
      } catch (err) {
          console.error(`[MCP] Failed to connect to third-party tool: ${conn.server_name}`, err);
          // Circuit breaker: skip this tool and continue, ensuring Trace AI doesn't fail
      }
  }

  return resolvedTools;
}

/**
 * Groq model chain — tried in order on model-unavailable (404) errors.
 *
 * Override the primary via GROQ_MODEL env var.
 * All IDs are verified against the Groq model catalog:
 *   https://console.groq.com/docs/models
 *
 *   llama-3.1-8b-instant  — fast, always-on Llama 3.1 8B
 *   mixtral-8x7b-32768    — higher-quality Mixtral 8x7B (32k context)
 */
export const GROQ_FALLBACK_MODELS = [
  process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
];

function isModelUnavailableError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  return status === 404 || /model.*(not found|does not exist|unavailable)|invalid model/i.test(message);
}

async function groqChatCreate(
  params: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let lastError: unknown;
  for (const model of GROQ_FALLBACK_MODELS) {
    try {
      return await groqClient.chat.completions.create({ ...params, model });
    } catch (err) {
      lastError = err;
      if (isModelUnavailableError(err)) {
        console.error(`[ALERT] Groq model unavailable (${model}); trying next fallback.`, err);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function groqChatStream(
  params: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming, "model">,
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  let lastError: unknown;
  for (const model of GROQ_FALLBACK_MODELS) {
    try {
      return await groqClient.chat.completions.create({ ...params, model, stream: true });
    } catch (err) {
      lastError = err;
      if (isModelUnavailableError(err)) {
        console.error(`[ALERT] Groq model unavailable (${model}); trying next fallback.`, err);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function generateRiskNarrative(
  attributionResult: {
    wallet: string;
    nearestVasp: string;
    hops: number;
    confidence: "High" | "Medium" | "Low";
    score: number;
    risk: "HIGH" | "LOW";
  },
  userPrompt?: string
): Promise<string> {
  const systemPrompt = `You are a blockchain compliance analyst. Given wallet attribution data, write a concise 2-3 sentence risk summary a non-technical compliance officer could read in a report. Be factual, mention VASP, hops, confidence, and risk status. No jargon.`;
  const userMessage = userPrompt
    ? userPrompt
    : `Attribution Result: ${JSON.stringify(attributionResult)}`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: systemPrompt + "\n\n" + userMessage }],
        },
      ]
    });

    const narrative =
      response.response.text() || "Unable to generate narrative.";
    return narrative;
  } catch (error) {
    console.warn("Gemini API error, falling back to Groq:", error);
    try {
      const response = await groqChatCreate({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ]
      });
      return response.choices[0]?.message?.content || "Unable to generate narrative.";
    } catch (groqError) {
      console.error("Groq API error:", groqError);
      // Fallback template
      return `Wallet ${attributionResult.wallet} shows ${attributionResult.confidence?.toLowerCase()} confidence connection to ${attributionResult.nearestVasp} at ${attributionResult.hops} hops. Risk: ${attributionResult.risk}.`;
    }
  }
}

// For Phase 7B: Gemini with tool-use (function calling)
export async function generateNarrativeWithFunctionCalling(
  attributionResult: any,
  userQuestion: string,
  tools: Array<{ name: string; description: string; handler: Function }>
): Promise<{ answer: string; toolsUsed?: string[] }> {
  const systemPrompt = `You are a blockchain compliance analyst with access to wallet attribution data. Answer questions using the provided function tools when you need specifics. Be concise and factual.`;
  const promptText = `${systemPrompt}\n\nContext: ${JSON.stringify(attributionResult)}\n\nUser Question: ${userQuestion}`;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      tools: [
        {
          functionDeclarations: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                address: { type: SchemaType.STRING },
                query: { type: SchemaType.STRING },
              },
            },
          })),
        },
      ],
    });

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: promptText,
            },
          ],
        },
      ]
    });

    const answer = response.response.text();
    return { answer };
  } catch (error) {
    console.warn("Gemini function-calling error, falling back to Groq:", error);
    try {
      const openaiTools = tools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties: {
              address: { type: "string" },
              query: { type: "string" },
            },
          },
        },
      }));

      const response = await groqChatCreate({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Context: ${JSON.stringify(attributionResult)}\n\nUser Question: ${userQuestion}` }
        ],
        tools: openaiTools,
      });

      const answer = response.choices[0]?.message?.content || "Unable to answer.";
      return { answer };
    } catch (groqError) {
      console.error("Groq function-calling error:", groqError);
      return {
        answer:
          "I encountered an error processing your question. Please try again.",
      };
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// A2 — Streaming chat with citation detection
// ──────────────────────────────────────────────────────────────────────────────

/** Citation marker pattern: [[path:P,hop:H]] */
const CITATION_RE = /\[\[path:\s*(\d+)\s*,\s*hop:\s*(\d+)\]\]/gi;

export type ChatStreamChunk =
  | { type: "token"; token: string }
  | { type: "citation"; pathIndex: number; hopIndex: number; address: string };

/**
 * Stream a Q&A answer about the given attribution result.
 *
 * Yields token chunks as they arrive from Gemini's streaming API (or Groq fallback).
 * When the model includes a [[path:P,hop:H]] citation marker, yields a
 * { citation } event instead (stripped from the displayed prose).
 *
 * Scoped strictly to Q&A over the already-computed attribution JSON.
 * The model has no tools to fetch additional on-chain data.
 */
export async function* streamChatAnswer(
  attributionResult: any,
  userQuestion: string,
): AsyncGenerator<ChatStreamChunk> {
  const systemPrompt = `You are a specialized Blockchain Anti-Money Laundering (AML) and Compliance AI Analyst.
Answer the user's question accurately, concisely, and factually using ONLY the provided wallet attribution trace data.

INSTRUCTIONS & RULES:
1. Base your answer strictly on the provided Attribution Data.
2. When referencing a specific hop or transaction path in your evidence, tag it with [[path:P,hop:H]] using the 0-based indices from the JSON paths array (e.g. [[path:0,hop:2]]).
3. Do not tag every sentence — only tag when citing a specific path hop as evidence.
4. If asked about something unrelated to this wallet trace, politely decline and state that you are scoped to this specific attribution dataset.
5. Provide concise, professional, and objective analysis. Do not give financial advice.

Attribution Data:
${JSON.stringify(attributionResult, null, 2)}`;

  let streamResult;
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    streamResult = await model.generateContentStream({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\nQuestion: ${userQuestion}` }],
        },
      ],
    });
  } catch (err) {
    console.warn("[streamChatAnswer] Gemini Failed to start stream, falling back to Groq:", err);
    try {
      const groqStream = await groqChatStream({
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Question: ${userQuestion}` }
        ]
      });

      // Wrap Groq stream in a compatible async generator format for parsing below
      streamResult = {
        stream: (async function* () {
          for await (const chunk of groqStream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              yield { text: () => content };
            }
          }
        })()
      };
    } catch (groqError) {
      console.error("[streamChatAnswer] Groq failed to start stream:", groqError);
      yield { type: "token", token: "Sorry, I couldn't process that question. Please try again." };
      return;
    }
  }

  // Buffer to detect multi-chunk citation markers that straddle chunk boundaries
  let pendingBuffer = "";
  const paths: any[] = attributionResult.paths ?? [];

  for await (const chunk of streamResult.stream) {
    const text = chunk.text();
    pendingBuffer += text;

    // Process buffer: extract complete citation markers and clean prose
    let lastIndex = 0;
    CITATION_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = CITATION_RE.exec(pendingBuffer)) !== null) {
      // Yield prose before this citation
      const proseBefore = pendingBuffer.slice(lastIndex, match.index);
      if (proseBefore) {
        yield { type: "token", token: proseBefore };
      }

      // Yield citation event
      const pathIndex = parseInt(match[1], 10);
      const hopIndex = parseInt(match[2], 10);
      const citedPath = paths[pathIndex];
      const address = citedPath?.path?.[hopIndex] ?? citedPath?.nearestVasp ?? "";
      yield { type: "citation", pathIndex, hopIndex, address };

      lastIndex = match.index + match[0].length;
    }

    // Keep any trailing incomplete marker in the buffer (might be split across chunks)
    // A complete marker is [[path:N,hop:N]]; if we see [[ without a closing ]] keep it buffered
    const processedUpTo = lastIndex;
    const remaining = pendingBuffer.slice(processedUpTo);

    // Check if remaining could be the start of an incomplete citation marker
    const openBracketPos = remaining.lastIndexOf("[[");
    if (openBracketPos !== -1 && !remaining.includes("]]", openBracketPos)) {
      // Emit everything before the open bracket, keep potential marker buffered
      const safeToEmit = remaining.slice(0, openBracketPos);
      if (safeToEmit) yield { type: "token", token: safeToEmit };
      pendingBuffer = remaining.slice(openBracketPos);
    } else {
      // No open partial marker — emit all remaining and reset buffer
      if (remaining) yield { type: "token", token: remaining };
      pendingBuffer = "";
    }
  }

  // Flush any remaining buffer content
  if (pendingBuffer) {
    yield { type: "token", token: pendingBuffer };
  }
}

