import type {
  PluginSource,
  PluginSpec,
  PluginManifest,
  ExtractedComponents,
  InstallResult,
  UninstallResult,
  MarketplacePlugin,
} from "./types.js";
import { getMarketplace, listMarketplaces } from "./registry.js";
import { findPluginInMarketplace, marketplacePluginToSpec } from "./marketplace.js";
import {
  PLUGIN_CACHE_DIR,
  PLUGIN_DATA_DIR,
  resolvePaths,
  SKILLS_DIR,
  AGENTS_SKILLS_DIR,
  getGitHubToken,
} from "./types.js";
import {
  extractPluginComponents,
  convertMcpServers,
} from "./converter.js";
import {
  installPlugin,
  readRegistry,
  writeRegistry,
  getServerOwner,
  uninstallPlugin,
} from "./registry.js";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { status, statusDone, statusSimple, stopSpinner } from "./progress.js";
import { tmpdir } from "node:os";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  mkdtempSync,
  renameSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fetch } from "undici";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Ensure a directory exists, creating it and all parents if needed. */
function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

// ─── Plugin Peek ────────────────────────────────────────────────────────────

/**
 * Peek at a plugin's manifest without downloading the full repository.
 * Uses GitHub API for GitHub repos, git archive for git URLs.
 * Returns null if the manifest cannot be read.
 */
