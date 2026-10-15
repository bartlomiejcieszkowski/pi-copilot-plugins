import type { PluginSpec, PluginSource, InstallResult, UninstallResult } from "./types.js";
import { installPluginPackage, uninstallPluginPackage, reinstallPluginPackage, peekManifest, peekSkills } from "./installer.js";
import {
  listPlugins,
  registerMarketplace,
  unregisterMarketplace,
  listMarketplaces,
  getMarketplace,
  getPlugin,
  enablePlugin,
  disablePlugin,
} from "./registry.js";
import {
  listMarketplacePlugins,
  findPluginInMarketplace,
  searchMarketplacePlugins,
  registerDefaultMarketplace,
  isMarketplaceRegistered,
  marketplacePluginToSpec,
} from "./marketplace.js";
import { green, red, yellow, bold, cyan, gray } from "./colors.js";

// ─── CLI Command Implementations ────────────────────────────────────────────

/**
 * Parse a plugin specification string into a PluginSpec.
 * Formats:
 *   - name@marketplace: Plugin from a registered marketplace
 *   - owner/repo: GitHub repository root
 *   - owner/repo:path: Subdirectory in a GitHub repository
 *   - https://...: Git URL
 *   - ./path or /abs/path: Local path
 */
export function parseSpec(spec: string): PluginSpec {
  // Marketplace format: name@marketplace
  if (spec.includes("@") && !spec.includes("://")) {
    const [pluginName, marketplaceName] = spec.split("@");
    if (!isMarketplaceRegistered(marketplaceName)) {
      throw new Error(
        `Marketplace "${marketplaceName}" is not registered. ` +
          `Run "pi-copilot-plugins marketplace add <source>" to register it.`
      );
    }
    return {
      name: pluginName,
      source: { type: "marketplace", marketplace: marketplaceName },
    };
  }

  // Git URL
  if (spec.startsWith("http://") || spec.startsWith("https://")) {
    return {
      name: extractNameFromUrl(spec),
      source: { type: "git", url: spec },
    };
  }

  // Local path (check before GitHub to avoid ./path being parsed as GitHub)
  if (spec.startsWith("./") || spec.startsWith("/") || spec.startsWith("~")) {
    return {
      name: spec.split("/").pop()?.replace(/\.[^/.]+$/, "") || spec,
      source: { type: "local", path: spec },
    };
  }

  // GitHub repo with subdirectory: owner/repo:path
  if (spec.includes(":")) {
    const [repo, path] = spec.split(":");
    if (repo.includes("/")) {
      return {
        name: path ? path.split("/").pop() || path : repo.split("/").pop() || repo,
        source: { type: "github", repo, path },
      };
    }
  }

  // GitHub repo: owner/repo
  if (spec.includes("/")) {
    return {
      name: spec.split("/").pop() || spec,
      source: { type: "github", repo: spec },
    };
  }

  // Bare name — try marketplace first, then GitHub
  // For bare names, we assume it's from the default marketplace
  registerDefaultMarketplace();
  return {
    name: spec,
    source: { type: "marketplace", marketplace: "copilot-plugins" },
  };
}

function extractNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    return pathParts[pathParts.length - 1]?.replace(/\.git$/, "") || "unknown";
  } catch {
    return "unknown";
  }
}

// ─── Install Command ────────────────────────────────────────────────────────

