// ──────────────────────────────────────────────────────────────────────────────
// S3 — Score breakdown interface (mirrors Backend_1/lib/attribution.ts ScoreBreakdown)
// ──────────────────────────────────────────────────────────────────────────────

import type {
  ScoreBreakdown,
  ScoredAttribution,
  SanctionsFlag,
  BridgeExitPoint,
  MethodologyDisclosure,
  TopVaspEntry,
  AttributionResponse,
  NarrateResponse,
  ChatResponse,
} from "../../../../packages/shared-types";

export type {
  ScoreBreakdown,
  ScoredAttribution,
  SanctionsFlag,
  BridgeExitPoint,
  MethodologyDisclosure,
  TopVaspEntry,
  AttributionResponse,
  NarrateResponse,
  ChatResponse,
};

export class ApiError extends Error {
  public status: number;
  public details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function getApiBase(): string {
  if (import.meta.env["VITE_API_URL"]) {
    return import.meta.env["VITE_API_URL"].replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;

    // Localhost dev
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:3000";
    }

    // LAN testing (e.g. 192.168.x.x)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return `${protocol}//${hostname}:3000`;
    }

    // Cloud deployments (e.g. *.vercel.app) without VITE_API_URL:
    // Call relative paths directly (/api/...) instead of appending an invalid :3000 port
    return "";
  }
  return "http://localhost:3000";
}

export const API_BASE = getApiBase();

/** Stable versioned API prefix. Unversioned `/api/*` remains an alias on the backend. */
export const API_VERSION_PREFIX = "/api/v1";

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${API_VERSION_PREFIX}${normalized}`;
}

function getApiKey(): string {
  const key = import.meta.env["VITE_API_KEY"] || "";
  if (!key) {
    console.warn(
      "[Trace] VITE_API_KEY is not set. API requests will be sent without authentication. " +
      "Set VITE_API_KEY in your .env file for production deployments."
    );
  }
  return key;
}

const API_KEY = getApiKey();

/** Exported so other modules can import the resolved key without duplicating the env lookup. */
export { API_KEY };

function validateAddress(address: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new ApiError(400, "Invalid Ethereum address format");
  }
}

export async function getAttribution(address: string): Promise<AttributionResponse> {
  validateAddress(address);

  const res = await fetch(`${apiUrl("/attribute")}?address=${address}`, {
    headers: { "x-api-key": API_KEY }
  });
  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, data.error || "Failed to fetch attribution", data);
  }

  return data as AttributionResponse;
}

export async function getNarrative(attribution: AttributionResponse): Promise<NarrateResponse> {
  const res = await fetch(apiUrl("/narrate"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(attribution),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, data.error || "Failed to fetch narrative", data);
  }

  return data as NarrateResponse;
}

export async function askFollowUp(
  question: string,
  context: AttributionResponse,
): Promise<ChatResponse> {
  const res = await fetch(apiUrl("/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({ question, context }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(res.status, errorData.error || "Failed to ask follow up", errorData);
  }

  if (!res.body) {
    throw new ApiError(500, "No response body received from chat server");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullAnswer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      if (!part.trim()) continue;
      const lines = part.split("\n");
      let eventType = "message";
      let eventData = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        else if (line.startsWith("data: ")) eventData = line.slice(6).trim();
      }

      if (!eventData) continue;

      try {
        const parsed = JSON.parse(eventData);
        if (eventType === "token") {
          fullAnswer += parsed.token;
        } else if (eventType === "error") {
          throw new ApiError(500, parsed.message);
        }
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }
  }

  return { answer: fullAnswer };
}

export async function getConfig(): Promise<{ isDemoMode: boolean }> {
  const res = await fetch(apiUrl("/config"), {
    headers: { "x-api-key": API_KEY },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, "Failed to fetch config", data);
  }
  return data;
}

export async function exportReport(attributionData: AttributionResponse, format: "pdf" | "csv" = "pdf"): Promise<void> {
  if (!attributionData.requestId) {
    throw new ApiError(
      400,
      "Missing requestId. Re-run the trace before exporting — reports are generated from the stored server-side result.",
    );
  }

  const res = await fetch(
    `${apiUrl("/report")}?format=${format}&requestId=${encodeURIComponent(attributionData.requestId)}`,
    {
      method: "GET",
      headers: {
        "x-api-key": API_KEY,
      },
    },
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(res.status, "Failed to generate report", errorData);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trace_report_${attributionData.wallet}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