export async function peekManifest(spec: PluginSpec): Promise<PluginManifest | null> {
  try {
    if (spec.source.type === "github") {
      const { repo, path: subPath } = spec.source;

      // Build headers — add token if available (config takes precedence over env)
      const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
      const token = getGitHubToken();
      if (token) headers["Authorization"] = `token ${token}`;

      // Try .github/plugin.json first (Agent Plugins 1.0)
      const apiUrl = subPath
        ? `https://api.github.com/repos/${repo}/contents/${subPath}/plugin.json`
        : `https://api.github.com/repos/${repo}/contents/.github/plugin.json`;

      let response = await fetch(apiUrl, { headers });

      if (response.ok) {
        const data = await response.json() as { content: string };
        const decoded = Buffer.from(data.content, "base64").toString("utf-8");
        try {
          const manifest = JSON.parse(decoded) as PluginManifest;
          if ("$schema" in manifest) {
            return manifest;
          }
          // Also accept legacy manifests (no $schema) that have mcpServers or skills
          if ("mcpServers" in manifest || "skills" in manifest || "agents" in manifest) {
            return manifest;
          }
        } catch {
          // Not valid JSON, try legacy format
        }
      }

      // Try legacy format: .mcp.json or .github/mcp.json
      // Also try at subPath for plugins with a subdirectory source
      const legacyPaths = [".mcp.json", ".github/mcp.json"];
      if (subPath) {
        legacyPaths.push(subPath + "/.mcp.json");
      }
      for (const legacyPath of legacyPaths) {
        const legacyUrl = `https://api.github.com/repos/${repo}/contents/${legacyPath}`;
        response = await fetch(legacyUrl, { headers });

        if (response.ok) {
          const data = await response.json() as { content: string };
          const decoded = Buffer.from(data.content, "base64").toString("utf-8");
          try {
            const config = JSON.parse(decoded);
            // Create a legacy manifest from the MCP config
            return createLegacyManifestFromContent(repo, subPath, config);
          } catch {
            // Not valid JSON
          }
        }
      }

      return null;
    }

    if (spec.source.type === "git") {
      // For git URLs, try to get the archive and extract manifest
      // This is more complex and may not be worth implementing for now
      return null;
    }

    if (spec.source.type === "local") {
      // For local paths, read the manifest directly
      const manifest = readManifest(spec.source.path);
      return manifest;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Create a legacy manifest from MCP config content.
 */
function createLegacyManifestFromContent(
  repo: string,
  _subPath: string | undefined,
  config: Record<string, unknown>
): PluginManifest {
  return {
    $schema: "https://copilot-plugins.dev/schemas/legacy/v0.json",
    name: repo.split("/").pop() || "unknown",
    mcpServers: "mcpServers" in config ? (config.mcpServers as Record<string, unknown>) : {},
    // Legacy plugins with .mcp.json typically have skills/ at repo root
    skills: ["skills"],
  };
}

// ─── Plugin Download ────────────────────────────────────────────────────────

/**
 * Download a plugin from its source to the cache directory.
 * Returns the cache directory path.
 */
export async function downloadPlugin(
  spec: PluginSpec
): Promise<{ cacheDir: string; manifest: PluginManifest; sha?: string; subPath?: string }> {
  let cacheDir: string;
  let sha: string | undefined;

  switch (spec.source.type) {
    case "local":
      cacheDir = spec.source.path;
      break;

    case "github": {
      const { repo, path: subPath } = spec.source;
      const cloneUrl = `https://github.com/${repo}.git`;
      statusSimple(`Downloading from github/${repo}${subPath ? ` (${subPath})` : ""}...`);
      const result = await gitClone(cloneUrl, spec.name, spec.source.path);
      cacheDir = result.cacheDir;
      sha = result.sha;
      statusDone(`Downloaded github/${repo}`);
      break;
    }

    case "git": {
      statusSimple(`Downloading from ${spec.source.url}...`);
      const result = await gitClone(spec.source.url, spec.name);
      cacheDir = result.cacheDir;
      sha = result.sha;
      statusDone(`Downloaded`);
      break;
    }

    case "marketplace": {
      // For marketplace installs, the plugin name is used as the source identifier
      // The actual download happens via the marketplace browser
      // This case is handled by the marketplace module
      throw new Error(
        `Marketplace installs should go through the marketplace module, not directly through downloadPlugin`
      );
    }

    default:
      throw new Error(`Unknown source type: ${spec.source}`);
  }

  // Read and parse the manifest
  const manifest = readManifest(cacheDir, spec.source.type === "github" ? spec.source.path : undefined);

  return { cacheDir, manifest, sha, subPath: spec.source.type === "github" ? spec.source.path : undefined };
}

/**
 * Git clone a repository to the cache directory.
 */
async function gitClone(
  url: string,
  pluginName: string,
  subPath?: string
): Promise<{ cacheDir: string; sha: string }> {
  // Create cache directory
  mkdirSync(PLUGIN_CACHE_DIR, { recursive: true });

  // Generate a unique cache directory name from URL + plugin name (8 chars)
  // Each plugin gets its own isolated cache, even from the same repo
  const hash = createHash("sha1")
    .update(url + "|" + pluginName)
    .digest("hex")
    .slice(0, 8);
  const cacheDir = join(PLUGIN_CACHE_DIR, hash);

  // Clone the repository
  try {
    const stop = status("Cloning repository...");
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true, force: true });
    }
    execSync(`git clone --depth 1 ${url} "${cacheDir}"`, {
      stdio: "pipe",
    });
    stop();
  } catch (err: any) {
    stopSpinner();
    throw new Error(`Failed to clone ${url}: ${err.stderr?.toString() || err.message}`);
  }

  // Get the commit SHA
  let sha: string;
  try {
    sha = execSync("git rev-parse HEAD", {
      cwd: cacheDir,
      encoding: "utf-8",
    }).trim();
  } catch {
    sha = "unknown";
  }

  // If subPath is specified, we need to handle it
  // For now, the cacheDir points to the repo root; the caller should use cacheDir/subPath
  if (subPath) {
    const fullPath = join(cacheDir, subPath);
    if (!existsSync(fullPath)) {
      throw new Error(`Sub-path ${subPath} not found in ${url}`);
    }
    return { cacheDir: fullPath, sha };
  }

  return { cacheDir, sha };
}

/**
 * Peek at the skills directory and list actual skill names.
 * Returns an array of directory names that contain a SKILL.md file.
 */
export async function peekSkills(spec: PluginSpec): Promise<string[]> {
  try {
    if (spec.source.type === "github") {
      const { repo, path: subPath } = spec.source;
      const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
      const token = getGitHubToken();
      if (token) headers["Authorization"] = `token ${token}`;

      // Try subPath-based skills directory first, then fall back to repo root
      const urls = subPath
        ? [`https://api.github.com/repos/${repo}/contents/${subPath}/skills`, `https://api.github.com/repos/${repo}/contents/skills`]
        : [`https://api.github.com/repos/${repo}/contents/skills`];

      for (const apiUrl of urls) {
        const response = await fetch(apiUrl, { headers });
        if (response.ok) {
          const items = await response.json() as Array<{ name: string; type: string }>;
          // Filter to directories (we'll check for SKILL.md later)
          return items.filter(i => i.type === "dir").map(i => i.name);
        }
      }
      return [];
    }

    if (spec.source.type === "local") {
      // Read the skills directory directly
      const skillsDir = join(spec.source.path, "skills");
      if (!existsSync(skillsDir)) return [];
      const entries = readdirSync(skillsDir);
      return entries.filter((entry: string) => {
        const skillMd = join(skillsDir, entry, "SKILL.md");
        return existsSync(skillMd);
      });
    }
  } catch {
    // If we can't peek, return empty
  }
  return [];
}

