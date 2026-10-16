import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { isAgentPlugins } from "../src/types.js";

const FIXTURES = join(__dirname, "fixtures");

// ─── Manifest Detection ─────────────────────────────────────────────────────

describe("readManifest", () => {
  it("reads legacy manifest with skills but no mcpServers", () => {
    const manifest = JSON.parse(
      readFileSync(join(FIXTURES, "failing-manifest.json"), "utf-8")
    );
    // Should be detected as legacy (has skills, no $schema)
    expect(isAgentPlugins(manifest)).toBe(false);
    // Should have skills array from manifest
    expect(manifest.skills).toEqual(["./skills/"]);
    // Should have lspServers
    expect(manifest.lspServers).toBe("./lsp.json");
    // Should have Polish author name preserved
    expect(manifest.author.name).toBe("łąka zażółć gęślą jaźn");
  });

  it("reads legacy manifest with skills and mcpServers", () => {
    const manifest = JSON.parse(
      readFileSync(join(FIXTURES, "legacy-plugin.json"), "utf-8")
    );
    expect(isAgentPlugins(manifest)).toBe(false);
    expect(manifest.skills).toEqual(["skills/deploy"]);
    // Legacy format: mcpServers can be a string path
    expect(manifest.mcpServers).toBe(".mcp.json");
  });

  it("reads Agent Plugins 1.0 manifest", () => {
    const manifest = JSON.parse(
      readFileSync(join(FIXTURES, "agent-plugins-1.0.json"), "utf-8")
    );
    expect(isAgentPlugins(manifest)).toBe(true);
  });
});