export async function cmdInstall(spec: string, local = false, verbose = false, dryRun = false, yes = false, outputDir?: string, backup = false): Promise<InstallResult> {
  const pluginSpec = parseSpec(spec);
  const scope: "user" | "project" = local ? "project" : "user";

  // Tag source with scope
  pluginSpec.source = { ...pluginSpec.source, scope };

  // If it's a marketplace install, resolve the plugin details first
  if (pluginSpec.source.type === "marketplace") {
    const marketplaceName = pluginSpec.source.marketplace;
    const marketplace = getMarketplace(marketplaceName);
    if (!marketplace) {
      throw new Error(`Marketplace "${marketplaceName}" not found`);
    }

    const plugin = await findPluginInMarketplace(marketplace.source, pluginSpec.name);
    if (!plugin.plugin) {
      throw new Error(`Plugin "${pluginSpec.name}" not found in marketplace "${marketplaceName}"`);
    }

    pluginSpec.source = { ...marketplacePluginToSpec(plugin.plugin, marketplaceName).source, scope };
  }

  if (dryRun) {
    console.log(bold("DRY RUN — no changes will be made"));
  }
  if (local) {
    console.log(`Installing plugin ${bold(`"${pluginSpec.name}"`)} at project level...`);
  } else {
    console.log(`Installing plugin ${bold(`"${pluginSpec.name}"`)}...`);
  }
  if (verbose) {
    console.log(`  Source: ${JSON.stringify(pluginSpec.source)}`);
  }
  const result = await installPluginPackage(pluginSpec, local, verbose, dryRun, yes, outputDir, backup);

  if (result.success) {
    console.log(green(`✓ Plugin "${pluginSpec.name}" installed successfully`));
    if (result.version || result.sha) {
      const versionDisplay = result.version
        ? `${result.version}${result.sha ? ` (${result.sha.slice(0, 8)})` : ""}`
        : result.sha
          ? result.sha.slice(0, 8)
          : "";
      console.log(`  ${cyan("Version")}: ${versionDisplay || "-"}`);
    }
    if (result.mcpServers.length > 0) {
      console.log(`  ${cyan("MCP servers")}: ${result.mcpServers.join(", ")}`);
    }
    if (result.skills.length > 0) {
      console.log(`  ${cyan("Skills")}: ${result.skills.join(", ")}`);
    }
    if (result.agents.length > 0) {
      console.log(`  ${cyan("Agents")}: ${result.agents.join(", ")}`);
    }
  } else {
    console.error(red(`✗ Failed to install plugin "${pluginSpec.name}"`));
    if (result.errors) {
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
    }
  }

  return result;
}

// ─── Uninstall Command ──────────────────────────────────────────────────────

export function cmdUninstall(name: string, local = false, verbose = false, dryRun = false, yes = false, outputDir?: string, backup = false): UninstallResult {
  if (dryRun) {
    console.log(bold("DRY RUN — no changes will be made"));
  }
  if (local) {
    console.log(`Uninstalling plugin ${bold(`"${name}"`)} at project level...`);
  } else {
    console.log(`Uninstalling plugin ${bold(`"${name}"`)}...`);
  }
  if (verbose) {
    const plugin = getPlugin(name);
    if (plugin) {
      console.log(`  Registry: ${JSON.stringify(plugin)}`);
    }
  }
  const result = uninstallPluginPackage(name, local, verbose, dryRun, yes, outputDir, backup);

  if (result.success) {
    console.log(green(`✓ Plugin "${name}" uninstalled successfully`));
    if (result.removedMcpServers.length > 0) {
      console.log(`  ${cyan("Removed MCP servers")}: ${result.removedMcpServers.join(", ")}`);
    }
    if (result.removedSkills.length > 0) {
      console.log(`  ${cyan("Removed skills")}: ${result.removedSkills.join(", ")}`);
    }
    if (result.removedAgents.length > 0) {
      console.log(`  Removed agents: ${result.removedAgents.join(", ")}`);
    }
  } else {
    console.error(`✗ Failed to uninstall plugin "${name}"`);
    if (result.errors) {
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
    }
  }

  return result;
}

// ─── Reinstall Command ─────────────────────────────────────────────────────

export async function cmdReinstall(name: string, local = false, verbose = false, dryRun = false, yes = false, outputDir?: string, backup = false): Promise<InstallResult> {
  if (dryRun) {
    console.log(bold("DRY RUN — no changes will be made"));
  }
  if (local) {
    console.log(`  ${yellow("Scope")}: project`);
  }
  if (verbose) {
    console.log(`  ${yellow("Verbose")}: enabled`);
  }

  console.log(bold(`Reinstalling plugin "${name}"...`));
  const result = await reinstallPluginPackage(name, local, verbose, dryRun, yes, outputDir, backup);

  if (result.success) {
    console.log(green(`✓ Reinstalled plugin "${name}"`));
    if (result.version) {
      console.log(`  ${cyan("Version")}: ${result.version}${result.sha ? ` (${result.sha.slice(0, 8)})` : ""}`);
    }
    if (result.mcpServers.length > 0) {
      console.log(`  ${cyan("MCP servers")}: ${result.mcpServers.join(", ")}`);
    }
    if (result.skills.length > 0) {
      console.log(`  ${cyan("Skills")}: ${result.skills.join(", ")}`);
    }
    if (result.agents.length > 0) {
      console.log(`  ${cyan("Agents")}: ${result.agents.join(", ")}`);
    }
  } else {
    console.error(red(`✗ Failed to reinstall plugin "${name}"`));
    if (result.errors) {
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
    }
  }

  return result;
}

