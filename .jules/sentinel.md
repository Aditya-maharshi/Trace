## 2026-10-12 - Missing IDOR checks despite imported helpers
**Vulnerability:** Insecure Direct Object Reference (IDOR) on `/api/cases/[id]/evidence` routes. Both `GET` and `POST` handlers imported `assertCaseAccess` but failed to use it, allowing any authenticated user to read or modify evidence for cases they do not own.
**Learning:** Security helper functions being imported is not proof they are being used. Missing invocation of `assertCaseAccess` leads to severe IDOR.
**Prevention:** Always verify that `assertCaseAccess(caseRow, userId)` is explicitly called and its result checked before granting access to case-specific routes.
