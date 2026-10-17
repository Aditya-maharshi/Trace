## 2026-10-17 - Missing IDOR checks on Case Evidence API
**Vulnerability:** The API routes for fetching and pinning evidence (`apps/api/app/api/cases/[id]/evidence/route.ts`) verified the user was logged in, but failed to check if the user actually had authorization to access the specific `case_id`.
**Learning:** Functions like `getSupabaseAdmin` can bypass row-level security if ownership is not explicitly checked at the controller level. Also, it's a common pattern here that `assertCaseAccess` requires fetching the full `caseRow` via an authorized client before invoking.
**Prevention:** Always fetch the target entity (`cases`) using an authenticated user client, verify it exists, and explicitly run `assertCaseAccess` on the result before returning or mutating data related to that entity.
