/**
 * Stable public API version. Unversioned `/api/*` routes remain as aliases
 * of `/api/v1/*` so existing callers keep working while new integrations
 * pin a versioned contract.
 */
export const API_VERSION = "1";
export const API_VERSION_HEADER = "X-API-Version";

export function canonicalApiPath(pathname: string): string {
  if (pathname === "/api/v1" || pathname === "/api/v1/") return "/api";
  if (pathname.startsWith("/api/v1/")) {
    return `/api/${pathname.slice("/api/v1/".length)}`;
  }
  return pathname;
}

export function withApiVersionHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return {
    ...headers,
    [API_VERSION_HEADER]: API_VERSION,
  };
}
