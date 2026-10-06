## 2024-05-18 - Missing Access Check in Evidence Route
**Vulnerability:** Insecure Direct Object Reference (IDOR) on `/api/cases/[id]/evidence`. A user could view or add evidence to any case by passing its ID, because `assertCaseAccess` was imported but not actually called.
**Learning:** Even when security-related functions are imported in a file, their usage must be carefully verified. The presence of the import is not enough.
**Prevention:** Consistently apply and call authorization checks (like `assertCaseAccess`) in all API route handlers that access specific resources by ID.