/**
 * Read the plugin manifest from a plugin directory.
 * Tries plugin.json first, then falls back to .mcp.json and .github/mcp.json.
 * If subPath is provided, also tries at that subdirectory.
 */
export function readManifest(pluginRoot: string, subPath?: string): PluginManifest {
  // Try paths in priority order
  const candidates: string[] = [];

  if (subPath) {
    // Agent Plugins 1.0: <subPath>/plugin.json
    candidates.push(`${pluginRoot}/${subPath}/plugin.json`);
  }

  // Legacy: .mcp.json or .github/mcp.json at root
  candidates.push(`${pluginRoot}/.mcp.json`);
  candidates.push(`${pluginRoot}/.github/mcp.json`);

  // Also try at subPath for legacy
  if (subPath) {
    candidates.push(`${pluginRoot}/${subPath}/.mcp.json`);
  }

  // Root-level plugin.json as last resort
  candidates.push(`${pluginRoot}/plugin.json`);

  for (const manifestPath of candidates) {
    try {
      const content = readFileSync(manifestPath, "utf-8");
      const parsed = JSON.parse(content);

      // If it's a valid manifest with $schema, return it
      if ("$schema" in parsed) {
        return parsed as PluginManifest;
      }

      // If it has mcpServers, treat as legacy MCP config
      if ("mcpServers" in parsed) {
        return createLegacyManifestFromContent(
          subPath?.split("/").pop() || "unknown",
          subPath,
          parsed
        );
      }
    } catch {
      // Try next candidate
    }
  }

  throw new Error(
    `Failed to read plugin.json from ${pluginRoot}: no manifest found in any expected location`
  );
}

// ─── Plugin Installation ────────────────────────────────────────────────────

/**
 * Install a plugin: download, extract, convert, and register.
 */
