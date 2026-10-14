// ─── Plugin Manifest Types ───────────────────────────────────────────────────

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

export const HOME = process.env.HOME || process.env.USERPROFILE || "";

// User-level paths
export const PI_AGENT_DIR = process.env.PI_AGENT_DIR || `${HOME}/.pi/agent`;
export const MCP_JSON = `${PI_AGENT_DIR}/mcp.json`;
export const COPILOT_PLUGINS_JSON = `${PI_AGENT_DIR}/copilot-plugins.json`;
export const PLUGIN_CACHE_DIR = `${PI_AGENT_DIR}/copilot-plugins-cache`;
export const PLUGIN_DATA_DIR = `${PI_AGENT_DIR}/copilot-plugins-data`;

// Project-level paths (relative to CWD)
export const PI_MCP_JSON = `${process.cwd()}/.pi/mcp.json`;
export const PI_PROJECT_DIR = `${process.cwd()}/.pi`;

// Pi skill/agent discovery directories — user-level
export const AGENTS_DIR = process.env.AGENTS_DIR || `${HOME}/.agents`;
export const SKILLS_DIR = `${AGENTS_DIR}/skills`;
export const AGENTS_SKILLS_DIR = `${AGENTS_DIR}/agents`;

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
