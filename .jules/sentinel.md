## 2026-10-05 - Fix IDOR in evidence API endpoint
**Vulnerability:** The API routes for fetching and creating evidence for a case relied on `getSupabaseAdmin()` or didn't check for case authorization before processing requests, allowing any authenticated user to view or modify evidence for cases they did not have access to.
**Learning:** `assertCaseAccess` must be explicitly called for every case endpoint after fetching the case object to ensure the user is authorized. Also `getSupabaseAdmin()` should be avoided as it bypasses Row Level Security (RLS).
**Prevention:** Always use `getSupabaseUserClient()` in API routes and ensure `assertCaseAccess(caseRow, userId)` is executed before fulfilling requests for case-specific operations.
