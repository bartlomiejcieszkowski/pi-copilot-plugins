// ─── Plugin Manifest Types ───────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "node:fs";

/** Agent Plugins 1.0 / 1.1 manifest */
export interface AgentPluginsManifest {
  $schema: string;
  name: string;
  version?: string;
  description?: string;
  author?: { name: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  extensions?: Record<string, unknown>;
}

/** Legacy Copilot plugin manifest */
export interface LegacyManifest {
  name: string;
  description?: string;
  version?: string;
  author?: { name: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  category?: string;
  tags?: string[];
  // Component path fields
  agents?: string | string[];
  skills?: string | string[];
  commands?: string | string[];
  hooks?: string | object;
  extensions?: string | string[] | { paths: string[]; exclusive?: boolean };
  mcpServers?: string | object;
  lspServers?: string | object;
  [key: string]: unknown;
}

/** Union of both manifest formats */
export type PluginManifest = AgentPluginsManifest | LegacyManifest;

/** Whether a manifest is Agent Plugins 1.0 */
export function isAgentPlugins(manifest: PluginManifest): manifest is AgentPluginsManifest {
  return (
    "$schema" in manifest &&
    manifest.$schema === "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" ||
    manifest.$schema === "https://agent-plugins.org/schemas/1.1.0/plugin.schema.json"
  );
}

// ─── MCP Server Types ────────────────────────────────────────────────────────

/** Copilot's .mcp.json format */
export interface CopilotMcpConfig {
  mcpServers: Record<string, CopilotMcpServer>;
}

/** A single MCP server in Copilot's format */
export interface CopilotMcpServer {
  type?: "stdio" | "http" | "streamable-http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  timeout?: number;
  // Copilot-specific OAuth
  oauthClientId?: string;
  oauthPublicClient?: boolean;
  auth?: { redirectPort?: number; callbackUrl?: string };
}

/** Pi's mcp.json format (subset of what Pi accepts) */
export interface PiMcpServer {
  type?: "stdio" | "http" | "streamable-http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  timeout?: number;
  enabled?: boolean;
  exposure?: "codemode" | "deferred" | "direct" | "hidden";
  toolExposure?: Record<string, string>;
  description?: string;
  oauth?: {
    clientId?: string;
    clientSecret?: string;
    callbackPort?: number;
    callbackUrl?: string;
    scope?: string;
    clientName?: string;
    clientRegistration?: "cimd";
    authServerMetadataUrl?: string;
  };
}

// ─── Marketplace Types ───────────────────────────────────────────────────────

/** Marketplace.json top-level */
export interface MarketplaceManifest {
  name: string;
  owner?: { name: string; email?: string };
  metadata?: { description?: string; version?: string };
  plugins: MarketplacePlugin[];
}

/** A single plugin entry in a marketplace */
export interface MarketplacePlugin {
  name: string;
  description?: string;
  version?: string;
  author?: { name: string; url?: string };
  homepage?: string;
  keywords?: string[];
  license?: string;
  repository?: string;
  source: string | MarketplaceSource;
}

/** Source specification for a marketplace plugin */
export interface MarketplaceSource {
  source: "github";
  repo: string;
  path?: string;
}

// ─── Plugin Source Types ─────────────────────────────────────────────────────

export type PluginSource =
  | { type: "marketplace"; marketplace: string; scope?: "user" | "project" }
  | { type: "github"; repo: string; path?: string; scope?: "user" | "project" }
  | { type: "git"; url: string; scope?: "user" | "project" }
  | { type: "local"; path: string; scope?: "user" | "project" };

/** Parsed plugin specification from CLI */
export interface PluginSpec {
  source: PluginSource;
  name: string;
}

// ─── Registry Types ──────────────────────────────────────────────────────────

/** Registry file structure */
export interface PluginRegistry {
  marketplaces: Record<string, RegistryMarketplace>;
  plugins: Record<string, RegistryPlugin>;
  config?: PluginConfig;
}

/** Plugin configuration (secrets, preferences) */
export interface PluginConfig {
  githubToken?: string;
  tools?: Record<string, boolean>;
}

/** Built-in tool names */
export const TOOL_NAMES = [
  "copilot_plugins_browse",
  "copilot_plugins_install",
  "copilot_plugins_list",
  "copilot_plugins_uninstall",
  "copilot_plugins_enable",
  "copilot_plugins_disable",
  "copilot_plugins_update",
  "copilot_plugins_info",
  "copilot_plugins_search",
  "copilot_plugins_peek",
  "copilot_plugins_marketplace_add",
  "copilot_plugins_marketplace_list",
  "copilot_plugins_marketplace_refresh",
  "copilot_plugins_marketplace_remove",
] as const;

export type ToolName = typeof TOOL_NAMES[number];

/**
 * Get the default tool state (all disabled).
 */
export function getDefaultToolState(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const name of TOOL_NAMES) {
    state[name] = false;
  }
  return state;
}

/**
 * Get tool enabled state from config, falling back to defaults.
 */
export function getToolState(): Record<string, boolean> {
  try {
    const registry = readFileSync(COPILOT_PLUGINS_JSON, "utf-8");
    const parsed = JSON.parse(registry) as PluginRegistry;
    if (parsed.config?.tools) {
      // Merge with defaults so any missing tools use default (disabled)
      const merged: Record<string, boolean> = { ...getDefaultToolState() };
      for (const name of TOOL_NAMES) {
        if (parsed.config!.tools![name] !== undefined) {
          merged[name] = parsed.config!.tools![name]!;
        }
      }
      return merged;
    }
  } catch {
    // Config file doesn't exist or is invalid — fall through to defaults
  }
  return getDefaultToolState();
}

/**
 * Enable or disable a tool in the config.
 */
export function setToolEnabled(name: string, enabled: boolean): void {
  try {
    const registry = readFileSync(COPILOT_PLUGINS_JSON, "utf-8");
    const parsed = JSON.parse(registry) as PluginRegistry;
    if (!parsed.config) parsed.config = {};
    if (!parsed.config.tools) parsed.config.tools = {};
    parsed.config.tools[name] = enabled;
    writeFileSync(COPILOT_PLUGINS_JSON, JSON.stringify(parsed, null, 2));
  } catch {
    // If we can't read the file, try to write a new one
    const parsed: PluginRegistry = {
      marketplaces: {},
      plugins: {},
      config: { tools: { [name]: enabled } },
    };
    writeFileSync(COPILOT_PLUGINS_JSON, JSON.stringify(parsed, null, 2));
  }
}

/**
 * Get the GitHub token, checking config first, then environment variables.
 * Config token takes precedence over env vars.
 */
export function getGitHubToken(): string | undefined {
  try {
    const registry = readFileSync(COPILOT_PLUGINS_JSON, "utf-8");
    const parsed = JSON.parse(registry) as PluginRegistry;
    if (parsed.config?.githubToken) {
      return parsed.config.githubToken;
    }
  } catch {
    // Config file doesn't exist or is invalid — fall through to env vars
  }
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
}

export interface RegistryMarketplace {
  source: string;
}

export interface RegistryPlugin {
  name: string;
  version?: string;
  sha?: string;
  enabled: boolean;
  installedAt: string;
  source: PluginSource;
  scope: "user" | "project";
  cacheDir?: string;
  components: {
    mcpServers: string[];
    skills: string[];
    agents: string[];
  };
}

// ─── Extracted Plugin Components ─────────────────────────────────────────────

/** What was extracted from a plugin */
export interface ExtractedComponents {
  manifest: PluginManifest;
  mcpServers: Record<string, CopilotMcpServer>;
  skills: SkillEntry[];
  agents: AgentEntry[];
}

export interface SkillEntry {
  name: string;
  skillMdPath: string; // relative to plugin root
}

export interface AgentEntry {
  name: string;
  agentMdPath: string; // relative to plugin root
}

// ─── CLI Output Types ────────────────────────────────────────────────────────

export interface InstalledPluginInfo {
  name: string;
  version?: string;
  sha?: string;
  enabled: boolean;
  source: string;
  mcpServers: string[];
  skills: string[];
  agents: string[];
}

export interface InstallResult {
  success: boolean;
  pluginName: string;
  version?: string;
  sha?: string;
  mcpServers: string[];
  skills: string[];
  agents: string[];
  errors?: string[];
}

export interface UninstallResult {
  success: boolean;
  pluginName: string;
  removedMcpServers: string[];
  removedSkills: string[];
  removedAgents: string[];
  errors?: string[];
}

// ─── Path Constants ──────────────────────────────────────────────────────────

// ─── Path Configuration ──────────────────────────────────────────────────────

// These can be overridden by tests via setTestPaths()
let _testPaths: {
  piAgentDir?: string;
  mcpJson?: string;
  copilotPluginsJson?: string;
  pluginCacheDir?: string;
  pluginDataDir?: string;
  agentsDir?: string;
  skillsDir?: string;
  agentsSkillsDir?: string;
} | null = null;

/** Override all paths with test values. Call from vitest setup. */
export function setTestPaths(paths: typeof _testPaths): void {
  _testPaths = paths;
}

/** Reset paths to defaults. Call from vitest teardown. */
export function resetTestPaths(): void {
  _testPaths = null;
}

function resolvePath(base: string, fallback: string): string {
  if (_testPaths && base === "PI_AGENT_DIR") return _testPaths.piAgentDir ?? fallback;
  if (_testPaths && base === "MCP_JSON") return _testPaths.mcpJson ?? fallback;
  if (_testPaths && base === "COPILOT_PLUGINS_JSON") return _testPaths.copilotPluginsJson ?? fallback;
  if (_testPaths && base === "PLUGIN_CACHE_DIR") return _testPaths.pluginCacheDir ?? fallback;
  if (_testPaths && base === "PLUGIN_DATA_DIR") return _testPaths.pluginDataDir ?? fallback;
  if (_testPaths && base === "AGENTS_DIR") return _testPaths.agentsDir ?? fallback;
  if (_testPaths && base === "SKILLS_DIR") return _testPaths.skillsDir ?? fallback;
  if (_testPaths && base === "AGENTS_SKILLS_DIR") return _testPaths.agentsSkillsDir ?? fallback;
  return fallback;
}

export const HOME = process.env.HOME || process.env.USERPROFILE || "";

// User-level paths
export const PI_AGENT_DIR: string = resolvePath("PI_AGENT_DIR", `${HOME}/.pi/agent`);
export const MCP_JSON: string = resolvePath("MCP_JSON", `${PI_AGENT_DIR}/mcp.json`);
export const COPILOT_PLUGINS_JSON: string = resolvePath("COPILOT_PLUGINS_JSON", `${PI_AGENT_DIR}/copilot-plugins.json`);
export const PLUGIN_CACHE_DIR: string = resolvePath("PLUGIN_CACHE_DIR", `${PI_AGENT_DIR}/copilot-plugins-cache`);
export const PLUGIN_DATA_DIR: string = resolvePath("PLUGIN_DATA_DIR", `${PI_AGENT_DIR}/copilot-plugins-data`);

// Project-level paths (relative to CWD)
export const PI_MCP_JSON = `${process.cwd()}/.pi/mcp.json`;
export const PI_PROJECT_DIR = `${process.cwd()}/.pi`;

// Pi skill/agent discovery directories — user-level
export const AGENTS_DIR: string = resolvePath("AGENTS_DIR", process.env.AGENTS_DIR || `${HOME}/.agents`);
export const SKILLS_DIR: string = resolvePath("SKILLS_DIR", `${AGENTS_DIR}/skills`);
export const AGENTS_SKILLS_DIR: string = resolvePath("AGENTS_SKILLS_DIR", `${AGENTS_DIR}/agents`);

// Pi skill/agent discovery directories — project-level
export const PROJECT_AGENTS_DIR = `${process.cwd()}/.agents`;
export const PROJECT_SKILLS_DIR = `${PROJECT_AGENTS_DIR}/skills`;
export const PROJECT_AGENTS_DIR_PATH = `${PROJECT_AGENTS_DIR}/agents`;

/** Resolve paths based on scope (user vs project). */
export function resolvePaths(scope: "user" | "project" = "user", outputDir?: string): {
  mcpJson: string;
  skillsDir: string;
  agentsDir: string;
  registry: string;
  cacheDir: string;
  dataDir: string;
} {
  if (outputDir) {
    return {
      mcpJson: `${outputDir}/mcp.json`,
      skillsDir: `${outputDir}/skills`,
      agentsDir: `${outputDir}/agents`,
      registry: `${outputDir}/copilot-plugins.json`,
      cacheDir: `${outputDir}/cache`,
      dataDir: `${outputDir}/data`,
    };
  }
  if (scope === "project") {
    return {
      mcpJson: PI_MCP_JSON,
      skillsDir: PROJECT_SKILLS_DIR,
      agentsDir: PROJECT_AGENTS_DIR_PATH,
      registry: COPILOT_PLUGINS_JSON,
      cacheDir: PLUGIN_CACHE_DIR,
      dataDir: PLUGIN_DATA_DIR,
    };
  }
  return {
    mcpJson: MCP_JSON,
    skillsDir: SKILLS_DIR,
    agentsDir: AGENTS_SKILLS_DIR,
    registry: COPILOT_PLUGINS_JSON,
    cacheDir: PLUGIN_CACHE_DIR,
    dataDir: PLUGIN_DATA_DIR,
  };
}