export async function installPluginPackage(
  spec: PluginSpec,
  local = false,
  verbose = false,
  dryRun = false,
  yes = false,
  outputDir?: string,
  backup = false
): Promise<InstallResult> {
  const result: InstallResult = {
    success: false,
    pluginName: spec.name,
    mcpServers: [],
    skills: [],
    agents: [],
  };

  try {
    // Resolve marketplace installs before downloading
    if (spec.source.type === "marketplace") {
      // Search ALL registered marketplaces for the plugin name
      const marketplaces = listMarketplaces();
      let found: { plugin: MarketplacePlugin; source: string } | null = null;

      for (const mp of marketplaces) {
        const result = await findPluginInMarketplace(mp.source, spec.name);
        if (result.plugin) {
          found = { plugin: result.plugin, source: mp.source };
          break;
        }
      }

      if (!found) {
        const available = marketplaces.map(m => m.name).join(", ");
        throw new Error(
          `Plugin "${spec.name}" not found in any marketplace (${available}). Use "pi-copilot-plugins marketplace browse <name>" to see available plugins.`
        );
      }

      const resolvedSpec = marketplacePluginToSpec(found.plugin, found.source);
      spec.name = resolvedSpec.name;
      spec.source = resolvedSpec.source;
    }

    // Step 1: Download the plugin
    const { cacheDir, manifest, sha } = await downloadPlugin(spec);
    if (verbose) {
      console.log(`  Cache directory: ${cacheDir}`);
      if (sha) console.log(`  Commit SHA: ${sha}`);
      if (manifest.version) console.log(`  Version: ${manifest.version}`);
    }

    // Step 2: Extract components (use repo root, not subPath)
    const components = extractPluginComponents(manifest, cacheDir);
    if (verbose) {
      console.log(`  Extracted MCP servers: ${components.mcpServers.length}`);
      console.log(`  Extracted skills: ${components.skills.length}`);
      console.log(`  Extracted agents: ${components.agents.length}`);
    }

    // Step 3: Convert MCP servers
    const piMcpServers = convertMcpServers({ mcpServers: components.mcpServers });
    if (verbose && Object.keys(piMcpServers).length > 0) {
      console.log(`  Converted MCP servers: ${Object.keys(piMcpServers).join(", ")}`);
    }

    // Step 4: Write MCP servers to Pi's mcp.json
    let installedMcp: string[] = [];
    if (dryRun) {
      // Dry run: just list what would be added
      installedMcp = Object.keys(piMcpServers);
      if (verbose) {
        console.log(`  Would write ${installedMcp.length} MCP server(s) to mcp.json`);
        for (const server of installedMcp) {
          console.log(`    - ${server}`);
        }
      }
    } else {
      installedMcp = await writeMcpServers(piMcpServers, spec, local);
      if (verbose) {
        console.log(`  Wrote ${installedMcp.length} MCP server(s) to mcp.json`);
      }
    }

    // Step 5: Copy skills
    const installedSkills: string[] = [];
    if (components.skills.length > 0 && !dryRun) {
      const stop = status(`Copying ${components.skills.length} skill(s)...`);
      for (const skill of components.skills) {
        try {
          await copySkill(skill, cacheDir, local);
          installedSkills.push(skill.name);
          if (verbose) console.log(`  Copied skill: ${skill.name} (${skill.skillMdPath})`);
        } catch (err: any) {
          // Soft-fail: preserve existing skills
          if (err.message.includes("already exists")) {
            // Skip, don't add to installed list
          } else {
            throw err;
          }
        }
      }
      stop();
      statusDone(`Copied ${installedSkills.length} skill(s)`);
    } else if (components.skills.length > 0) {
      statusDone(`Would copy ${components.skills.length} skill(s)`);
    }

    // Step 6: Copy agents
    const installedAgents: string[] = [];
    if (components.agents.length > 0 && !dryRun) {
      const stop = status(`Copying ${components.agents.length} agent(s)...`);
      for (const agent of components.agents) {
        try {
          await copyAgent(agent, cacheDir, local);
          installedAgents.push(agent.name);
          if (verbose) console.log(`  Copied agent: ${agent.name} (${agent.agentMdPath})`);
        } catch (err: any) {
          // Soft-fail: preserve existing agents
          if (err.message.includes("already exists")) {
            // Skip, don't add to installed list
          } else {
            throw err;
          }
        }
      }
      stop();
      statusDone(`Copied ${installedAgents.length} agent(s)`);
    } else if (components.agents.length > 0) {
      statusDone(`Would copy ${components.agents.length} agent(s)`);
    }

    // Step 7: Create plugin data directory
    if (!dryRun) {
      mkdirSync(`${PLUGIN_DATA_DIR}/${spec.name}`, { recursive: true });
      if (verbose) console.log(`  Created data directory: ${PLUGIN_DATA_DIR}/${spec.name}`);
    }

    // Step 8: Register in the plugin registry
    if (!dryRun) {
      // Store the parent cache dir (hash dir) for cleanup on uninstall
      // cacheDir is either <PLUGIN_CACHE_DIR>/<hash> or <PLUGIN_CACHE_DIR>/<hash>/<subPath>
      // We want the <hash> dir
      let cacheParentDir: string | undefined;
      const normalized = cacheDir.replace(/\\/g, "/");
      const prefix = PLUGIN_CACHE_DIR.replace(/\\/g, "/") + "/";
      if (normalized.startsWith(prefix)) {
        const rel = normalized.slice(prefix.length);
        cacheParentDir = join(PLUGIN_CACHE_DIR, rel.split("/")[0]);
      }
      installPlugin(
        spec.name,
        spec.source,
        manifest.version,
        installedMcp,
        installedSkills,
        installedAgents,
        local ? "project" : "user",
        cacheParentDir,
        sha
      );
      if (verbose) console.log(`  Registered plugin in registry`);
    }

    result.success = true;
    result.version = manifest.version;
    result.sha = sha;
    result.mcpServers = installedMcp;
    result.skills = installedSkills;
    result.agents = installedAgents;

    // Emit warning for untrusted sources
    if (spec.source.type === "github" || spec.source.type === "local") {
      console.warn(
        `⚠️  Warning: You are installing a plugin from ${spec.source.type} source. ` +
          `Only install plugins from sources you trust.`
      );
    }
  } catch (err: any) {
    result.success = false;
    result.errors = [err.message];
  }

  return result;
}

