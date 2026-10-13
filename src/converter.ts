import type {
  CopilotMcpConfig,
  CopilotMcpServer,
  PiMcpServer,
  ExtractedComponents,
  PluginManifest,
  LegacyManifest,
  SkillEntry,
  AgentEntry,
} from "./types.js";
import { isAgentPlugins } from "./types.js";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";

// ─── MCP Server Conversion ──────────────────────────────────────────────────

/**
 * Convert a Copilot MCP config to Pi's format.
 * Returns a map of server name → PiMcpServer.
 */
export function convertMcpServers(
  copilotConfig: CopilotMcpConfig
): Record<string, PiMcpServer> {
  const result: Record<string, PiMcpServer> = {};

  for (const [name, server] of Object.entries(copilotConfig.mcpServers)) {
    const piServer = convertMcpServer(name, server);
    if (piServer) {
      result[name] = piServer;
    }
  }

  return result;
}

/**
 * Convert a single Copilot MCP server to Pi's format.
 */
function convertMcpServer(
  name: string,
  server: CopilotMcpServer
): PiMcpServer | null {
  // Skip servers with no transport (invalid)
  if (!server.command && !server.url && !server.type) {
    return null;
  }

  const piServer: PiMcpServer = {};

  // Determine transport
  if (server.command) {
    // Stdio server
    piServer.command = server.command;
    if (server.args) {
      // Args are expanded at install time; here we just pass them through
      // since we don't have the cache/data dirs at conversion time
      piServer.args = server.args;
    }
    if (server.env) {
      piServer.env = { ...server.env };
    }
    if (server.cwd) {
      // CWD is expanded at install time; pass through for now
      piServer.cwd = server.cwd;
    }
  }

  if (server.url) {
    // HTTP server
    piServer.url = server.url;
    if (server.headers) {
      piServer.headers = { ...server.headers };
    }
  }

  // Preserve type if present (Pi accepts it as optional)
  if (server.type) {
    piServer.type = server.type;
  }

  // Timeout
  if (server.timeout) {
    piServer.timeout = server.timeout;
  }

  // Convert Copilot OAuth to Pi OAuth
  if (server.oauthClientId || server.auth) {
    piServer.oauth = {};
    if (server.oauthClientId) {
      piServer.oauth.clientId = server.oauthClientId;
    }
    // oauthPublicClient is not needed in Pi's format
    if (server.auth?.redirectPort) {
      piServer.oauth.callbackPort = server.auth.redirectPort;
    }
    if (server.auth?.callbackUrl) {
      piServer.oauth.callbackUrl = server.auth.callbackUrl;
    }
  }

  return piServer;
}

/**
 * Expand ${PLUGIN_ROOT} and ${PLUGIN_DATA} placeholders in a string or array.
 * These are expanded at install time with concrete paths.
 */
export function expandPluginPlaceholders(
  input: string | string[],
  pluginName: string,
  cacheDir: string,
  dataDir: string
): string | string[] {
  const replace = (value: string): string =>
    value
      .replace(/\$\{PLUGIN_ROOT\}/g, cacheDir)
      .replace(/\$\{PLUGIN_DATA\}/g, dataDir)
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, cacheDir)
      .replace(/\$\{COPILOT_PLUGIN_ROOT\}/g, cacheDir)
      .replace(/\$\{CLAUDE_PLUGIN_DATA\}/g, dataDir)
      .replace(/\$\{COPILOT_PLUGIN_DATA\}/g, dataDir);

  if (Array.isArray(input)) {
    return input.map(replace);
  }
  return replace(input);
}

// ─── Plugin Extraction ──────────────────────────────────────────────────────

/**
 * Extract skills from a plugin directory.
 * For Agent Plugins 1.0: skills/ subdirectories with SKILL.md
 * For Legacy: skills/ or configured skills paths from plugin.json
 */
export function extractSkills(
  manifest: PluginManifest,
  pluginRoot: string
): SkillEntry[] {
  const skills: SkillEntry[] = [];

  let skillPaths: string[] = [];

  if (isAgentPlugins(manifest)) {
    // Agent Plugins 1.0: fixed location
    skillPaths = ["skills"];
  } else {
    // Legacy: use configured path or default
    if (typeof manifest.skills === "string") {
      skillPaths = [manifest.skills];
    } else if (Array.isArray(manifest.skills)) {
      skillPaths = manifest.skills;
    } else {
      skillPaths = ["skills"];
    }
  }

  for (const skillPath of skillPaths) {
    const fullSkillPath = `${pluginRoot}/${skillPath}`;
    const entries = listDirectory(fullSkillPath);
    for (const entry of entries) {
      const skillMd = `${fullSkillPath}/${entry}/SKILL.md`;
      if (existsSync(skillMd)) {
        skills.push({
          name: entry,
          skillMdPath: `${skillPath}/${entry}/SKILL.md`,
        });
      }
    }
  }

  return skills;
}

