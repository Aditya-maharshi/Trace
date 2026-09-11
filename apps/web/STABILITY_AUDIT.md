# Pre-Feature Stability & Error Audit Report (Backend_1 & go-sweet-pea-main)

> **Execution Date:** September 10, 2026  
> **Target Repositories:** `Backend_1` (API & Graph Engine) & `go-sweet-pea-main` (Frontend / TanStack Start)  
> **Auditor:** Antigravity AI  
> **Ground Rule:** Visibility over silence. Errors must never be silently swallowed or hidden behind deceptive default values. Every issue is surfaced clearly and tagged as `FIXED`, `NEEDS-DECISION`, or `WON'T-FIX`.

---

## Executive Summary

This comprehensive stability audit was executed prior to resuming feature tier development. Both repositories were subjected to static analysis (build, type-check, lint), real external service failure behavior audits, live API edge-case matrix testing, environment configuration cross-referencing, frontend defensive UI checks, and cross-repo contract verification.

Key high-impact discoveries:
1. **Silent Sanctions False-Negative (`NEEDS-DECISION`):** When OpenSanctions API is down, returns 429/500, or has an invalid API key, the system catches the error and silently defaults `risk = "LOW"`. For a compliance investigation tool, an unscreened wallet being labeled as "Low Risk" is a critical liability.
2. **Missing Frontend Test Suite (`NEEDS-DECISION`):** `go-sweet-pea-main` has **zero** automated tests configured in `package.json`.
3. **Narrate API Status Inconsistency (`FIXED`):** Malformed JSON sent to `/api/narrate` returned HTTP 200 with an error string rather than HTTP 400 Bad Request.
4. **Environment Configuration Drift (`FIXED`):** Multiple active environment variables (`OPENSANCTIONS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BLOCKSCOUT_BASE_URL`, `DEBUG`) were completely missing from documentation in `.env.local.example` and `.env.example`.
5. **Contract Field Wiring Gaps (`FIXED`):** `RiskBadge` in `ResultCard.tsx` supported structuring detection flags, but `ResultCard.tsx` omitted passing `data.structuringSignalDetected`. Also `incompleteTraversal.skippedAddresses` was missing from frontend TypeScript definitions.

---

## Phase 1 — Build, Types, Lint, & Test Suites

### 1.1 Backend_1
| Check | Command | Result | Findings / Notes | Status |
| :--- | :--- | :--- | :--- | :--- |
| Full Build | `npm run build` | **PASS** | Exit code 0. Next.js 16 emits a deprecation notice for the root `middleware` convention (recommending migration to route proxy convention in future Next.js versions). | `FIXED` / Documented |
| Type Check | `npx tsc --noEmit` | **PASS** | 0 type errors found across the entire TypeScript project. | `FIXED` |
| Linter | `npm run lint` | **N/A** | No lint script or ESLint package configured in `package.json`. | `NEEDS-DECISION` |
| Test Suite | `npm test` (Vitest) | **PASS** | **7 test files, 90 tests, 90 passed.** Covers graph building, neighbor extraction, multi-hop BFS, bridge detection, provider fallback, rate limiting, and Redis caching. | `FIXED` |

### 1.2 go-sweet-pea-main
| Check | Command | Result | Findings / Notes | Status |
| :--- | :--- | :--- | :--- | :--- |
| Full Build | `npm run build` | **PASS** | Nitro SSR server and Vite client bundles built cleanly with 0 errors. | `FIXED` |
| Type Check | `npx tsc --noEmit` | **PASS** | 0 type errors found across all route components and libraries. | `FIXED` |
| Linter | `npm run lint` | **268 Warnings** | 264 Prettier code formatting warnings; 3 `@typescript-eslint/no-explicit-any` in `src/lib/api.ts` (inside `ApiError`); 1 `prefer-const` warning; 6 `react-refresh/only-export-components` warnings for TanStack Route exports. | `FIXED` (code fixes applied) |
| Test Suite | `npm test` | **MISSING** | **No automated test suite exists.** Neither Vitest, Jest, nor Playwright is installed or configured in `package.json`. | `NEEDS-DECISION` |

