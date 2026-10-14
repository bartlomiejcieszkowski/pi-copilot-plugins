import type { MarketplaceManifest, MarketplacePlugin, PluginSpec, PluginSource } from "./types.js";
import { readRegistry, registerMarketplace } from "./registry.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PI_AGENT_DIR } from "./types.js";
import { getGitHubToken } from "./types.js";

const DEFAULT_MARKETPLACE = "copilot-plugins";
const DEFAULT_MARKETPLACE_SOURCE = "github/copilot-plugins";

// Cache directory for marketplace manifests
const MARKETPLACE_CACHE_DIR = join(PI_AGENT_DIR, "copilot-plugins-marketplaces");
const FRESHNESS_FILE = join(MARKETPLACE_CACHE_DIR, "freshness.json");

// Cache TTL: 24 hours in milliseconds
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Get the cached marketplace manifest for a source, if available and fresh.
 * Returns { manifest, stale } where stale indicates if cache is older than 24h.
 */
function getCachedMarketplace(source: string): { manifest: MarketplaceManifest; stale: boolean } | null {
  try {
    if (!existsSync(FRESHNESS_FILE)) return null;

    const freshness = JSON.parse(readFileSync(FRESHNESS_FILE, "utf-8")) as Record<string, number>;
    const cacheTime = freshness[source];
    if (!cacheTime) return null;

    const cachePath = join(MARKETPLACE_CACHE_DIR, source.replace(/\//g, "_") + "-marketplace.json");
    if (!existsSync(cachePath)) return null;

    const manifest = JSON.parse(readFileSync(cachePath, "utf-8")) as MarketplaceManifest;
    const stale = Date.now() - cacheTime >= CACHE_TTL_MS;

    return { manifest, stale };
  } catch {
    // Ignore cache read errors
  }
  return null;
}

/**
 * Cache a marketplace manifest locally.
 */
function cacheMarketplace(source: string, manifest: MarketplaceManifest): void {
  try {
    mkdirSync(MARKETPLACE_CACHE_DIR, { recursive: true });

    // Save manifest
    const cachePath = join(MARKETPLACE_CACHE_DIR, source.replace(/\//g, "_") + "-marketplace.json");
    writeFileSync(cachePath, JSON.stringify(manifest, null, 2));

    // Update freshness timestamp
    let freshness: Record<string, number> = {};
    if (existsSync(FRESHNESS_FILE)) {
      try {
        freshness = JSON.parse(readFileSync(FRESHNESS_FILE, "utf-8")) as Record<string, number>;
      } catch {
        // Ignore parse errors
      }
    }
    freshness[source] = Date.now();
    writeFileSync(FRESHNESS_FILE, JSON.stringify(freshness, null, 2));
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Fetch a marketplace manifest from a GitHub repository.
 * Uses local cache if available. Returns { manifest, stale }.
 * Stale means cache is older than 24h — still returned but user is warned.
 * @param force - If true, bypass cache and always fetch from network.
 */
export async function fetchMarketplace(source: string, force = false): Promise<{ manifest: MarketplaceManifest; stale: boolean }> {
  // Check cache first (unless forced)
  if (!force) {
    const cached = getCachedMarketplace(source);
    if (cached) {
      return cached;
    }
  }

  // Parse the source (owner/repo format)
  const [owner, repo] = source.split("/");

  // Build headers — add token if available (config takes precedence over env)
  const headers: Record<string, string> = {};
  const token = getGitHubToken();
  if (token) headers["Authorization"] = `token ${token}`;

  // Try the standard marketplace.json location
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/.github/plugin/marketplace.json`;

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch {
    // Try 'master' branch as fallback
    const urlMaster = `https://raw.githubusercontent.com/${owner}/${repo}/master/.github/plugin/marketplace.json`;
    response = await fetch(urlMaster, { headers });
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch marketplace from ${source}: HTTP ${response.status}`);
  }

  const manifest = (await response.json()) as MarketplaceManifest;

  // Cache the result
  cacheMarketplace(source, manifest);

  return { manifest, stale: false };
}

/**
 * List plugins from a marketplace.
 * @param force - If true, bypass cache and always fetch from network.
 */
export async function listMarketplacePlugins(source: string, force = false): Promise<{ plugins: MarketplacePlugin[]; stale: boolean }> {
  const { manifest, stale } = await fetchMarketplace(source, force);
  return { plugins: manifest.plugins, stale };
}

/**
 * Find a plugin by name in a marketplace.
 * @param force - If true, bypass cache and always fetch from network.
 */
export async function findPluginInMarketplace(
  source: string,
  name: string,
  force = false
): Promise<{ plugin: MarketplacePlugin | undefined; stale: boolean }> {
  const { plugins, stale } = await listMarketplacePlugins(source, force);
  return { plugin: plugins.find((p) => p.name === name), stale };
}

/**
 * Search plugins in a marketplace by keyword.
 * @param force - If true, bypass cache and always fetch from network.
 */
export async function searchMarketplacePlugins(
  source: string,
  query: string,
  force = false
): Promise<{ results: MarketplacePlugin[]; stale: boolean }> {
  const { plugins, stale } = await listMarketplacePlugins(source, force);
  const lowerQuery = query.toLowerCase();

  const results = plugins.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      (p.description && p.description.toLowerCase().includes(lowerQuery)) ||
      (p.keywords && p.keywords.some((k) => k.toLowerCase().includes(lowerQuery)))
  );

  return { results, stale };
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
      registerMarketplace(DEFAULT_MARKETPLACE, DEFAULT_MARKETPLACE_SOURCE);
    }
  } catch {
    // Registry not available (e.g., during tests), skip
  }
}

/**
 * Convert a marketplace plugin source to a PluginSource.
 * @param marketplaceSource - The full repo path of the marketplace (e.g. "github/awesome-copilot").
 *                            Used when plugin.source is a subdirectory path within the marketplace.
 */
export function marketplacePluginToSpec(
  plugin: MarketplacePlugin,
  marketplaceSource: string
): PluginSpec {
  let source: PluginSource;

  if (typeof plugin.source === "string") {
    // Direct path string — check if it's a subdirectory within the marketplace repo
    // vs a standalone GitHub repo reference
    const parts = plugin.source.split("/");
    
    // Known directory patterns that indicate a subdirectory within the marketplace
    const subdirectoryPatterns = ["plugins", "agents", "skills", "mcp", "tools", "extensions"];
    const isSubdirectory = parts.length > 2 || subdirectoryPatterns.includes(parts[0]);
    
    if (isSubdirectory) {
      // Subdirectory within the marketplace repo
      source = { type: "github", repo: marketplaceSource, path: plugin.source };
    } else {
      // Standalone GitHub repo
      source = { type: "github", repo: plugin.source };
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
