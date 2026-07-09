import { describe, it, expect, vi, afterEach } from "vitest";
import { isSecureCookie } from "@/lib/jwt";

describe("isSecureCookie", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("default true di production tanpa override", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "");
    expect(isSecureCookie()).toBe(true);
  });

  it("default false di luar production tanpa override", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COOKIE_SECURE", "");
    expect(isSecureCookie()).toBe(false);
  });

  it("COOKIE_SECURE=false memaksa false walau production (akses HTTP polos)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_SECURE", "false");
    expect(isSecureCookie()).toBe(false);
  });

  it("COOKIE_SECURE=true memaksa true walau bukan production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COOKIE_SECURE", "true");
    expect(isSecureCookie()).toBe(true);
  });
});
