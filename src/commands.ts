import type { PluginSpec, PluginSource, InstallResult, UninstallResult } from "./types.js";
import { installPluginPackage, uninstallPluginPackage } from "./installer.js";
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

export async function cmdInstall(spec: string, local = false): Promise<InstallResult> {
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
    if (!plugin) {
      throw new Error(`Plugin "${pluginSpec.name}" not found in marketplace "${marketplaceName}"`);
    }

    pluginSpec.source = { ...marketplacePluginToSpec(plugin, marketplaceName).source, scope };
  }

  if (local) {
    console.log(`Installing plugin "${pluginSpec.name}" at project level...`);
  } else {
    console.log(`Installing plugin "${pluginSpec.name}"...`);
  }
  const result = await installPluginPackage(pluginSpec, local);

  if (result.success) {
    console.log(`✓ Plugin "${pluginSpec.name}" installed successfully`);
    if (result.mcpServers.length > 0) {
      console.log(`  MCP servers: ${result.mcpServers.join(", ")}`);
    }
    if (result.skills.length > 0) {
      console.log(`  Skills: ${result.skills.join(", ")}`);
    }
    if (result.agents.length > 0) {
      console.log(`  Agents: ${result.agents.join(", ")}`);
    }
  } else {
    console.error(`✗ Failed to install plugin "${pluginSpec.name}"`);
    if (result.errors) {
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
    }
  }

  return result;
}

// ─── Uninstall Command ──────────────────────────────────────────────────────

export function cmdUninstall(name: string, local = false): UninstallResult {
  if (local) {
    console.log(`Uninstalling plugin "${name}" at project level...`);
  } else {
    console.log(`Uninstalling plugin "${name}"...`);
  }
  const result = uninstallPluginPackage(name, local);

  if (result.success) {
    console.log(`✓ Plugin "${name}" uninstalled successfully`);
    if (result.removedMcpServers.length > 0) {
      console.log(`  Removed MCP servers: ${result.removedMcpServers.join(", ")}`);
    }
    if (result.removedSkills.length > 0) {
      console.log(`  Removed skills: ${result.removedSkills.join(", ")}`);
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
    console.log(
      `${padRight(plugin.name, 25)} ${padRight(plugin.version || "-", 12)} ${padRight(plugin.enabled ? "✓" : "✗", 8)} ${padRight(plugin.source, 30)} ${plugin.mcpServers.join(", ") || "-"}`
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
    console.log(`✓ Plugin "${name}" enabled.`);
  } else {
    console.error(`✗ Plugin "${name}" is not installed.`);
  }
}

export function cmdDisable(name: string): void {
  const result = disablePlugin(name);
  if (result) {
    console.log(`✓ Plugin "${name}" disabled.`);
  } else {
    console.error(`✗ Plugin "${name}" is not installed.`);
  }
}

// ─── Marketplace Commands ───────────────────────────────────────────────────

export async function cmdMarketplaceAdd(spec: string): Promise<void> {
  // Parse the marketplace source
  const source = parseMarketplaceSource(spec);
  const name = source.name;

  registerMarketplace(name, source.source, source.autoUpdate);
  console.log(`✓ Marketplace "${name}" added.`);
}

function parseMarketplaceSource(spec: string): { name: string; source: string; autoUpdate?: boolean } {
  // GitHub repo: owner/repo or owner/repo#ref
  if (spec.includes("/")) {
    let [repo, ref] = spec.split("#");
    const autoUpdate = ref === "autoUpdate"; // Special case for auto-update opt-in
    return {
      name: repo.split("/")[1] || repo,
      source: repo,
      autoUpdate,
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

  console.log("Registered marketplaces:");
  for (const mp of marketplaces) {
    console.log(`  ${mp.source}${mp.autoUpdate ? " (auto-update)" : ""}`);
  }
}

export async function cmdMarketplaceBrowse(name: string, json = false): Promise<void> {
  const marketplace = getMarketplace(name);
  if (!marketplace) {
    throw new Error(`Marketplace "${name}" not found`);
  }

  const plugins = await listMarketplacePlugins(marketplace.source);

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
    await listMarketplacePlugins(marketplace.source);
    console.log(`✓ Marketplace "${name}" refreshed.`);
  } else {
    const marketplaces = listMarketplaces();
    console.log(`Refreshing ${marketplaces.length} marketplaces...`);
    for (const mp of marketplaces) {
      try {
        await listMarketplacePlugins(mp.source);
        console.log(`  ✓ ${mp.source}`);
      } catch (err: any) {
        console.log(`  ✗ ${mp.source}: ${err.message}`);
      }
    }
  }
}

export function cmdMarketplaceRemove(name: string, force = false): void {
  // Check if any plugins are installed from this marketplace
  if (!force) {
    const plugins = listPlugins();
    const installedFromMp = plugins.filter((p) => {
      if (p.source === name) return true;
      // Check if source contains the marketplace name
      return false;
    });

    if (installedFromMp.length > 0) {
      throw new Error(
        `Cannot remove marketplace "${name}": ${installedFromMp.length} plugin(s) are installed from it. ` +
          `Use --force to also uninstall them.`
      );
    }
  }

  const result = unregisterMarketplace(name);
  if (result) {
    console.log(`✓ Marketplace "${name}" removed.`);
  } else {
    console.error(`✗ Marketplace "${name}" not found.`);
  }
}

// ─── Search Command ─────────────────────────────────────────────────────────

export async function cmdSearch(query: string, json = false): Promise<void> {
  const plugins: { name: string; description?: string; source?: string }[] = [];

  // Search in all registered marketplaces
  const marketplaces = listMarketplaces();
  for (const mp of marketplaces) {
    try {
      const results = await searchMarketplacePlugins(mp.source, query);
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

  if (plugins.length === 0) {
    console.log(`No plugins found matching "${query}".`);
    return;
  }

  console.log(`Plugins matching "${query}":`);
  for (const plugin of plugins) {
    console.log(`  ${plugin.name}${plugin.description ? ` - ${plugin.description}` : ""}`);
    if (plugin.source) {
      console.log(`    from ${plugin.source}`);
    }
  }
}
