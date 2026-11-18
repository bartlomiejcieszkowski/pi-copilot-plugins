import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMarketplace } from "../src/marketplace.js";

const MANIFEST = { name: "test-marketplace", plugins: [] };

function okResponse(): Response {
  return new Response(JSON.stringify(MANIFEST), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function notFoundResponse(): Response {
  return new Response(null, { status: 404 });
}

function collectUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchMarketplace branch resolution", () => {
  it("fetches the default branch through HEAD", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { manifest } = await fetchMarketplace("avhb/mkt-default-branch", true);

    expect(manifest.name).toBe("test-marketplace");
    const urls = collectUrls(fetchMock);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/HEAD/.github/plugin/marketplace.json");
  });

  it("falls back to main when HEAD returns 404", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/HEAD/")) return notFoundResponse();
      return okResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const { manifest } = await fetchMarketplace("avhb/mkt-head-404", true);

    expect(manifest.name).toBe("test-marketplace");
    const urls = collectUrls(fetchMock);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("/HEAD/");
    expect(urls[1]).toContain("/main/");
  });

  it("falls back to master when HEAD and main return 404", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/HEAD/") || url.includes("/main/")) return notFoundResponse();
      return okResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const { manifest } = await fetchMarketplace("avhb/mkt-master-404", true);

    expect(manifest.name).toBe("test-marketplace");
    const urls = collectUrls(fetchMock);
    expect(urls).toHaveLength(3);
    expect(urls[2]).toContain("/master/.github/plugin/marketplace.json");
  });

  it("tries the next ref when the HEAD request fails at the network level", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/HEAD/")) throw new Error("network down");
      return okResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const { manifest } = await fetchMarketplace("avhb/mkt-network-error", true);

    expect(manifest.name).toBe("test-marketplace");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports the attempted refs when every ref returns 404", async () => {
    const fetchMock = vi.fn(async () => notFoundResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMarketplace("avhb/mkt-all-404", true)).rejects.toThrow(
      /tried HEAD, main, master/
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not fall back on an auth error", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401, statusText: "Unauthorized" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMarketplace("avhb/mkt-auth-error", true)).rejects.toThrow(/HTTP 401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves a fresh cached manifest without another request", async () => {
    const source = `avhb/mkt-cache-${Date.now()}`;
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchMarketplace(source, true);
    const second = await fetchMarketplace(source);

    expect(second.manifest.name).toBe(first.manifest.name);
    expect(second.stale).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the GitHub token in the Authorization header", async () => {
    const previousToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "test-token-value";
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    try {
      await fetchMarketplace("avhb/mkt-token", true);

      const options = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
      expect(options.headers["Authorization"]).toBe("token test-token-value");
    } finally {
      if (previousToken === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = previousToken;
      }
    }
  });
});
