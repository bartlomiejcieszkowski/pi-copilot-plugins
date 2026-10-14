import type {
  PluginSource,
  PluginSpec,
  PluginManifest,
  ExtractedComponents,
  InstallResult,
  UninstallResult,
} from "./types.js";
import {
  PLUGIN_CACHE_DIR,
  PLUGIN_DATA_DIR,
  resolvePaths,
  MCP_JSON,
  SKILLS_DIR,
  AGENTS_SKILLS_DIR,
} from "./types.js";
import {
  extractPluginComponents,
  convertMcpServers,
  expandPluginPlaceholders,
} from "./converter.js";
import {
  installPlugin,
  unregisterMarketplace,
  readRegistry,
  getServerOwner,
  uninstallPlugin,
} from "./registry.js";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { status, statusDone, statusWarn, statusError, statusSimple, stopSpinner } from "./progress.js";
import { tmpdir } from "node:os";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  mkdtempSync,
  renameSync,
} from "node:fs";
import { join, dirname } from "node:path";

// ─── Plugin Download ────────────────────────────────────────────────────────

/**
 * Download a plugin from its source to the cache directory.
 * Returns the cache directory path.
 */
export async function downloadPlugin(
  spec: PluginSpec
): Promise<{ cacheDir: string; manifest: PluginManifest; sha?: string }> {
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
      const result = await gitClone(cloneUrl, spec.source.path);
      cacheDir = result.cacheDir;
      sha = result.sha;
      statusDone(`Downloaded github/${repo}`);
      break;
    }

    case "git": {
      statusSimple(`Downloading from ${spec.source.url}...`);
      const result = await gitClone(spec.source.url);
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
  const manifest = readManifest(cacheDir);

  return { cacheDir, manifest, sha };
}

/**
 * Git clone a repository to the cache directory.
 */
async function gitClone(
  url: string,
  subPath?: string
): Promise<{ cacheDir: string; sha: string }> {
  // Create cache directory
  mkdirSync(PLUGIN_CACHE_DIR, { recursive: true });

  // Generate a unique cache directory name from the URL
  const hash = createHash("md5")
    .update(url)
    .digest("hex");
  const cacheDir = join(PLUGIN_CACHE_DIR, hash);

  // Clone the repository
  try {
    const stop = status("Cloning repository...");
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
 * Read the plugin manifest from a plugin directory.
 */
export function readManifest(pluginRoot: string): PluginManifest {
  const manifestPath = `${pluginRoot}/plugin.json`;

  try {
    const content = readFileSync(manifestPath, "utf-8");
    return JSON.parse(content) as PluginManifest;
  } catch (err: any) {
    throw new Error(
      `Failed to read plugin.json from ${pluginRoot}: ${err.message}`
    );
  }
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
  outputDir?: string
): Promise<InstallResult> {
  const result: InstallResult = {
    success: false,
    pluginName: spec.name,
    mcpServers: [],
    skills: [],
    agents: [],
  };

  try {
    // Step 1: Download the plugin
    const { cacheDir, manifest, sha } = await downloadPlugin(spec);
    if (verbose) {
      console.log(`  Cache directory: ${cacheDir}`);
      if (sha) console.log(`  Commit SHA: ${sha}`);
      if (manifest.version) console.log(`  Version: ${manifest.version}`);
    }

    // Step 2: Extract components
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
      installPlugin(
        spec.name,
        spec.source,
        manifest.version,
        installedMcp,
        installedSkills,
        installedAgents,
        local ? "project" : "user"
      );
      if (verbose) console.log(`  Registered plugin in registry`);
    }

    result.success = true;
    result.version = manifest.version;
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
export function uninstallPluginPackage(name: string, local = false, verbose = false, dryRun = false, yes = false, outputDir?: string): UninstallResult {
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
      if (scope === "user") {
        const cacheDir = PLUGIN_CACHE_DIR;
        if (verbose) console.log(`  Removing cache directory: ${cacheDir}`);
        try {
          rmSync(cacheDir, { recursive: true, force: true });
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
