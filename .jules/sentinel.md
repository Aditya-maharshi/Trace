## 2024-05-18 - [Missing Authorization check in GET and POST evidence route]
**Vulnerability:** Insecure Direct Object Reference (IDOR) on `/api/cases/[id]/evidence` GET and POST routes where `assertCaseAccess` was imported but not used, allowing any user to read or modify evidence for any case.
**Learning:** Always verify that imported authorization functions are actually called in the handlers.
**Prevention:** Ensure test cases include checks to verify that authorization middleware and assertion functions are invoked, specifically attempting to access resources with unauthorized users.
