import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hashAddress, hashIp } from "../../lib/domains/core/logger";

describe("privacy hashing", () => {
  const prevSalt = process.env.IP_HASH_SALT;

  beforeEach(() => {
    process.env.IP_HASH_SALT = "unit-test-salt";
  });

  afterEach(() => {
    if (prevSalt === undefined) delete process.env.IP_HASH_SALT;
    else process.env.IP_HASH_SALT = prevSalt;
  });

  it("hashes wallet addresses to a short hex prefix", () => {
    const a = hashAddress("0xABC");
    const b = hashAddress("0xabc");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{10}$/);
  });

  it("never stores a raw IP — output is a salted HMAC prefix", () => {
    const raw = "203.0.113.42";
    const hashed = hashIp(raw);
    expect(hashed).not.toBe(raw);
    expect(hashed).toMatch(/^h:[a-f0-9]{16}$/);
    expect(hashIp(raw)).toBe(hashed);
    expect(hashIp("203.0.113.43")).not.toBe(hashed);
  });

  it("returns null for missing IPs", () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp("")).toBeNull();
  });
});
