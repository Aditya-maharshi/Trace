/**
 * src/lib/api.test.ts
 *
 * Foundational test suite for the frontend API library.
 *
 * Covers:
 *   - ApiError construction (status codes, messages, details)
 *   - apiUrl() URL building (versioned prefix, path normalisation)
 *   - API_VERSION_PREFIX constant
 *   - exportReport() guard: must reject when requestId is missing
 *
 * Run with:  npm test   from apps/web/
 */

import { describe, it, expect } from "vitest";
import { ApiError, apiUrl, API_VERSION_PREFIX, exportReport } from "./api";

// ApiError ----------------------------------------------------------------

describe("ApiError", () => {
  it("stores status, message, and details", () => {
    const err = new ApiError(404, "Not found", { hint: "try again" });
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.details).toEqual({ hint: "try again" });
    expect(err.name).toBe("ApiError");
  });

  it("is an instance of Error", () => {
    const err = new ApiError(500, "boom");
    expect(err instanceof Error).toBe(true);
  });

  it("details defaults to undefined when not provided", () => {
    const err = new ApiError(401, "Unauthorized");
    expect(err.details).toBeUndefined();
  });
});

// apiUrl() ----------------------------------------------------------------

describe("apiUrl()", () => {
  it("includes the versioned prefix", () => {
    const result = apiUrl("/attribute");
    expect(result).toContain(API_VERSION_PREFIX);
    expect(result).toContain("/attribute");
  });

  it("normalises paths that lack a leading slash", () => {
    const withSlash = apiUrl("/attribute");
    const withoutSlash = apiUrl("attribute");
    expect(withSlash).toBe(withoutSlash);
  });

  it("preserves query strings appended to the path segment", () => {
    const result = apiUrl("/attribute?address=0xdeadbeef");
    expect(result).toContain("?address=0xdeadbeef");
  });
});

// exportReport() guard ----------------------------------------------------

describe("exportReport()", () => {
  it("throws ApiError 400 when requestId is missing", async () => {
    const fakeData = { wallet: "0x1234" } as any;
    await expect(exportReport(fakeData, "pdf")).rejects.toThrow(ApiError);
    await expect(exportReport(fakeData, "pdf")).rejects.toMatchObject({ status: 400 });
  });

  it("error message mentions requestId", async () => {
    const fakeData = { wallet: "0x1234" } as any;
    let caught: unknown;
    try {
      await exportReport(fakeData);
    } catch (e) {
      caught = e;
    }
    expect((caught as ApiError).message).toMatch(/requestId/i);
  });
});