/**
 * Write MCP servers to Pi's mcp.json using atomic merge.
 */
async function writeMcpServers(
  piMcpServers: Record<string, any>,
  spec: PluginSpec,
  local = false
): Promise<string[]> {
  const scope: "user" | "project" = local ? "project" : "user";
  const { mcpJson: mcpJsonPath } = resolvePaths(scope);
  let mcpConfig: Record<string, any> = {};

  // Read existing mcp.json
  if (existsSync(mcpJsonPath)) {
    try {
      const content = readFileSync(mcpJsonPath, "utf-8");
      mcpConfig = JSON.parse(content);
    } catch {
      // Invalid JSON, start fresh
    }
  }

  // Merge in new servers
  const installedMcp: string[] = [];
  for (const [name, server] of Object.entries(piMcpServers)) {
    mcpConfig[name] = server;
    installedMcp.push(name);
  }

  // Ensure directory exists for project-level
  if (scope === "project") {
    const projectDir = dirname(mcpJsonPath);
    mkdirSync(projectDir, { recursive: true });
  }

  // Atomic write
  const tmpDir = mkdtempSync(join(tmpdir(), "pi-mcp-"));
  const tmpFile = join(tmpDir, "mcp.json.tmp");

  writeFileSync(tmpFile, JSON.stringify(mcpConfig, null, 2), "utf-8");

  try {
    renameSync(tmpFile, mcpJsonPath);
  } catch {
    writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), "utf-8");
  }

  return installedMcp;
}

/**
 * Copy a skill to Pi's skills directory.
 */
async function copySkill(
  skill: { name: string; skillMdPath: string },
  pluginRoot: string,
  local = false
): Promise<void> {
  const scope: "user" | "project" = local ? "project" : "user";
  const { skillsDir } = resolvePaths(scope);
  const destDir = join(skillsDir, skill.name);
  const destPath = join(destDir, "SKILL.md");

  if (existsSync(destPath)) {
    throw new Error(`Skill ${skill.name} already exists`);
  }

  mkdirSync(destDir, { recursive: true });

  const sourcePath = join(pluginRoot, skill.skillMdPath);
  const content = readFileSync(sourcePath, "utf-8");
  writeFileSync(destPath, content, "utf-8");
}

/**
 * Copy an agent to Pi's agents directory.
 */
async function copyAgent(
  agent: { name: string; agentMdPath: string },
  pluginRoot: string,
  local = false
): Promise<void> {
  const scope: "user" | "project" = local ? "project" : "user";
  const { agentsDir } = resolvePaths(scope);
  const destPath = join(agentsDir, `${agent.name}.agent.md`);

  if (existsSync(destPath)) {
    throw new Error(`Agent ${agent.name} already exists`);
  }

  mkdirSync(agentsDir, { recursive: true });

  const sourcePath = join(pluginRoot, agent.agentMdPath);
  const content = readFileSync(sourcePath, "utf-8");
  writeFileSync(destPath, content, "utf-8");
}

// ─── Plugin Uninstallation ──────────────────────────────────────────────────

/**
 * Uninstall a plugin: remove from registry, mcp.json, skills, agents, and cache.
 */
