import { useState, useRef, useCallback } from "react";
import { type AttributionResponse, apiUrl, API_KEY } from "@/lib/api";

export interface BfsProgressMessage {
  type: "exploring" | "fetched" | "vasp_found" | "pruned" | "done";
  message: string;
  address?: string;
  depth?: number;
}

export interface AttributionStreamState {
  data: AttributionResponse | null;
  narrative: string | null;
  loading: boolean;
  error: string | null;
  progressLog: BfsProgressMessage[];
}

export function useAttributionStream() {
  const [data, setData] = useState<AttributionResponse | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressLog, setProgressLog] = useState<BfsProgressMessage[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const lookup = useCallback(async (address: string) => {
    // Close any previous EventSource
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setData(null);
    setNarrative(null);
    setError(null);
    setProgressLog([]);
    setLoading(true);

    // Route through the server-side SSE proxy to avoid leaking the API key
    // in the URL (query params land in server access logs, browser history,
    // and Referer headers). The proxy at /api/public/attribute-stream
    // forwards the key to the backend via the x-api-key header server-side.
    const url = `/api/public/attribute-stream?address=${encodeURIComponent(address)}`;

    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("progress", (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data) as BfsProgressMessage;
        setProgressLog((prev) => [...prev, msg]);
      } catch {
        // ignore malformed events
      }
    });

    es.addEventListener("complete", (e: MessageEvent) => {
      try {
        const result = JSON.parse(e.data) as AttributionResponse;
        setData(result);
        setLoading(false);

        // Generate narrative for the result
        if (result.nearestVasp) {
          fetch(apiUrl("/narrate"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": API_KEY,
            },
            body: JSON.stringify(result),
          })
            .then((r) => r.json())
            .then((r) => setNarrative(r.narrative ?? null))
            .catch(() => setNarrative(null));
        } else {
          setNarrative("No VASP found to attribute to.");
        }
      } catch {
        setError("Failed to parse attribution result.");
        setLoading(false);
      }
      es.close();
    });

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const err = JSON.parse(e.data) as { message: string };
        setError(err.message);
      } catch {
        setError("Connection lost during trace. Please try again.");
      }
      setLoading(false);
      es.close();
    });

    // Handle network-level EventSource errors (e.g. server unreachable)
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        // Already handled above
        return;
      }
      setError("Lost connection to backend. Please try again.");
      setLoading(false);
      es.close();
    };
  }, []);

  const cancel = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setLoading(false);
  }, []);

  return { data, narrative, loading, error, progressLog, lookup, cancel };
}
