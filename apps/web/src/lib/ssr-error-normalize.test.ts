import { describe, it, expect } from "vitest";
import { isH3SwallowedErrorBody, normalizeCatastrophicSsrResponse } from "./ssr-error-normalize";
import { describeError } from "./error-capture";

describe("F-1 h3 swallowed SSR errors", () => {
  it("detects the h3 unhandled HTTPError JSON body", () => {
    expect(isH3SwallowedErrorBody(JSON.stringify({ unhandled: true, message: "HTTPError" }))).toBe(
      true,
    );
    expect(isH3SwallowedErrorBody(JSON.stringify({ unhandled: false, message: "HTTPError" }))).toBe(
      false,
    );
    expect(isH3SwallowedErrorBody("not-json")).toBe(false);
  });

  it("rewrites swallowed JSON 500s into the HTML error page", async () => {
    const swallowed = new Response(JSON.stringify({ unhandled: true, message: "HTTPError" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    const normalized = await normalizeCatastrophicSsrResponse(swallowed);
    expect(normalized.status).toBe(500);
    expect(normalized.headers.get("content-type")).toContain("text/html");
    const html = await normalized.text();
    expect(html).toContain("This page didn't load");
  });

  it("leaves non-catastrophic responses alone", async () => {
    const ok = new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
    const same = await normalizeCatastrophicSsrResponse(ok);
    expect(same.status).toBe(200);
    expect(await same.text()).toBe("ok");
  });
});

describe("describeError", () => {
  it("keeps the cause chain", () => {
    const inner = new Error("db down");
    const outer = new Error("lookup failed", { cause: inner });
    const text = describeError(outer);
    expect(text).toContain("lookup failed");
    expect(text).toContain("caused by:");
    expect(text).toContain("db down");
  });
});