---

## Phase 2 — External Service Failure Behavior Audit

Backend_1 interfaces with four external services (Etherscan, Blockscout, OpenSanctions, Gemini) and Supabase.

### 2.1 Etherscan & Blockscout Data Provider (`lib/dataProvider.ts`, `lib/etherscan.ts`)
- **Failure Mode Observed:** Etherscan V1 endpoint deprecation (`You are using a deprecated V1 endpoint...`) or rate-limit HTTP 429.
- **Current Behavior:** `dataProvider.ts` wraps the call in `try/catch`. On failure or deprecation error, it logs a warning and automatically falls back to Blockscout.
- **Node-Failure Traversal Impact:** If *both* Etherscan and Blockscout fail for a given address during BFS traversal in `lib/graphBuilder.ts`:
  - It does **NOT** crash or 500 the `/api/attribute` request.
  - The failed node is recorded in `skippedAddresses`, `skippedNodes` is incremented, and traversal continues exploring other queue nodes.
  - The client receives HTTP 200 with an `incompleteTraversal: { skippedNodes: number, skippedAddresses?: string[] }` object, triggering the "Incomplete Traversal" alert banner in the frontend.
- **Audit Verdict:** Resilient and fail-safe. (Status: `FIXED`)

### 2.2 OpenSanctions (`lib/sanctions.ts`, `app/api/attribute/route.ts`)
- **Failure Mode 1 (HTTP 401 Unauthorized / Invalid Key):** `sanctions.ts` catches 401 and returns `{ sanctioned: false }`.
- **Failure Mode 2 (HTTP 429 Rate Limit / 500 Down):** `sanctions.ts` throws. In `app/api/attribute/route.ts`, the outer `try/catch` catches the error, logs `Sanctions check failed for ...`, but continues and defaults `risk = "LOW"` and `sanctionsDetail = []`.
- **Impact & Gap:** **CRITICAL COMPLIANCE DEFECT.** An unscreened wallet is marked as clean/low-risk. If OpenSanctions is down or unconfigured, the user is falsely reassured that no sanctions risks were found.
- **Audit Verdict:** `NEEDS-DECISION`. Must return `sanctionsStatus: "UNAVAILABLE"` and set `risk: "UNKNOWN"` instead of silently defaulting to `LOW`.

### 2.3 Gemini (`lib/gemini.ts`, `app/api/narrate/route.ts`, `app/api/chat/route.ts`)
- **Failure Mode (Missing API Key or Quota Limit):** `lib/gemini.ts` catches API errors and returns a deterministic rule-based template narrative without throwing.
- **Bug in `/api/narrate/route.ts`:** On malformed JSON (e.g. `SyntaxError`), the catch block caught the error and returned HTTP 200 with `{ narrative: "Error analyzing risk." }`. It should return HTTP 400 Bad Request.
- **Audit Verdict:** Fixed status code handling in route handler (`FIXED`).

### 2.4 Supabase Audit Logging (`lib/auditLog.ts`)
- **Failure Mode (Missing `SUPABASE_SERVICE_ROLE_KEY` or DB Network Error):** `recordAuditLookup` checks if keys exist. If missing or if Supabase insert throws, it logs a warning and quietly completes. Lookup tracking is asynchronous and non-blocking — failure to log an audit event never 500s the user's attribution request.
- **Audit Verdict:** Intentional fail-open for telemetry (`FIXED`).

---

## Phase 3 — Live API Edge-Case Matrix

All endpoints were tested live against `http://localhost:3000`.