export function uninstallPluginPackage(name: string, local = false, verbose = false, dryRun = false, yes = false, outputDir?: string, backup = false): UninstallResult {
  const result: UninstallResult = {
    success: false,
    pluginName: name,
    removedMcpServers: [],
    removedSkills: [],
    removedAgents: [],
  };

  try {
    const registry = readRegistry();
    const plugin = registry.plugins[name];

    if (!plugin) {
      throw new Error(`Plugin "${name}" is not installed`);
    }

    const scope: "user" | "project" = plugin.scope || "user";

    // If --local is specified, only uninstall project-level plugins
    // If --local is not specified, only uninstall user-level plugins
    if (local && scope !== "project") {
      throw new Error(`Plugin "${name}" is installed at user level, not project level. Use without --local.`);
    }
    if (!local && scope === "project") {
      throw new Error(`Plugin "${name}" is installed at project level. Use --local to uninstall.`);
    }

    if (verbose) {
      console.log(`  Scope: ${scope}`);
      console.log(`  Registry entry: ${JSON.stringify(plugin)}`);
    }

    // Remove MCP servers from mcp.json
    const { mcpJson: mcpJsonPath } = resolvePaths(scope);
    if (verbose) console.log(`  MCP config path: ${mcpJsonPath}`);
    let mcpConfig: Record<string, any> = {};

    if (existsSync(mcpJsonPath)) {
      try {
        const content = readFileSync(mcpJsonPath, "utf-8");
        mcpConfig = JSON.parse(content);
      } catch {
        // Invalid JSON, start fresh
      }
    }

    // Check ownership before removing
    for (const serverName of plugin.components.mcpServers) {
      const owner = getServerOwner(serverName);
      if (owner === name) {
        if (!dryRun) {
          delete mcpConfig[serverName];
        }
        result.removedMcpServers.push(serverName);
        if (verbose) console.log(`  ${dryRun ? "Would remove" : "Removed"} MCP server: ${serverName}`);
      }
    }

    if (!dryRun) {
      // Atomic write
      const tmpDir = mkdtempSync(join(tmpdir(), "pi-mcp-"));
      const tmpFile = join(tmpDir, "mcp.json.tmp");

      writeFileSync(tmpFile, JSON.stringify(mcpConfig, null, 2), "utf-8");

      try {
        renameSync(tmpFile, mcpJsonPath);
      } catch {
        writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), "utf-8");
      }
      if (verbose) console.log(`  Written updated MCP config to ${mcpJsonPath}`);
    }

    // Remove skills
    const { skillsDir } = resolvePaths(scope);
    if (verbose) console.log(`  Skills directory: ${skillsDir}`);

    for (const skillName of plugin.components.skills) {
      const skillPath = join(skillsDir, skillName);
      if (dryRun) {
        result.removedSkills.push(skillName);
        if (verbose) console.log(`  Would remove skill: ${skillName}`);
      } else {
        try {
          rmSync(skillPath, { recursive: true, force: true });
          result.removedSkills.push(skillName);
          if (verbose) console.log(`  Removed skill: ${skillName}`);
        } catch {
          // Ignore errors on skill removal
        }
      }
    }

    // Remove agents
    const { agentsDir } = resolvePaths(scope);
    if (verbose) console.log(`  Agents directory: ${agentsDir}`);

    for (const agentName of plugin.components.agents) {
      const agentPath = join(agentsDir, `${agentName}.agent.md`);
      if (dryRun) {
        result.removedAgents.push(agentName);
        if (verbose) console.log(`  Would remove agent: ${agentName}`);
      } else {
        try {
          rmSync(agentPath, { force: true });
          result.removedAgents.push(agentName);
          if (verbose) console.log(`  Removed agent: ${agentName}`);
        } catch {
          // Ignore errors on agent removal
        }
      }
    }

    if (!dryRun) {
      // Remove cache directory (user-level only)
      if (scope === "user" && plugin.cacheDir) {
        if (verbose) console.log(`  Removing cache directory: ${plugin.cacheDir}`);
        try {
          rmSync(plugin.cacheDir, { recursive: true, force: true });
        } catch {
          // Ignore errors on cache removal
        }
      }

      // Remove data directory
      const dataDir = PLUGIN_DATA_DIR;
      if (verbose) console.log(`  Removing data directory: ${join(dataDir, name)}`);
      try {
        rmSync(join(dataDir, name), { recursive: true, force: true });
      } catch {
        // Ignore errors on data removal
      }

      // Remove from registry
      uninstallPlugin(name);
      if (verbose) console.log(`  Removed from registry`);
    }

    result.success = true;
  } catch (err: any) {
    result.success = false;
    result.errors = [err.message];
  }

  return result;
}

// ─── Plugin Update ──────────────────────────────────────────────────────────

/**
 * Update a plugin: re-download, extract, and merge updated components.
 */
