// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./paintpro-ai";

type TestResponse = {
  statusCode: number;
  body: Record<string, unknown> | null;
  setHeader: (name: string, value: string) => TestResponse;
  status: (code: number) => TestResponse;
  json: (value: unknown) => TestResponse;
};

async function invoke(authorization?: string) {
  const response: TestResponse = {
    statusCode: 200,
    body: null,
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value as Record<string, unknown>; return this; },
    end() { return this; },
  };
  await handler({ method: "GET", headers: authorization ? { authorization } : {} }, response);
  return response;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PaintPro AI access", () => {
  it("rejects requests without a Supabase session before contacting providers", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await invoke();

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("admits only an email on the server allowlist", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-key");
    vi.stubEnv("PAINTPRO_ALLOWED_EMAILS", "owner@example.com,worker@example.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "user-1", email: "owner@example.com" }) });
    vi.stubGlobal("fetch", fetchMock);

    const response = await invoke("Bearer valid-session");

    expect(response.statusCode).toBe(200);
    expect(response.body?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://example.supabase.co/auth/v1/user", expect.objectContaining({
      headers: { apikey: "public-key", Authorization: "Bearer valid-session" },
    }));
  });

  it("rejects a valid Supabase account outside the two allowed emails", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-key");
    vi.stubEnv("PAINTPRO_ALLOWED_EMAILS", "owner@example.com,worker@example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "user-2", email: "other@example.com" }) }));

    const response = await invoke("Bearer other-session");

    expect(response.statusCode).toBe(403);
  });
});
