import { NextRequest, NextResponse } from "next/server";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { mcpServer } from "../../../mcp/server";
import { getSupabaseAdmin } from "../../../lib/domains/core/auditLog";

// Global map to hold active SSE transports (note: in serverless, this only works if hitting the same instance)
const transports = new Map<string, SSEServerTransport>();

export async function GET(req: NextRequest) {
  // Extract Bearer token
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer trace_live_sk_")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  
  // Basic validation without WebCrypto for now, or just dummy lookup if edge blocks it
  // In a real edge runtime, we'd use crypto.subtle to hash the token and check against `api_keys`
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Internal Configuration Error" }, { status: 500 });
  }

  // NOTE: For demo purposes, we inject dummy context if no DB configured. 
  // Real implementation requires hashing the key and checking DB.
  
  const transport = new SSEServerTransport("/api/mcp", req.nextUrl.origin);
  const sessionId = crypto.randomUUID();
  transports.set(sessionId, transport);
  
  // Connect the server to this transport
  // Inject the extra context (tenant info) into the connection
  const context = {
     org_id: "demo_org",
     scopes: ["cases:read", "cases:write", "trace:read"],
     analyst_id_or_service_account: "mcp_agent"
  };

  // We should actually pass this context into the tool handlers. 
  // @modelcontextprotocol/sdk doesn't natively support connection-level context injection in `tool` callbacks easily without wrapping.
  // For the sake of the implementation plan, we will wrap the execution context.
  
  await mcpServer.connect(transport);
  
  // Clean up on close (Next.js Edge doesn't cleanly expose close events for SSE easily, 
  // but standard streaming Response will close when client disconnects).
  // Next.js returning standard Response with ReadableStream:
  
  // We need to extract the underlying Web ReadableStream from SSEServerTransport.
  // SSEServerTransport has a way to handle this but for Next.js app router we might need to proxy it.
  
  // Just use a basic response for now to satisfy the skeleton
  const stream = new ReadableStream({
    start(controller) {
       // SSEServerTransport would write to this controller
       // This is a simplified mockup to demonstrate the architecture
       controller.enqueue(new TextEncoder().encode("event: endpoint\ndata: /api/mcp?sessionId=" + sessionId + "\n\n"));
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}

export async function POST(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Handle incoming message
  // transport.handlePostMessage(req); // or similar depending on MCP SDK version
  // This is a skeleton.
  return NextResponse.json({ success: true });
}
