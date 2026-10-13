import type { MarketplaceManifest, MarketplacePlugin, PluginSpec, PluginSource } from "./types.js";
import { readRegistry, registerMarketplace } from "./registry.js";

const DEFAULT_MARKETPLACE = "copilot-plugins";
const DEFAULT_MARKETPLACE_SOURCE = "github/copilot-plugins";

/**
 * Fetch a marketplace manifest from a GitHub repository.
 */
export async function fetchMarketplace(source: string): Promise<MarketplaceManifest> {
  // Parse the source (owner/repo format)
  const [owner, repo] = source.split("/");

  // Try the standard marketplace.json location
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/.github/plugin/marketplace.json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    // Try 'master' branch as fallback
    const urlMaster = `https://raw.githubusercontent.com/${owner}/${repo}/master/.github/plugin/marketplace.json`;
    response = await fetch(urlMaster);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch marketplace from ${source}: HTTP ${response.status}`);
  }

  return response.json() as Promise<MarketplaceManifest>;
}

/**
 * List plugins from a marketplace.
 */
export async function listMarketplacePlugins(source: string): Promise<MarketplacePlugin[]> {
  const marketplace = await fetchMarketplace(source);
  return marketplace.plugins;
}

/**
 * Find a plugin by name in a marketplace.
 */
export async function findPluginInMarketplace(
  source: string,
  name: string
): Promise<MarketplacePlugin | undefined> {
  const plugins = await listMarketplacePlugins(source);
  return plugins.find((p) => p.name === name);
}

/**
 * Search plugins in a marketplace by keyword.
 */
export async function searchMarketplacePlugins(
  source: string,
  query: string
): Promise<MarketplacePlugin[]> {
  const plugins = await listMarketplacePlugins(source);
  const lowerQuery = query.toLowerCase();

  return plugins.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      (p.description && p.description.toLowerCase().includes(lowerQuery)) ||
      (p.keywords && p.keywords.some((k) => k.toLowerCase().includes(lowerQuery)))
  );
}

/**
 * Get the default marketplace info.
 */
export function getDefaultMarketplace(): { name: string; source: string } {
  return { name: DEFAULT_MARKETPLACE, source: DEFAULT_MARKETPLACE_SOURCE };
}

/**
 * Check if a marketplace is registered.
 */
export function isMarketplaceRegistered(name: string): boolean {
  try {
    const registry = readRegistry();
    return !!registry.marketplaces[name];
  } catch {
    return false;
  }
}

/**
 * Register the default marketplace if not already registered.
 */
export function registerDefaultMarketplace(): void {
  try {
    if (!isMarketplaceRegistered(DEFAULT_MARKETPLACE)) {
      registerMarketplace(DEFAULT_MARKETPLACE, DEFAULT_MARKETPLACE_SOURCE, true);
    }
  } catch {
    // Registry not available (e.g., during tests), skip
  }
}

/**
 * Convert a marketplace plugin source to a PluginSource.
 */
export function marketplacePluginToSpec(
  plugin: MarketplacePlugin,
  marketplaceName: string
): PluginSpec {
  let source: PluginSource;

  if (typeof plugin.source === "string") {
    // Direct path string — could be a GitHub repo reference or local path
    if (plugin.source.includes("/")) {
      const [owner, repo] = plugin.source.split("/");
      source = { type: "github", repo: `${owner}/${repo}` };
    } else {
      source = { type: "local", path: plugin.source };
    }
  } else if (typeof plugin.source === "object" && "source" in plugin.source) {
    // MarketplaceSource with source: "github"
    const ms = plugin.source as { source: string; repo: string; path?: string };
    if (ms.source === "github") {
      source = { type: "github", repo: ms.repo, path: ms.path };
    } else {
      source = { type: "local", path: JSON.stringify(plugin.source) };
    }
  } else {
    source = { type: "local", path: JSON.stringify(plugin.source) };
  }

  return {
    name: plugin.name,
    source,
  };
}