// ─── List Command ───────────────────────────────────────────────────────────

export function cmdList(json = false): void {
  const plugins = listPlugins();

  if (json) {
    console.log(JSON.stringify(plugins, null, 2));
    return;
  }

  if (plugins.length === 0) {
    console.log("No plugins installed.");
    return;
  }

  // Header
  console.log(
    `${padRight("NAME", 25)} ${padRight("VERSION", 12)} ${padRight("ENABLED", 8)} ${padRight("SOURCE", 30)} MCP SERVERS`
  );
  console.log("-".repeat(100));

  for (const plugin of plugins) {
    const versionDisplay = plugin.version
      ? `${plugin.version}${plugin.sha ? ` (${plugin.sha.slice(0, 8)})` : ""}`
      : plugin.sha
        ? plugin.sha.slice(0, 8)
        : "-";
    console.log(
      `${padRight(plugin.name, 25)} ${padRight(versionDisplay, 12)} ${padRight(plugin.enabled ? "✓" : "✗", 8)} ${padRight(plugin.source, 30)} ${plugin.mcpServers.join(", ") || "-"}`
    );
  }
}

function padRight(str: string, width: number): string {
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

// ─── Update Command ─────────────────────────────────────────────────────────

export async function cmdUpdate(name?: string, all = false): Promise<void> {
  if (!name && !all) {
    throw new Error("Specify a plugin name or use --all to update all plugins");
  }

  if (all) {
    const plugins = listPlugins();
    console.log(`Updating ${plugins.length} plugins...`);
    for (const plugin of plugins) {
      console.log(`  Updating "${plugin.name}"...`);
      await cmdInstall(plugin.source);
    }
    console.log("✓ All plugins updated.");
    return;
  }

  if (!name) return;

  const plugin = getPlugin(name);
  if (!plugin) {
    throw new Error(`Plugin "${name}" is not installed`);
  }

  console.log(`Updating plugin "${name}"...`);
  const result = await installPluginPackage({ source: plugin.source, name: plugin.name });

  if (result.success) {
    console.log(`✓ Plugin "${name}" updated successfully`);
  } else {
    console.error(`✗ Failed to update plugin "${name}"`);
    if (result.errors) {
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
    }
  }
}

// ─── Enable/Disable Commands ────────────────────────────────────────────────

export function cmdEnable(name: string): void {
  const result = enablePlugin(name);
  if (result) {
    console.log(green(`✓ Plugin "${name}" enabled.`));
  } else {
    console.error(red(`✗ Plugin "${name}" is not installed.`));
  }
}

export function cmdDisable(name: string): void {
  const result = disablePlugin(name);
  if (result) {
    console.log(green(`✓ Plugin "${name}" disabled.`));
  } else {
    console.error(red(`✗ Plugin "${name}" is not installed.`));
  }
}

// ─── Marketplace Commands ───────────────────────────────────────────────────

export async function cmdMarketplaceAdd(spec: string): Promise<void> {
  // Parse the marketplace source
  const source = parseMarketplaceSource(spec);
  const name = source.name;

  registerMarketplace(name, source.source);
  console.log(`✓ Marketplace "${name}" added.`);
}

function parseMarketplaceSource(spec: string): { name: string; source: string } {
  // GitHub repo: owner/repo
  if (spec.includes("/")) {
    const repo = spec.split("#")[0]; // Ignore anything after #
    return {
      name: repo.split("/")[1] || repo,
      source: repo,
    };
  }

  // Local path
  return {
    name: spec.split("/").pop() || spec,
    source: spec,
  };
}

export function cmdMarketplaceList(json = false): void {
  const marketplaces = listMarketplaces();

  if (json) {
    console.log(JSON.stringify(marketplaces, null, 2));
    return;
  }

  if (marketplaces.length === 0) {
    console.log("No marketplaces registered.");
    return;
  }

  console.log(bold("Registered marketplaces:"));
  for (const mp of marketplaces) {
    console.log(`  ${cyan(mp.name)}${gray(` (${mp.source})`)}`);
  }
}

export async function cmdMarketplaceBrowse(name: string, json = false): Promise<void> {
  const marketplace = getMarketplace(name);
  if (!marketplace) {
    throw new Error(`Marketplace "${name}" not found`);
  }

  const { plugins, stale } = await listMarketplacePlugins(marketplace.source);

  if (stale) {
    console.log(gray(`  (cached — last updated over 24h ago. Run "marketplace refresh ${name}" to update)`));
  }

  if (json) {
    console.log(JSON.stringify(plugins, null, 2));
    return;
  }

  console.log(`Plugins in "${name}":`);
  for (const plugin of plugins) {
    console.log(`  ${plugin.name}${plugin.version ? ` (${plugin.version})` : ""}`);
    if (plugin.description) {
      console.log(`    ${plugin.description}`);
    }
  }
}

export async function cmdMarketplaceRefresh(name?: string): Promise<void> {
  if (name) {
    const marketplace = getMarketplace(name);
    if (!marketplace) {
      throw new Error(`Marketplace "${name}" not found`);
    }

    // Re-fetch the marketplace to verify it's accessible
    await listMarketplacePlugins(marketplace.source, true);
    console.log(`✓ Marketplace "${name}" refreshed.`);
  } else {
    const marketplaces = listMarketplaces();
    console.log(`Refreshing ${marketplaces.length} marketplaces...`);
    for (const mp of marketplaces) {
      try {
        await listMarketplacePlugins(mp.source, true);
        console.log(`  ✓ ${mp.source}`);
      } catch (err: any) {
        console.log(`  ✗ ${mp.source}: ${err.message}`);
      }
    }
  }
}

export function cmdMarketplaceRemove(nameOrSource: string, force = false): void {
  // Try to find by name first, then by source
  let marketplaceName: string | undefined;
  const marketplaces = listMarketplaces();
  const byName = marketplaces.find(mp => mp.name === nameOrSource);
  const bySource = marketplaces.find(mp => mp.source === nameOrSource);

  if (byName) {
    marketplaceName = byName.name;
  } else if (bySource) {
    marketplaceName = bySource.name;
  }

  if (!marketplaceName) {
    throw new Error(`Marketplace "${nameOrSource}" not found. Use "marketplace list" to see available marketplaces.`);
  }

  // Check if any plugins are installed from this marketplace
  if (!force) {
    const plugins = listPlugins();
    const installedFromMp = plugins.filter((p) => {
      if (p.source === nameOrSource) return true;
      // Check if source contains the marketplace name
      return false;
    });

    if (installedFromMp.length > 0) {
      throw new Error(
        `Cannot remove marketplace "${nameOrSource}": ${installedFromMp.length} plugin(s) are installed from it. ` +
          `Use --force to also uninstall them.`
      );
    }
  }

  unregisterMarketplace(marketplaceName);
  console.log(`✓ Marketplace "${nameOrSource}" removed.`);
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Extract names from an array that may be strings or objects with name property.
 */
function extractNames(arr: unknown[]): string[] {
  return arr.map(item => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && "name" in item) return (item as { name: string }).name;
    return "unknown";
  });
}

