import { describe, it, expect } from "vitest";
import { resolveRedirect } from "./redirects";

describe("resolveRedirect", () => {
  it("maps legacy targets", () => {
    expect(resolveRedirect("/dashboard", "commercial", "/commercial/dashboard")).toBe("/commercial/dashboard");
    expect(resolveRedirect("/commercial", "commercial", "/commercial/dashboard")).toBe("/commercial/dashboard");
    expect(resolveRedirect("/history", "commercial", "/commercial/dashboard")).toBe("/commercial/dashboard?tab=history");
    expect(resolveRedirect("/government", "government", "/government/dashboard")).toBe("/government/dashboard");
    expect(resolveRedirect("/cases", "government", "/government/dashboard")).toBe("/government/dashboard?view=docket");
  });

  it("rejects cross-track targets", () => {
    expect(resolveRedirect("/government/dashboard", "commercial", "/commercial/dashboard")).toBe("/commercial/dashboard");
    expect(resolveRedirect("/commercial/dashboard", "government", "/government/dashboard")).toBe("/government/dashboard");
  });

  it("rejects invalid or malicious targets", () => {
    expect(resolveRedirect("//evil.com", "commercial", "/commercial/dashboard")).toBe("/commercial/dashboard");
    expect(resolveRedirect("\\\\evil.com", "commercial", "/commercial/dashboard")).toBe("/commercial/dashboard");
    expect(resolveRedirect("javascript:alert(1)", "commercial", "/commercial/dashboard")).toBe("/commercial/dashboard");
  });

  it("rejects non-strings and falsy values", () => {
    expect(resolveRedirect(null, "commercial", "/commercial/dashboard")).toBe("/commercial/dashboard");
    expect(resolveRedirect(undefined, "commercial", "/commercial/dashboard")).toBe("/commercial/dashboard");
    expect(resolveRedirect(123 as any, "commercial", "/commercial/dashboard")).toBe("/commercial/dashboard");
  });

  it("accepts valid same-track targets", () => {
    expect(resolveRedirect("/commercial/dashboard?tab=overview", "commercial", "/commercial/dashboard")).toBe("/commercial/dashboard?tab=overview");
    expect(resolveRedirect("/government/dashboard?view=sahyog", "government", "/government/dashboard")).toBe("/government/dashboard?view=sahyog");
  });
});