export async function updatePluginPackage(
  name: string,
  local = false,
  verbose = false,
  dryRun = false,
  yes = false,
  outputDir?: string,
  backup = false
): Promise<InstallResult> {
  const result: InstallResult = {
    success: false,
    pluginName: name,
    mcpServers: [],
    skills: [],
    agents: [],
  };

  try {
    const registry = readRegistry();
    const plugin = registry.plugins[name];

    if (!plugin) {
      throw new Error(`Plugin "${name}" is not installed`);
    }

    if (verbose) {
      console.log(`  Updating plugin: ${name}`);
      console.log(`  Source: ${JSON.stringify(plugin.source)}`);
    }

    // Re-download the plugin (same as install but reuses cache if unchanged)
    const pluginSpec: PluginSpec = { name, source: plugin.source };
    const downloadResult = await downloadPlugin(pluginSpec);

    if (!downloadResult.manifest) {
      throw new Error(`No manifest found for plugin "${name}"`);
    }

    // Extract components from the downloaded plugin
    const components = extractPluginComponents(downloadResult.manifest, downloadResult.cacheDir);

    if (verbose) {
      console.log(`  Extracted ${components.mcpServers.length} MCP server(s), ${components.skills.length} skill(s), ${components.agents.length} agent(s)`);
    }

    // Merge MCP servers into mcp.json
    const { mcpJson } = resolvePaths(local ? "project" : "user");
    let piMcpServers: Record<string, any> = {};

    if (existsSync(mcpJson)) {
      try {
        const content = readFileSync(mcpJson, "utf-8");
        piMcpServers = JSON.parse(content);
      } catch {
        // Invalid JSON, start fresh
      }
    }

    // Convert and merge MCP servers
    const converted = convertMcpServers({ mcpServers: components.mcpServers });
    
    for (const [serverName, piServer] of Object.entries(converted)) {
      if (verbose) {
        console.log(`  Adding MCP server: ${serverName} (${piServer.type || "stdio"})`);
      }
      piMcpServers[serverName] = piServer;
      result.mcpServers.push(serverName);
    }

    // Write MCP servers (atomic)
    if (!dryRun) {
      const tmpDirName = mkdtempSync(join(tmpdir(), "pi-mcp-"));
      const tmpFile = join(tmpDirName, "mcp.json.tmp");

      writeFileSync(tmpFile, JSON.stringify(piMcpServers, null, 2), "utf-8");

      try {
        renameSync(tmpFile, mcpJson);
      } catch {
        writeFileSync(mcpJson, JSON.stringify(piMcpServers, null, 2), "utf-8");
      }
      if (verbose) console.log(`  Written updated MCP config to ${mcpJson}`);
    }

    // Copy skills (overwrite existing)
    for (const skill of components.skills) {
      const skillMdPath = join(downloadResult.cacheDir, skill.skillMdPath);
      if (dryRun) {
        result.skills.push(skill.name);
        if (verbose) console.log(`  Would update skill: ${skill.name}`);
      } else {
        try {
          const content = readFileSync(skillMdPath, "utf-8");
          const destPath = join(SKILLS_DIR, skill.name, "SKILL.md");
          ensureDir(dirname(destPath));
          writeFileSync(destPath, content, "utf-8");
          result.skills.push(skill.name);
          if (verbose) console.log(`  Updated skill: ${skill.name}`);
        } catch {
          // Ignore errors on skill copy
        }
      }
    }

    // Copy agents (overwrite existing)
    for (const agent of components.agents) {
      const agentMdPath = join(downloadResult.cacheDir, agent.agentMdPath);
      if (dryRun) {
        result.agents.push(agent.name);
        if (verbose) console.log(`  Would update agent: ${agent.name}`);
      } else {
        try {
          const content = readFileSync(agentMdPath, "utf-8");
          const destPath = join(AGENTS_SKILLS_DIR, `${agent.name}.agent.md`);
          ensureDir(dirname(destPath));
          writeFileSync(destPath, content, "utf-8");
          result.agents.push(agent.name);
          if (verbose) console.log(`  Updated agent: ${agent.name}`);
        } catch {
          // Ignore errors on agent copy
        }
      }
    }

    // Update registry entry with new version/SHA
    if (!dryRun) {
      const manifestVersion = "version" in downloadResult.manifest && downloadResult.manifest.version ? downloadResult.manifest.version : undefined;
      registry.plugins[name] = {
        ...plugin,
        version: manifestVersion || plugin.version,
        sha: downloadResult.sha || plugin.sha,
        components: {
          mcpServers: Object.keys(components.mcpServers),
          skills: components.skills.map(s => s.name),
          agents: components.agents.map(a => a.name),
        },
        cacheDir: downloadResult.cacheDir,
        installedAt: plugin.installedAt,
      };
      writeRegistry(registry);
      if (verbose) console.log(`  Updated registry entry`);
    }

    result.success = true;
  } catch (err: any) {
    result.success = false;
    result.errors = [err.message];
  }

  return result;
}