/**
 * Extract skill names from manifest skills field.
 * Skills can be strings (paths) or objects with name/path.
 */
function extractSkillNames(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  return skills.map(item => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      if ("name" in item) return (item as { name: string }).name;
      if ("path" in item) return (item as { path: string }).path;
    }
    return "unknown";
  });
}

// ─── Search Command ─────────────────────────────────────────────────────────

export async function cmdSearch(query: string, json = false): Promise<void> {
  const plugins: { name: string; description?: string; source?: string }[] = [];
  let anyStale = false;

  // Search in all registered marketplaces
  const marketplaces = listMarketplaces();
  for (const mp of marketplaces) {
    try {
      const { results, stale } = await searchMarketplacePlugins(mp.source, query);
      if (stale) anyStale = true;
      for (const r of results) {
        plugins.push({
          name: r.name,
          description: r.description,
          source: mp.source,
        });
      }
    } catch {
      // Skip marketplace fetch errors
    }
  }

  if (json) {
    console.log(JSON.stringify(plugins, null, 2));
    return;
  }

  if (anyStale) {
    console.log(gray(`  (some results from cached marketplace — run "marketplace refresh" to update)`));
  }

  if (plugins.length === 0) {
    console.log(`No plugins found matching "${query}".`);
    return;
  }

  console.log(bold(`Plugins matching "${query}":`));
  for (const plugin of plugins) {
    console.log(`  ${cyan(plugin.name)}${plugin.description ? gray(` - ${plugin.description}`) : ""}`);
    if (plugin.source) {
      console.log(`    from ${plugin.source}`);
    }
  }
}