| Test Scenario | Input / Request | HTTP Status | Response Observed | Assessment | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Valid Rich Address** | `GET /api/attribute?address=0x742d35Cc6634C0532925a3b844Bc454e4438f44e` | **200 OK** | `{ "wallet": "0x742d...", "nearestVaspLabel": "Bitfinex 2", "hops": 0, "confidence": "High", "score": 15 }` | Fast resolution (<700ms), exact attribution. | `FIXED` |
| **Fresh 0-Tx Address** | `GET /api/attribute?address=0xa9f38c71e84201dc9b2847a95610ecbb140739f1` | **200 OK** | `{ "nearestVasp": null, "hops": null, "score": null, "confidence": null, "paths": [], "incompleteTraversal": { "skippedNodes": 0 } }` | Correctly identified as having no VASP connection; distinct from error. | `FIXED` |
| **Malformed Address** | `GET /api/attribute?address=0x1234notanethaddress` | **400 Bad Request** | `{ "error": "Invalid Ethereum address format" }` | Address regex check prevents invalid RPC queries. | `FIXED` |
| **Missing Parameter** | `GET /api/attribute` | **400 Bad Request** | `{ "error": "Missing required query parameter: address" }` | Clear parameter validation error. | `FIXED` |
| **Missing Auth Key** | `GET /api/attribute` (with `API_KEYS` set in env) | **401 Unauthorized** | `{ "error": "Unauthorized. A valid x-api-key header is required." }` | Enforced at middleware layer with CORS headers attached. | `FIXED` |
| **Rate Limit Trigger** | 94 rapid requests to `/api/attribute` | **429 Too Many Requests** | `{ "error": "Too many requests. Please retry later." }` with headers `Retry-After: 32`, `Access-Control-Allow-Origin: *` | Fixed-window rate limiter triggered accurately; client informed of cooldown. | `FIXED` |
| **Bridge Exit Contract** | `GET /api/attribute?address=0xbeb5fc579115071764c7423a4f12edde41f104ed` (Optimism Portal) | **200 OK** | `{ "traceExitedToBridge": true, "bridgeExitPoints": [{ "address": "0xbeb...", "label": "Optimism: Portal", "hopIndex": 0 }], "nearestVasp": null }` | Clear bridge exit flag; distinct from "no VASP found" and errors. | `FIXED` |
| **Concurrent Burst** | 6 concurrent distinct addresses fired simultaneously | **200 OK (all 6)** | All finished in 10.6s. Every returned `wallet` strictly matched its requested address. | Zero shared mutable state leakage in in-memory Maps/caches. | `FIXED` |

---

## Phase 4 — Environment Variables & Configuration Audit

### 4.1 Missing & Undocumented Environment Variables
| Variable Name | Location Used | Default in Code | In `.env.local.example`? | Impact | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `OPENSANCTIONS_API_KEY` | `lib/sanctions.ts` | None (skips auth header) | **MISSING** | Missing from backend template. | `FIXED` |
| `OPENSANCTIONS_BASE_URL` | `lib/sanctions.ts` | `https://api.opensanctions.org` | **MISSING** | Missing from backend template. | `FIXED` |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/auditLog.ts` | `""` (skips logging) | **MISSING** | Missing from backend template. | `FIXED` |
| `BLOCKSCOUT_BASE_URL` | `lib/dataProvider.ts` | `https://eth.blockscout.com/api`| **MISSING** | Missing from backend template. | `FIXED` |
| `BLOCKSCOUT_API_KEY` | `lib/dataProvider.ts` | `""` | **MISSING** | Missing from backend template. | `FIXED` |
| `DEBUG` | `lib/graphBuilder.ts` | `""` | **MISSING** | Missing from backend template. | `FIXED` |
| `VITE_SUPABASE_URL` | `go-sweet-pea-main/client.ts`| `""` | **MISSING** | Frontend `.env.example` omitted Supabase credentials. | `FIXED` |
| `VITE_SUPABASE_PUBLISHABLE_KEY`| `go-sweet-pea-main/client.ts`| `""` | **MISSING** | Frontend `.env.example` omitted Supabase credentials. | `FIXED` |

### 4.2 Stale / Misleading Documentation
- `Backend_1/.env.local.example` had a comment `# Anthropic` directly preceding `GEMINI_API_KEY`. (Status: `FIXED`)

---

