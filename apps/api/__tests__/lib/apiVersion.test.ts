import { describe, it, expect } from "vitest";
import { canonicalApiPath, withApiVersionHeaders, API_VERSION } from "../../lib/domains/core/apiVersion";

describe("API versioning", () => {
  it("maps /api/v1/* onto the unversioned implementation path", () => {
    expect(canonicalApiPath("/api/v1/attribute")).toBe("/api/attribute");
    expect(canonicalApiPath("/api/v1/health")).toBe("/api/health");
    expect(canonicalApiPath("/api/attribute")).toBe("/api/attribute");
  });

  it("stamps X-API-Version on responses", () => {
    const headers = withApiVersionHeaders({ "Retry-After": "10" });
    expect(headers["X-API-Version"]).toBe(API_VERSION);
    expect(headers["Retry-After"]).toBe("10");
  });
});