// ─── Peek Command ────────────────────────────────────────────────────────────

interface PeekResult {
  marketplace: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  mcpServers?: string[];
  skills?: string[];
  agents?: string[];
  warnings?: string[];
}

/**
 * Peek at a plugin's manifest and components without downloading.
 * Searches all registered marketplaces (or a specific one if scoped).
 */
export async function cmdPeek(spec: string, json = false): Promise<void> {
  const marketplaces = listMarketplaces();
  if (marketplaces.length === 0) {
    console.log("No marketplaces registered. Add one with:");
    console.log("  pi-copilot-plugins marketplace add github/awesome-copilot");
    return;
  }

  const results: PeekResult[] = [];

  // Check if spec is scoped to a marketplace: name@marketplace-source
  let targetMarketplace: string | null = null;
  let pluginName: string;

  if (spec.includes("@")) {
    const [name, marketplaceSource] = spec.split("@");
    pluginName = name;
    targetMarketplace = marketplaceSource;
  } else {
    pluginName = spec;
  }

  for (const mp of marketplaces) {
    // Skip if scoped to a specific marketplace that doesn't match
    if (targetMarketplace && mp.source !== targetMarketplace && mp.name !== targetMarketplace) continue;

    try {
      const { plugins, stale } = await listMarketplacePlugins(mp.source);
      const match = plugins.find(p => p.name.toLowerCase() === pluginName.toLowerCase());
      if (!match) continue;

      // Convert to PluginSpec for peekManifest
      const pluginSpec = marketplacePluginToSpec(match, mp.source);

      // Peek the manifest
      const manifest = await peekManifest(pluginSpec);
      if (!manifest) continue;

      // Peek actual skills from the skills directory
      const skills = await peekSkills(pluginSpec);

      const mcpServers = "mcpServers" in manifest && manifest.mcpServers && typeof manifest.mcpServers === "object"
        ? Object.keys(manifest.mcpServers as Record<string, unknown>)
        : [];
      const agents = "agents" in manifest && manifest.agents && Array.isArray(manifest.agents)
        ? extractNames(manifest.agents)
        : [];

      const result: PeekResult = {
        marketplace: mp.source,
        name: match.name,
        version: match.version,
        description: match.description,
        source: typeof match.source === "string" ? match.source : JSON.stringify(match.source),
        mcpServers,
        skills,
        agents,
      };

      // Check for warnings
      if (!result.mcpServers?.length && !result.skills?.length && !result.agents?.length) {
        result.warnings = ["No installable components (MCP servers, skills, or agents) found. Plugin may contain only Copilot-specific extensions."];
      }

      results.push(result);
    } catch {
      // Skip marketplace fetch errors
    }
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`No plugin found matching "${pluginName}"${targetMarketplace ? ` in ${targetMarketplace}` : ""}.`);
    return;
  }

  // Check if any results have installable components
  const hasInstallable = results.some(r => r.mcpServers?.length || r.skills?.length || r.agents?.length);
  if (!hasInstallable) {
    console.log(cyan(`Found "${pluginName}" but no installable components (MCP servers, skills, or agents).`));
    console.log(`  These plugins may only contain Copilot-specific extensions, which are not supported by Pi.`);
    console.log(`  Try installing from a different marketplace or source.`);
    return;
  }

  for (const result of results) {
    console.log(bold(`\n${result.name}${result.version ? ` v${result.version}` : ""}`));
    console.log(`  from ${result.marketplace}`);
    if (result.description) {
      console.log(`  ${result.description}`);
    }
    console.log(`  source: ${result.source}`);

    if (result.mcpServers?.length) {
      console.log(`  MCP servers:`);
      for (const s of result.mcpServers) {
        console.log(`    - ${s}`);
      }
    }
    if (result.skills?.length) {
      console.log(`  Skills:`);
      for (const s of result.skills) {
        console.log(`    - ${s}`);
      }
    }
    if (result.agents?.length) {
      console.log(`  Agents:`);
      for (const a of result.agents) {
        console.log(`    - ${a}`);
      }
    }
    if (result.warnings?.length) {
      for (const w of result.warnings) {
        console.log(red(`  ⚠️  ${w}`));
      }
    }
  }
}
