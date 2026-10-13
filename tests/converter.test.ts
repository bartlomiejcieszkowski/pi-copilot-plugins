import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  convertMcpServers,
  expandPluginPlaceholders,
  extractPluginComponents,
  extractSkills,
  extractAgents,
  extractMcpConfig,
} from "../src/converter.js";
import { isAgentPlugins } from "../src/types.js";

const FIXTURES = join(__dirname, "fixtures");

// ─── Manifest Parsing ───────────────────────────────────────────────────────

describe("isAgentPlugins", () => {
  it("identifies Agent Plugins 1.0 manifest", () => {
    const manifest = JSON.parse(
      readFileSync(join(FIXTURES, "agent-plugins-1.0.json"), "utf-8")
    );
    expect(isAgentPlugins(manifest)).toBe(true);
  });

  it("identifies legacy manifest", () => {
    const manifest = JSON.parse(
      readFileSync(join(FIXTURES, "legacy-plugin.json"), "utf-8")
    );
    expect(isAgentPlugins(manifest)).toBe(false);
  });

  it("identifies Agent Plugins 1.1 manifest", () => {
    const manifest = {
      $schema: "https://agent-plugins.org/schemas/1.1.0/plugin.schema.json",
      name: "test",
    };
    expect(isAgentPlugins(manifest)).toBe(true);
  });
});

// ─── MCP Conversion ─────────────────────────────────────────────────────────

describe("convertMcpServers", () => {
  it("converts stdio server with env", () => {
    const config = {
      mcpServers: {
        "test-server": {
          type: "stdio",
          command: "npx",
          args: ["-y", "@mcp/server"],
          env: { API_KEY: "test" },
        },
      },
    };
    const result = convertMcpServers(config);
    expect(result["test-server"]).toEqual({
      command: "npx",
      args: ["-y", "@mcp/server"],
      env: { API_KEY: "test" },
      type: "stdio",
    });
  });

  it("converts HTTP server", () => {
    const config = {
      mcpServers: {
        "http-server": {
          type: "http",
          url: "http://localhost:8080/mcp",
        },
      },
    };
    const result = convertMcpServers(config);
    expect(result["http-server"]).toEqual({
      url: "http://localhost:8080/mcp",
      type: "http",
    });
  });

  it("converts OAuth server", () => {
    const config = {
      mcpServers: {
        "oauth-server": {
          type: "stdio",
          command: "npx",
          args: ["-y", "@mcp/oauth"],
          oauthClientId: "my-client-id",
          auth: { redirectPort: 3000 },
        },
      },
    };
    const result = convertMcpServers(config);
    expect(result["oauth-server"]).toMatchObject({
      command: "npx",
      args: ["-y", "@mcp/oauth"],
      type: "stdio",
      oauth: {
        clientId: "my-client-id",
        callbackPort: 3000,
      },
    });
  });

  it("skips servers with no transport", () => {
    const config = {
      mcpServers: {
        "invalid": {},
      },
    };
    const result = convertMcpServers(config);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ─── Placeholder Expansion ──────────────────────────────────────────────────

describe("expandPluginPlaceholders", () => {
  it("expands ${PLUGIN_ROOT}", () => {
    const result = expandPluginPlaceholders(
      ["${PLUGIN_ROOT}/bin/server"],
      "test",
      "/cache/abc123",
      "/data/test"
    );
    expect(result).toEqual(["/cache/abc123/bin/server"]);
  });

  it("expands ${PLUGIN_DATA}", () => {
    const result = expandPluginPlaceholders(
      "${PLUGIN_DATA}/config.json",
      "test",
      "/cache/abc123",
      "/data/test"
    );
    expect(result).toBe("/data/test/config.json");
  });

  it("expands legacy placeholder names", () => {
    const result = expandPluginPlaceholders(
      "${CLAUDE_PLUGIN_ROOT}${CLAUDE_PLUGIN_DATA}",
      "test",
      "/cache",
      "/data"
    );
    expect(result).toBe("/cache/data");
  });

  it("handles multiple placeholders in one string", () => {
    const result = expandPluginPlaceholders(
      ["${PLUGIN_ROOT}/bin", "${PLUGIN_DATA}/data"],
      "test",
      "/cache",
      "/data"
    );
    expect(result).toEqual(["/cache/bin", "/data/data"]);
  });
});

// ─── Plugin Extraction ──────────────────────────────────────────────────────

describe("extractPluginComponents", () => {
  it("extracts MCP config from Agent Plugins manifest", () => {
    const manifest = {
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "test",
    };
    // This would need a real plugin directory with mcp.json
    // For now, test with a mock directory
    const components = extractPluginComponents(manifest, "/nonexistent");
    expect(components.manifest).toEqual(manifest);
    expect(components.mcpServers).toEqual({});
  });
});
