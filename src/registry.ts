import type {
  PluginRegistry,
  RegistryPlugin,
  RegistryMarketplace,
  PluginSource,
  InstallResult,
  UninstallResult,
  InstalledPluginInfo,
} from "./types.js";
import {
  COPILOT_PLUGINS_JSON,
  PLUGIN_CACHE_DIR,
  PLUGIN_DATA_DIR,
} from "./types.js";
import { readFileSync, writeFileSync, renameSync, mkdtempSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ─── Registry Operations ────────────────────────────────────────────────────

/**
 * Read the plugin registry. Creates it if it doesn't exist.
 */
export function readRegistry(): PluginRegistry {
  try {
    const content = readFileSync(COPILOT_PLUGINS_JSON, "utf-8");
    return JSON.parse(content) as PluginRegistry;
  } catch {
    return { marketplaces: {}, plugins: {} };
  }
}

/**
 * Write the plugin registry. Uses atomic write (temp file + rename).
 */
export function writeRegistry(registry: PluginRegistry): void {
  const tmpDir = mkdtempSync(join(tmpdir(), "pi-copilot-plugins-"));
  const tmpFile = join(tmpDir, "copilot-plugins.json.tmp");

  writeFileSync(tmpFile, JSON.stringify(registry, null, 2), "utf-8");

  try {
    renameSync(tmpFile, COPILOT_PLUGINS_JSON);
  } catch {
    // Fallback: ensure dir exists, then direct write
    try {
      mkdirSync(join(COPILOT_PLUGINS_JSON, ".."), { recursive: true });
    } catch {
      // Dir might already exist
    }
    writeFileSync(COPILOT_PLUGINS_JSON, JSON.stringify(registry, null, 2), "utf-8");
  }
}

/**
 * Install a plugin in the registry.
 */
export function installPlugin(
  name: string,
  source: PluginSource,
  version?: string,
  mcpServers?: string[],
  skills?: string[],
  agents?: string[],
  scope: "user" | "project" = "user",
  cacheDir?: string,
  sha?: string,
  lastVersion?: string
): RegistryPlugin {
  const registry = readRegistry();

  // If plugin already exists, save its current version as lastVersion
  const existing = registry.plugins[name];
  if (existing && !lastVersion && existing.version) {
    lastVersion = existing.version;
  }

  const plugin: RegistryPlugin = {
    name,
    version,
    sha,
    lastVersion,
    enabled: true,
    installedAt: existing?.installedAt || new Date().toISOString(),
    source,
    scope,
    cacheDir,
    components: {
      mcpServers: mcpServers || [],
      skills: skills || [],
      agents: agents || [],
    },
  };

  registry.plugins[name] = plugin;
  writeRegistry(registry);

  return plugin;
}

/**
 * Uninstall a plugin from the registry.
 */
export function uninstallPlugin(name: string): boolean {
  const registry = readRegistry();

  if (!registry.plugins[name]) {
    return false;
  }

  delete registry.plugins[name];
  writeRegistry(registry);

  return true;
}

/**
 * Enable a plugin.
 */
export function enablePlugin(name: string): boolean {
  const registry = readRegistry();

  if (!registry.plugins[name]) {
    return false;
  }

  registry.plugins[name].enabled = true;
  writeRegistry(registry);

  return true;
}

/**
 * Disable a plugin.
 */
export function disablePlugin(name: string): boolean {
  const registry = readRegistry();

  if (!registry.plugins[name]) {
    return false;
  }

  registry.plugins[name].enabled = false;
  writeRegistry(registry);

  return true;
}

/**
 * Get an installed plugin by name.
 */
export function getPlugin(name: string): RegistryPlugin | undefined {
  const registry = readRegistry();
  return registry.plugins[name];
}

/**
 * List all installed plugins.
 */
export function listPlugins(filter?: { enabled?: boolean }): InstalledPluginInfo[] {
  const registry = readRegistry();
  const plugins = Object.values(registry.plugins);

  if (filter?.enabled !== undefined) {
    return plugins
      .filter((p) => p.enabled === filter.enabled)
      .map(toInstalledInfo);
  }

  return plugins.map(toInstalledInfo);
}

/**
 * Register a marketplace.
 */
export function registerMarketplace(
  name: string,
  source: string
): RegistryMarketplace {
  const registry = readRegistry();

  registry.marketplaces[name] = { source };
  writeRegistry(registry);

  return registry.marketplaces[name];
}

/**
 * Unregister a marketplace.
 */
export function unregisterMarketplace(name: string): boolean {
  const registry = readRegistry();

  if (!registry.marketplaces[name]) {
    return false;
  }

  delete registry.marketplaces[name];
  writeRegistry(registry);

  return true;
}

/**
 * List all registered marketplaces.
 */
export function listMarketplaces(): { name: string; source: string }[] {
  const registry = readRegistry();
  return Object.entries(registry.marketplaces).map(([name, mp]) => ({ name, ...mp }));
}

/**
 * Get a marketplace by name.
 */
export function getMarketplace(name: string): RegistryMarketplace | undefined {
  const registry = readRegistry();
  return registry.marketplaces[name];
}

/**
 * Check if a plugin is installed.
 */
export function isPluginInstalled(name: string): boolean {
  const registry = readRegistry();
  return !!registry.plugins[name];
}

/**
 * Get the owner of an MCP server (which plugin installed it).
 */
export function getServerOwner(serverName: string): string | undefined {
  const registry = readRegistry();

  for (const plugin of Object.values(registry.plugins)) {
    if (plugin.components.mcpServers.includes(serverName)) {
      return plugin.name;
    }
  }

  return undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toInstalledInfo(plugin: RegistryPlugin): InstalledPluginInfo {
  let source = "local";
  if (plugin.source.type === "marketplace") {
    source = plugin.source.marketplace;
  } else if (plugin.source.type === "github") {
    source = plugin.source.repo;
  } else if (plugin.source.type === "git") {
    source = plugin.source.url;
  } else if (plugin.source.type === "local") {
    source = plugin.source.path;
  }

  return {
    name: plugin.name,
    version: plugin.version,
    sha: plugin.sha,
    enabled: plugin.enabled,
    source,
    mcpServers: plugin.components.mcpServers,
    skills: plugin.components.skills,
    agents: plugin.components.agents,
  };
}
