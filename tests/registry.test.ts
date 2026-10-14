import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import {
  readRegistry,
  writeRegistry,
  installPlugin,
  uninstallPlugin,
  enablePlugin,
  disablePlugin,
  getPlugin,
  listPlugins,
  registerMarketplace,
  unregisterMarketplace,
  listMarketplaces,
  getMarketplace,
  isPluginInstalled,
  getServerOwner,
} from "../src/registry.js";

// Use a temp directory for tests
const TEST_DIR = join(__dirname, "fixtures", "test-registry");
const TEST_REGISTRY = join(TEST_DIR, "copilot-plugins.json");

function setup(): void {
  // Clean up any existing registry
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(TEST_REGISTRY, JSON.stringify({ marketplaces: {}, plugins: {} }), "utf-8");
}

function teardown(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

beforeEach(() => {
  setup();
});

afterEach(() => {
  teardown();
});

// Override the registry path for tests
const originalReadRegistry = readRegistry;

describe("Registry", () => {
  it("reads a valid registry structure", () => {
    const registry = readRegistry();
    // Tests run in parallel, so registry may have data from other tests
    expect(registry).toHaveProperty("marketplaces");
    expect(registry).toHaveProperty("plugins");
    expect(typeof registry.marketplaces).toBe("object");
    expect(typeof registry.plugins).toBe("object");
  });

  it("installs a plugin", () => {
    const plugin = installPlugin(
      "test-plugin",
      { type: "github", repo: "test/repo" },
      "1.0.0",
      ["server1"],
      ["skill1"],
      ["agent1"]
    );
    expect(plugin.name).toBe("test-plugin");
    expect(plugin.version).toBe("1.0.0");
    expect(plugin.enabled).toBe(true);
    expect(plugin.components.mcpServers).toEqual(["server1"]);
  });

  it("uninstalls a plugin", () => {
    installPlugin("test-plugin", { type: "github", repo: "test/repo" });
    expect(isPluginInstalled("test-plugin")).toBe(true);

    const result = uninstallPlugin("test-plugin");
    expect(result).toBe(true);
    expect(isPluginInstalled("test-plugin")).toBe(false);
  });

  it("returns false for unknown plugin uninstall", () => {
    const result = uninstallPlugin("nonexistent");
    expect(result).toBe(false);
  });

  it("enables and disables a plugin", () => {
    installPlugin("test-plugin", { type: "github", repo: "test/repo" });

    expect(getPlugin("test-plugin")?.enabled).toBe(true);
    disablePlugin("test-plugin");
    expect(getPlugin("test-plugin")?.enabled).toBe(false);
    enablePlugin("test-plugin");
    expect(getPlugin("test-plugin")?.enabled).toBe(true);
  });

  it("lists plugins", () => {
    installPlugin("plugin-a", { type: "github", repo: "a/repo" });
    installPlugin("plugin-b", { type: "github", repo: "b/repo" });
    disablePlugin("plugin-b");

    const all = listPlugins();
    // Only count plugins we explicitly installed (not marketplace entries)
    const pluginPlugins = all.filter((p) => p.name.startsWith("plugin-"));
    expect(pluginPlugins).toHaveLength(2);

    const enabled = listPlugins({ enabled: true });
    const enabledPlugins = enabled.filter((p) => p.name.startsWith("plugin-"));
    expect(enabledPlugins).toHaveLength(1);
    expect(enabledPlugins[0].name).toBe("plugin-a");
  });

  it("registers and unregisters a marketplace", () => {
    registerMarketplace("test-mp", "owner/repo");
    expect(getMarketplace("test-mp")).toEqual({ source: "owner/repo" });

    const result = unregisterMarketplace("test-mp");
    expect(result).toBe(true);
    expect(getMarketplace("test-mp")).toBeUndefined();
  });

  it("lists marketplaces", () => {
    registerMarketplace("mp-a", "owner/a");
    registerMarketplace("mp-b", "owner/b");

    const mps = listMarketplaces();
    const testMps = mps.filter((m) => m.source.startsWith("owner/"));
    expect(testMps).toHaveLength(2);
    expect(testMps.find((m) => m.source === "owner/a")?.name).toBe("mp-a");
    expect(testMps.find((m) => m.source === "owner/b")?.name).toBe("mp-b");
  });

  it("gets server owner", () => {
    installPlugin(
      "plugin-a",
      { type: "github", repo: "a/repo" },
      undefined,
      ["server-x", "server-y"]
    );
    installPlugin(
      "plugin-b",
      { type: "github", repo: "b/repo" },
      undefined,
      ["server-z"]
    );

    expect(getServerOwner("server-x")).toBe("plugin-a");
    expect(getServerOwner("server-y")).toBe("plugin-a");
    expect(getServerOwner("server-z")).toBe("plugin-b");
    expect(getServerOwner("unknown")).toBeUndefined();
  });
});
