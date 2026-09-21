-- Prevent privilege escalation
REVOKE UPDATE ON orgs FROM authenticated;
REVOKE UPDATE ON api_keys FROM authenticated;
