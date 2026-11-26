import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
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
    const manifest = JSON.parse(readFileSync(join(FIXTURES, "agent-plugins-1.0.json"), "utf-8"));
    expect(isAgentPlugins(manifest)).toBe(true);
  });

  it("identifies legacy manifest", () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURES, "legacy-plugin.json"), "utf-8"));
    expect(isAgentPlugins(manifest)).toBe(false);
  });

  it("identifies Agent Plugins 1.1 manifest", () => {
    const manifest = {
      $schema: "https://agent-plugins.org/schemas/1.1.0/plugin.schema.json",
      name: "test",
    };
    expect(isAgentPlugins(manifest)).toBe(true);
  });

  it("reads manifest with Polish characters", () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURES, "polish-manifest.json"), "utf-8"));
    expect(isAgentPlugins(manifest)).toBe(true);
    expect(manifest.name).toBe("polski-test");
    expect(manifest.description).toContain("polskimi znakami");
    expect(manifest.skills[0].name).toBe("polskie-narzędzia");
    expect(manifest.mcpServers["polski-serwer"]).toBeDefined();
  });
});

// ─── Path Validation ────────────────────────────────────────────────────────

describe("extractSkills path validation", () => {
  it("rejects backslash skill paths", () => {
    const manifest = {
      name: "test",
      skills: [".\\skills\\"],
    };
    expect(() => extractSkills(manifest as any, "/tmp")).toThrow(/backslashes.*forward slashes/);
  });
});

describe("extractSkills discovery", () => {
  function createPlugin(skillDir: string): string {
    const root = mkdtempSync(join(tmpdir(), "pi-skills-"));
    mkdirSync(join(root, skillDir), { recursive: true });
    writeFileSync(
      join(root, skillDir, "SKILL.md"),
      "---\nname: example-skill\ndescription: An example skill.\n---\n",
      "utf-8"
    );
    return root;
  }

  it("discovers a skill when the configured path is the skill directory", () => {
    const root = createPlugin("custom/example-skill");
    try {
      const skills = extractSkills({ name: "test", skills: ["./custom/example-skill"] } as any, root);
      expect(skills).toEqual([
        {
          name: "example-skill",
          skillMdPath: "./custom/example-skill/SKILL.md",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("handles a direct skill path with a trailing slash", () => {
    const root = createPlugin("custom/example-skill");
    try {
      const skills = extractSkills({ name: "test", skills: ["custom/example-skill/"] } as any, root);
      expect(skills).toEqual([
        {
          name: "example-skill",
          skillMdPath: "custom/example-skill/SKILL.md",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still discovers skills when the configured path is a parent directory", () => {
    const root = createPlugin("custom/example-skill");
    try {
      const skills = extractSkills({ name: "test", skills: ["./custom"] } as any, root);
      expect(skills).toEqual([
        {
          name: "example-skill",
          skillMdPath: "./custom/example-skill/SKILL.md",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("extractAgents path validation", () => {
  it("rejects backslash agent paths", () => {
    const manifest = {
      name: "test",
      agents: ".\\agents\\",
    };
    expect(() => extractAgents(manifest as any, "/tmp")).toThrow(/backslashes.*forward slashes/);
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
        invalid: {},
      },
    };
    const result = convertMcpServers(config);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ─── Placeholder Expansion ──────────────────────────────────────────────────

describe("expandPluginPlaceholders", () => {
  it("expands ${PLUGIN_ROOT}", () => {
    const result = expandPluginPlaceholders(["${PLUGIN_ROOT}/bin/server"], "test", "/cache/abc123", "/data/test");
    expect(result).toEqual(["/cache/abc123/bin/server"]);
  });

  it("expands ${PLUGIN_DATA}", () => {
    const result = expandPluginPlaceholders("${PLUGIN_DATA}/config.json", "test", "/cache/abc123", "/data/test");
    expect(result).toBe("/data/test/config.json");
  });

  it("expands legacy placeholder names", () => {
    const result = expandPluginPlaceholders("${CLAUDE_PLUGIN_ROOT}${CLAUDE_PLUGIN_DATA}", "test", "/cache", "/data");
    expect(result).toBe("/cache/data");
  });

  it("handles multiple placeholders in one string", () => {
    const result = expandPluginPlaceholders(["${PLUGIN_ROOT}/bin", "${PLUGIN_DATA}/data"], "test", "/cache", "/data");
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

// ─── Component Path Containment ─────────────────────────────────────────────

function makeContainmentTree(): string {
  const base = mkdtempSync(join(tmpdir(), "pcp-contain-"));
  const pluginRoot = join(base, "plugin");
  mkdirSync(join(pluginRoot, "skills", "inside"), { recursive: true });
  mkdirSync(join(base, "outside-skill"), { recursive: true });
  writeFileSync(join(pluginRoot, "skills", "inside", "SKILL.md"), "# inside\n");
  writeFileSync(join(base, "outside-skill", "SKILL.md"), "# outside\n");
  return pluginRoot;
}

describe("component path containment", () => {
  it("refuses a configured skill path that escapes the plugin root", () => {
    const pluginRoot = makeContainmentTree();
    const manifest = {
      name: "p",
      version: "1.0.0",
      skills: "../outside-skill",
    };
    expect(() => extractSkills(manifest as any, pluginRoot)).toThrow(/escapes the plugin root/);
  });

  it("refuses a parent-directory skill path instead of naming a skill ..", () => {
    const pluginRoot = makeContainmentTree();
    writeFileSync(join(pluginRoot, "SKILL.md"), "# root\n");
    const manifest = { name: "p", version: "1.0.0", skills: "skills/.." };
    expect(() => extractSkills(manifest as any, pluginRoot)).toThrow(/escapes the plugin root/);
  });

  it("refuses a configured agent path that escapes the plugin root", () => {
    const pluginRoot = makeContainmentTree();
    const manifest = {
      name: "p",
      version: "1.0.0",
      agents: "../outside-skill",
    };
    expect(() => extractAgents(manifest as any, pluginRoot)).toThrow(/escapes the plugin root/);
  });

  it("still discovers skills that live inside the plugin root", () => {
    const pluginRoot = makeContainmentTree();
    const manifest = { name: "p", version: "1.0.0", skills: "skills" };
    expect(extractSkills(manifest as any, pluginRoot)).toEqual([
      { name: "inside", skillMdPath: "skills/inside/SKILL.md" },
    ]);
  });
});