/**
 * Extract agents from a plugin directory.
 * For Agent Plugins 1.0: com.github.copilot/agents/
 * For Legacy: agents/ or configured agents paths from plugin.json
 */
export function extractAgents(
  manifest: PluginManifest,
  pluginRoot: string
): AgentEntry[] {
  const agents: AgentEntry[] = [];

  let agentPaths: string[] = [];

  if (isAgentPlugins(manifest)) {
    // Agent Plugins 1.0: client-specific agents
    agentPaths = ["com.github.copilot/agents"];
  } else {
    // Legacy: use configured path or default
    if (typeof manifest.agents === "string") {
      agentPaths = [manifest.agents];
    } else if (Array.isArray(manifest.agents)) {
      agentPaths = manifest.agents;
    } else {
      agentPaths = ["agents"];
    }
  }

  for (const agentPath of agentPaths) {
    const fullAgentPath = `${pluginRoot}/${agentPath}`;
    const entries = listDirectory(fullAgentPath);
    for (const entry of entries) {
      // .agent.md files or directories containing .agent.md
      const agentMd = `${fullAgentPath}/${entry}`;
      let agentName: string;
      let agentMdPath: string;

      if (entry.endsWith(".agent.md")) {
        agentName = entry.replace(/\.agent\.md$/, "");
        agentMdPath = `${agentPath}/${entry}`;
      } else {
        // Check if directory contains a .agent.md file
        const nestedEntries = listDirectory(agentMd);
        for (const nested of nestedEntries) {
          if (nested.endsWith(".agent.md")) {
            agentName = nested.replace(/\.agent\.md$/, "");
            agentMdPath = `${agentPath}/${entry}/${nested}`;
            agents.push({ name: agentName, agentMdPath });
          }
        }
        continue;
      }

      if (existsSync(agentMd)) {
        agents.push({ name: agentName, agentMdPath });
      }
    }
  }

  return agents;
}

// ─── File System Helpers ─────────────────────────────────────────────────────

function listDirectory(dir: string): string[] {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f: string) => {
      try {
        return statSync(`${dir}/${f}`).isDirectory() || f.endsWith(".md");
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

// ─── MCP Config Sources ─────────────────────────────────────────────────────

/**
 * Extract MCP server config from various sources.
 * Agent Plugins 1.0: root mcp.json
 * Legacy: .mcp.json, .github/mcp.json, or mcpServers field in plugin.json
 */
export function extractMcpConfig(
  manifest: PluginManifest,
  pluginRoot: string
): CopilotMcpConfig | null {
  if (isAgentPlugins(manifest)) {
    // Agent Plugins 1.0: read from root mcp.json
    return readMcpJson(`${pluginRoot}/mcp.json`);
  }

  // Legacy: try various locations
  const sources = [
    `${pluginRoot}/.mcp.json`,
    `${pluginRoot}/.github/mcp.json`,
  ];

  for (const source of sources) {
    const config = readMcpJson(source);
    if (config) return config;
  }

  // Check mcpServers field in plugin.json
  if ((manifest as LegacyManifest).mcpServers !== undefined) {
    const mcpServers = (manifest as LegacyManifest).mcpServers;
    if (typeof mcpServers === "string") {
      return readMcpJson(`${pluginRoot}/${mcpServers}`);
    }
    if (typeof mcpServers === "object" && mcpServers !== null && !Array.isArray(mcpServers)) {
      return { mcpServers: mcpServers as Record<string, CopilotMcpServer> };
    }
  }

  return null;
}

function readMcpJson(path: string): CopilotMcpConfig | null {
  try {
    const content = readFileSync(path, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed && parsed.mcpServers && typeof parsed.mcpServers === "object") {
      return parsed as CopilotMcpConfig;
    }
  } catch {
    // File doesn't exist or is invalid JSON
  }
  return null;
}

// ─── Full Extraction ────────────────────────────────────────────────────────

/**
 * Extract all components from a plugin directory.
 */
export function extractPluginComponents(
  manifest: PluginManifest,
  pluginRoot: string
): ExtractedComponents {
  const mcpConfig = extractMcpConfig(manifest, pluginRoot);
  const mcpServers = mcpConfig ? mcpConfig.mcpServers : {};
  const skills = extractSkills(manifest, pluginRoot);
  const agents = extractAgents(manifest, pluginRoot);

  return { manifest, mcpServers, skills, agents };
}
