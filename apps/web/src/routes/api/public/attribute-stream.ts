import { createFileRoute } from "@tanstack/react-router";
import { ETH_ADDRESS_RE } from "@/lib/types";

export const Route = createFileRoute("/api/public/attribute-stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const address = new URL(request.url).searchParams.get("address") ?? "";
        if (!ETH_ADDRESS_RE.test(address)) {
          return new Response("Invalid address", { status: 400 });
        }

        const API_BASE = process.env["VITE_API_URL"] || "http://localhost:3000";
        const API_KEY = process.env["VITE_API_KEY"] || "changeme-key-1";

        try {
          const res = await fetch(`${API_BASE}/api/attribute-stream?address=${address}`, {
            headers: {
              "x-api-key": API_KEY,
            },
          });

          if (!res.ok) {
            return new Response(`Backend Error: ${res.statusText}`, { status: res.status });
          }

          return new Response(res.body, {
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache, no-transform",
              "connection": "keep-alive",
            },
          });
        } catch (error) {
          console.error("Proxy error:", error);
          return new Response("Failed to connect to backend api", { status: 500 });
        }
      },
    },
  },
});