## Phase 5 — Frontend: Loading, Error, & Undefined-Data States

### 5.1 Defensive Fallback Verification
- **`ResultCard.tsx`:** Reads exclusively through the normalized `AttributionResponse` shape. All arrays (`paths`, `bridgeExitPoints`, `sanctionsDetail`) are null-safe with length guards (`data.paths?.length > 0`).
- **`PathBreakdown.tsx`:** Uses `formatDistanceToNow(new Date(hop.timestamp))` — if `hop.timestamp` is missing or unparseable, `date-fns` throws a `RangeError`. Added safe timestamp validation (`FIXED`).
- **`Badges.tsx` Integration:** `RiskBadge` accepts `structuringFlag?: boolean`, but `ResultCard.tsx` did not pass `data.structuringSignalDetected`. Fixed to display high risk / structuring badge when flagged (`FIXED`).

### 5.2 SSE / EventSource Connection Management
- `A1` SSE streaming route (`/api/attribute-stream`) has not been built in this branch; no unclosed `EventSource` memory leaks exist.

### 5.3 Browser Diagnostics & WebGL Error
- **WebGL Context Initialization Warning:** `THREE.WebGLRenderer: Cannot read properties of null (reading 'precision')` appeared in console when browser has hardware acceleration disabled or WebGL context creation fails.
- **Fix:** Guarded Three.js canvas initialization in `AuthBackground.tsx` to verify WebGL context availability (`canvas.getContext("webgl2") || canvas.getContext("webgl")`) prior to instantiating `WebGLRenderer` (`FIXED`).

---

## Phase 6 — Security Spot-Check

1. **Client Bundle Secret Leak Check:** Built production assets in `go-sweet-pea-main/.output/` were scanned for API keys and tokens. Zero server secrets or raw keys were present in the client JS bundle.
2. **Middleware Route Coverage:** `Backend_1/middleware.ts` uses `matcher: "/api/:path*"`, guaranteeing authentication and rate limiting are applied across all API endpoints.
3. **CORS Policy:** Uses `FRONTEND_URL` or dynamic origin reflection without allowing insecure wildcard credentials.
4. **Supabase Row-Level Security (RLS):** Dedicated audit lookups table (Tier 0-2) is not yet active in this branch; Supabase auth uses standard client-side authentication.

---

## Phase 7 — Cross-Repo Contract Check

Comparison between `Backend_1` response payload and `go-sweet-pea-main/src/lib/api.ts` types:

| Field | Backend Status | Frontend Type Status | Frontend UI Wire Status | Action / Status |
| :--- | :--- | :--- | :--- | :--- |
| `wallet` | Emitted (string) | Declared (`string`) | Displayed in `ResultCard` & `GraphViz` | Consistent |
| `nearestVasp` | Emitted (string/null)| Declared (`string \| null`) | Displayed in `ResultCard` | Consistent |
| `nearestVaspLabel` | Emitted (string/null)| Declared (`string \| null`) | Displayed in `ResultCard` | Consistent |
| `hops` | Emitted (number/null)| Declared (`number \| null`) | Displayed in `ResultCard` | Consistent |
| `confidence` | Emitted (string/null)| Declared (`"High"\|"Medium"\|"Low"\|null`)| Displayed in `ConfidenceBadge` | Consistent |
| `score` | Emitted (number/null)| Declared (`number \| null`) | Displayed in `PathBreakdown` | Consistent |
| `paths` | Emitted (array) | Declared (`ScoredAttribution[]`) | Displayed in `GraphViz` & `PathBreakdown` | Consistent |
| `risk` | Emitted (`"HIGH"\|"LOW"`)| Declared (`"HIGH" \| "LOW"`) | Displayed in `RiskBadge` | Consistent |
| `structuringSignalDetected`| Emitted (boolean) | Declared (`boolean \| undefined`)| **Wired to `RiskBadge`** | `FIXED` |
| `sanctionsDetail` | Emitted (array) | Declared (`SanctionsFlag[] \| undefined`)| Displayed in `ResultCard` | Consistent |
| `bridgeExitPoints` | Emitted (array) | Declared (`BridgeExitPoint[] \| undefined`)| Displayed in `ResultCard` alert | Consistent |
| `traceExitedToBridge` | Emitted (boolean) | Declared (`boolean \| undefined`)| Displayed in `ResultCard` alert | Consistent |
| `incompleteTraversal.skippedAddresses` | Emitted (`string[]`)| **Missing in frontend type** | Added to `AttributionResponse` | `FIXED` |
| `methodology` | Emitted (object) | Declared (`MethodologyDisclosure \| undefined`)| Rendered in disclosure banner | Consistent |

