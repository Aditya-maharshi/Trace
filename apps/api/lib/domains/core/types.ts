export interface AttributionResult {
  wallet: string;
  nearestVasp: string;
  hops: number;
  confidence: "High" | "Medium" | "Low";
  score: number;
  risk: "HIGH" | "LOW";
}

export interface GeminiNarrationRequest {
  attributionResult: AttributionResult;
  temperature?: number;
  max_tokens?: number;
}

export interface GeminiNarrationResponse {
  narrative: string;
  tokens_used?: number;
}
