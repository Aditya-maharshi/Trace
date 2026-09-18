import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSupabaseAdmin } from "../lib/domains/core/auditLog";
import { withTenantTransaction } from "../lib/domains/auth/tenantContext";
import { buildAttributionResponse } from "../lib/domains/tracing/buildAttributionResponse";
import { findNearestVASP } from "../lib/domains/tracing/graphBuilder";
import { buildVaspSet } from "../lib/domains/tracing/vaspLabels";
import { logError } from "../lib/domains/core/logger";

// Create the MCP server instance
export const mcpServer = new McpServer({
  name: "Trace Compliance Engine",
  version: "1.0.0",
});

// -----------------------------------------------------------------------------
// Tool Manifests & Handlers
// -----------------------------------------------------------------------------

// Tool 1: get_case (Read-only)
mcpServer.tool(
  "get_case",
  "Fetch a compliance case by its ID or associated wallet address.",
  {
    caseId: z.string().uuid().optional().describe("UUID of the case to fetch"),
    wallet: z.string().optional().describe("Wallet address to look up cases for"),
  },
  async ({ caseId, wallet }, extra) => {
    // Injected by route handler
    const { org_id, scopes, analyst_id_or_service_account } = extra as any;

    if (!scopes.includes("cases:read")) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error_code: "SCOPE_INSUFFICIENT", message: "Missing cases:read scope" }) }]
      };
    }

    try {
      const result = await withTenantTransaction(org_id, async (db) => {
        let query = db.from("cases").select("*").eq("org_id", org_id);

        if (caseId) {
          query = query.eq("id", caseId);
        } else if (wallet) {
          const w = await db.from("case_wallets").select("case_id").eq("wallet_address", wallet.toLowerCase()).limit(1);
          if (w.data && w.data.length > 0) {
            query = query.eq("id", w.data[0].case_id);
          } else {
            return { error_code: "NOT_FOUND", message: "No case found for wallet" };
          }
        } else {
           return { error_code: "INVALID_INPUT", message: "Must provide caseId or wallet" };
        }

        const { data, error } = await query.single();
        if (error) {
          if (error.code === 'PGRST116') {
             return { error_code: "NOT_FOUND", message: "Case not found" };
          }
          throw error;
        }

        return data;
      });

      if (result && "error_code" in result) {
         return { isError: true, content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data) }]
      };
    } catch (e: any) {
      logError(e, { tool: "get_case", org_id });
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error_code: "INTERNAL_ERROR", message: "An unexpected error occurred." }) }]
      };
    }
  }
);

// Tool 2: attribute_address (Read-only, long running)
mcpServer.tool(
  "attribute_address",
  "Run a BFS trace to find the nearest Virtual Asset Service Provider (VASP) for an Ethereum address.",
  {
    address: z.string().describe("The Ethereum address to trace"),
  },
  async ({ address }, extra) => {
    const { org_id, scopes, request } = extra as any;

    if (!scopes.includes("trace:read")) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error_code: "SCOPE_INSUFFICIENT", message: "Missing trace:read scope" }) }]
      };
    }

    try {
      const vaspSet = buildVaspSet();
      const bfsResult = await findNearestVASP(address, vaspSet);
      const attribution = await buildAttributionResponse(address, bfsResult);
      
      return {
        content: [{ type: "text", text: JSON.stringify(attribution) }]
      };
    } catch (e: any) {
      logError(e, { tool: "attribute_address", org_id });
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error_code: "INTERNAL_ERROR", message: "An unexpected error occurred." }) }]
      };
    }
  }
);

// Tool 3: transition_case (Mutating)
mcpServer.tool(
  "transition_case",
  "Transition a case to a new status (e.g. Needs Review -> Escalated). Requires a strict justification reason.",
  {
    caseId: z.string().uuid().describe("UUID of the case"),
    newStatus: z.string().describe("The target status (e.g. 'escalated', 'closed')"),
    reason: z.string().min(10).describe("Justification for the transition"),
  },
  async ({ caseId, newStatus, reason }, extra) => {
    const { org_id, scopes, analyst_id_or_service_account } = extra as any;

    if (!scopes.includes("cases:write")) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error_code: "SCOPE_INSUFFICIENT", message: "Missing cases:write scope" }) }]
      };
    }

    try {
       // We would call caseStore.transition here, but ensuring we don't duplicate code
       // Let's import it dynamically if it's large, or just use the DB directly if we need to
       // In a real implementation we must use `caseStore.transition()` to ensure audit logs.
       const { transitionCase } = await import("../lib/domains/cases/caseStore").then(m => ({ transitionCase: (m as any).transitionCase || null }));
       if (!transitionCase) {
          throw new Error("transitionCase not implemented in caseStore yet or exported differently");
       }
       
       const result = await transitionCase({
           caseId,
           newStatus: newStatus as any,
           reason,
           actorId: analyst_id_or_service_account,
           actorType: 'api'
       });

       return {
          content: [{ type: "text", text: JSON.stringify(result) }]
       };
    } catch (e: any) {
       logError(e, { tool: "transition_case", org_id });
       return {
         isError: true,
         content: [{ type: "text", text: JSON.stringify({ error_code: "INTERNAL_ERROR", message: "An unexpected error occurred." }) }]
       };
    }
  }
);