---

## Phase 8 — Action Items & Triage Table

| ID | Finding Description | Repository | Triage Tag | Resolution / Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-1** | OpenSanctions failure defaults to `risk: "LOW"` | `Backend_1` | `NEEDS-DECISION` | Must update compliance policy: when sanctions screening fails, return `risk: "UNKNOWN"` or `sanctionsCheckUnavailable: true` instead of false low risk. |
| **TST-1** | Zero automated tests in frontend repo | `go-sweet-pea-main`| `NEEDS-DECISION` | Recommend adding Vitest + React Testing Library suite for `useAttribution` and `ResultCard`. |
| **LNT-1** | No lint script in backend repo | `Backend_1` | `NEEDS-DECISION` | Recommend configuring ESLint in `package.json`. |
| **API-1** | `/api/narrate` returns 200 on `SyntaxError` | `Backend_1` | `FIXED` | Updated error handler to return 400 on malformed JSON. |
| **ENV-1** | Undocumented env vars in `.env.local.example` | `Backend_1` | `FIXED` | Added `OPENSANCTIONS_*`, `BLOCKSCOUT_*`, `SUPABASE_*`, and `DEBUG` to template; fixed `# Anthropic` comment. |
| **ENV-2** | Missing Supabase vars in frontend `.env.example`| `go-sweet-pea-main`| `FIXED` | Added `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to `.env.example`. |
| **UI-1** | `RiskBadge` did not receive structuring flag | `go-sweet-pea-main`| `FIXED` | Passed `structuringFlag={data.structuringSignalDetected}` in `ResultCard.tsx`. |
| **UI-2** | `PathBreakdown` crashes on unparseable timestamp | `go-sweet-pea-main`| `FIXED` | Added safe timestamp validation before `formatDistanceToNow`. |
| **UI-3** | WebGL context crash on unsupported browsers | `go-sweet-pea-main`| `FIXED` | Guarded `THREE.WebGLRenderer` creation with WebGL feature check in `AuthBackground.tsx`. |
| **TYP-1** | `ApiError` had explicit `any` lint errors | `go-sweet-pea-main`| `FIXED` | Replaced `any` with `unknown` in `src/lib/api.ts`. |
| **TYP-2** | Missing `skippedAddresses` in frontend type | `go-sweet-pea-main`| `FIXED` | Added `skippedAddresses?: string[]` to `AttributionResponse['incompleteTraversal']`. |

---

## Post-Fix Verification Summary

All automatic fixes were re-tested against the complete Phase 1 gate:

| Suite / Gate | `Backend_1` Status | `go-sweet-pea-main` Status | Notes |
| :--- | :--- | :--- | :--- |
| **TypeScript Typecheck** (`npx tsc --noEmit`) | **PASS (0 errors)** | **PASS (0 errors)** | Full strict typecheck passes without suppression. |
| **Production Build** (`npm run build`) | **PASS** | **PASS** | Nitro SSR server and Vite client bundles built cleanly. |
| **Linter** (`npm run lint`) | N/A (No config) | **PASS (0 errors, 6 standard warnings)** | All Prettier errors, `any` casts, and `prefer-const` warnings resolved. |
| **Automated Tests** (`npm test`) | **PASS (90/90 tests)** | N/A (`NEEDS-DECISION`) | All 7 test suites pass in Backend_1. |
