## 2026-10-19 - IDOR via Admin Privileges in API Endpoints
**Vulnerability:** IDOR in API endpoints (e.g. `cases/[id]/evidence/route.ts`) due to missing authorization checks before calling functions utilizing `getSupabaseAdmin()`.
**Learning:** Admin database clients completely bypass RLS policies. Merely importing authorization helper functions like `assertCaseAccess` does not inherently protect the route; the route handler must explicitly invoke these checks to ensure the caller owns the resource before taking action on their behalf.
**Prevention:** Always verify authorization contexts (e.g. `assertCaseAccess(caseRow, userId)`) within the route handlers when utilizing functions backed by service role keys, or prefer `getSupabaseUserClient` where feasible.
