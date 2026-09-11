import { NextResponse } from "next/server";

const swaggerDoc = {
  openapi: "3.0.0",
  info: {
    title: "Trace AML Attribution API",
    version: "1.0.0",
    description: "API for tracing and attributing Ethereum wallets to known VASPs, bridges, and mixers.",
  },
  servers: [
    { url: "/api", description: "Current API Environment" }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key"
      }
    }
  },
  security: [
    { ApiKeyAuth: [] }
  ],
  paths: {
    "/attribute": {
      get: {
        summary: "Attribute a wallet address",
        description: "Runs BFS graph traversal to find the shortest path from the given address to a known VASP.",
        parameters: [
          {
            name: "address",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Ethereum address to investigate (0x...)"
          }
        ],
        responses: {
          "200": {
            description: "Successful attribution",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    wallet: { type: "string" },
                    nearestVasp: { type: "string" },
                    risk: { type: "string", enum: ["LOW", "HIGH"] },
                    confidence: { type: "string", enum: ["High", "Medium", "Low"] }
                  }
                }
              }
            }
          },
          "400": { description: "Invalid address" }
        }
      }
    },
    "/attribute-stream": {
      get: {
        summary: "Stream attribution progress",
        description: "Same as /attribute but streams SSE progress events during BFS.",
        parameters: [
          {
            name: "address",
            in: "query",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": { description: "Server-Sent Events stream" }
        }
      }
    },
    "/health": {
      get: {
        summary: "API Health Check",
        description: "Checks connectivity to downstream dependencies (Etherscan, Supabase, Redis, etc.).",
        security: [],
        responses: {
          "200": { description: "All dependencies healthy" },
          "503": { description: "One or more dependencies failed" }
        }
      }
    },
    "/chat": {
      post: {
        summary: "Chat with the investigation graph",
        description: "Uses Gemini/Groq to chat contextually about an attribution trace.",
        responses: {
          "200": { description: "LLM response stream" }
        }
      }
    },
    "/narrate": {
      post: {
        summary: "Generate executive narrative",
        description: "Uses Gemini/Groq to narrate a full attribution response for compliance officers.",
        responses: {
          "200": { description: "Executive summary text" }
        }
      }
    },
    "/prices": {
      get: {
        summary: "Get ETH and token prices",
        description: "Fetches current market prices for ETH and USD stablecoins.",
        responses: {
          "200": { description: "Price dictionary" }
        }
      }
    }
  }
};

export async function GET() {
  return NextResponse.json(swaggerDoc);
}
