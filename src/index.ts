// @ts-nocheck — Pi extension types are optional peer dependency
import type { ExtensionAPI, ExtensionCommandContext, ToolDefinition, ToolAnnotations, ToolNamespace } from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";
import { Type } from "typebox";

import type { PluginSpec } from "./types.js";
import { registerDefaultMarketplace, listMarketplacePlugins, findPluginInMarketplace, searchMarketplacePlugins, marketplacePluginToSpec } from "./marketplace.js";
import { installPluginPackage, uninstallPluginPackage, updatePluginPackage } from "./installer.js";
import { listPlugins, enablePlugin, disablePlugin, getMarketplace, getPlugin, uninstallPlugin } from "./registry.js";

// ─── TypeBox Schemas ────────────────────────────────────────────────────────

const BrowseParams = Type.Object({
  marketplace: Type.String({ description: "Marketplace name (e.g., 'copilot-plugins')" }),
  query: Type.Optional(Type.String({ description: "Search query (optional)" })),
});

const InstallParams = Type.Object({
  spec: Type.String({
    description: "Plugin spec: name@marketplace, owner/repo, owner/repo:path, git URL, or local path",
  }),
});

const ListParams = Type.Object({
  enabled: Type.Optional(Type.Boolean({ description: "Filter by enabled state (optional)" })),
});

const UninstallParams = Type.Object({
  name: Type.String({ description: "Plugin name" }),
});

const EnableParams = Type.Object({
  name: Type.String({ description: "Plugin name" }),
});

const DisableParams = Type.Object({
  name: Type.String({ description: "Plugin name" }),
});

const UpdateParams = Type.Object({
  name: Type.String({ description: "Plugin name" }),
});

const InfoParams = Type.Object({
  name: Type.String({ description: "Plugin name" }),
});

const SearchParams = Type.Object({
  query: Type.String({ description: "Search query" }),
  marketplace: Type.Optional(Type.String({ description: "Marketplace name (optional, searches all if omitted)" })),
});

// ─── Namespace ──────────────────────────────────────────────────────────────

const COPILOT_PLUGINS_NAMESPACE: ToolNamespace = {
  name: "copilot-plugins",
  aliases: ["copilot", "plugins"],
  description: "Manage GitHub Copilot plugins in Pi",
  instructions: "Use these tools to browse, install, update, and manage Copilot plugins. Plugins provide MCP servers, skills, and agents that extend Pi's capabilities.",
};

// ─── Tool Annotations ───────────────────────────────────────────────────────

const BROWSE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const INSTALL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const LIST_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const UNINSTALL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

const ENABLE_DISABLE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// ─── Pi Extension Entry Point ───────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  // Register the slash command
  pi.registerCommand("copilot-plugins", {
    description: "Browse and install GitHub Copilot plugins in Pi",
    handler: async (args, ctx) => {
      await handleSlashCommand(args, ctx);
    },
  });

  // ─── Browse Tool ─────────────────────────────────────────────────────────

  pi.registerTool("copilot_plugins_browse", {
    name: "copilot_plugins_browse",
    label: "Browse Plugins",
    description: "Browse plugins in a Copilot plugin marketplace. Lists available plugins with their names, versions, and descriptions.",
    promptSnippet: "Browse available Copilot plugins in a marketplace",
    promptGuidelines: [
      "Use this tool to discover what plugins are available before installing",
      "Specify a marketplace name (default: 'copilot-plugins')",
      "Optionally provide a search query to filter results",
    ],
    parameters: BrowseParams,
    exposure: "direct",
    namespace: COPILOT_PLUGINS_NAMESPACE,
    annotations: BROWSE_ANNOTATIONS,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      return handleBrowse(params.marketplace, params.query);
    },
  });

  // ─── Install Tool ────────────────────────────────────────────────────────

  pi.registerTool("copilot_plugins_install", {
    name: "copilot_plugins_install",
    label: "Install Plugin",
    description: "Install a GitHub Copilot plugin into Pi. Extracts MCP servers, skills, and agents from the plugin and registers them with Pi.",
    promptSnippet: "Install a Copilot plugin into Pi",
    promptGuidelines: [
      "Use spec format: name@marketplace, owner/repo, owner/repo:path, git URL, or local path",
      "Example: 'azure@awesome-copilot' or 'microsoft/work-iq'",
      "Check what a plugin provides with copilot_plugins_browse first",
    ],
    parameters: InstallParams,
    exposure: "direct",
    namespace: COPILOT_PLUGINS_NAMESPACE,
    annotations: INSTALL_ANNOTATIONS,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      return handleInstall(params.spec);
    },
  });

  // ─── List Tool ───────────────────────────────────────────────────────────

  pi.registerTool("copilot_plugins_list", {
    name: "copilot_plugins_list",
    label: "List Plugins",
    description: "List installed Copilot plugins with their status, MCP servers, and skills.",
    promptSnippet: "List installed Copilot plugins",
    promptGuidelines: [
      "Use this to see what plugins are currently installed",
      "Optionally filter by enabled state",
    ],
    parameters: ListParams,
    exposure: "direct",
    namespace: COPILOT_PLUGINS_NAMESPACE,
    annotations: LIST_ANNOTATIONS,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      return handleList(params.enabled);
    },
  });

  // ─── Uninstall Tool ──────────────────────────────────────────────────────

  pi.registerTool("copilot_plugins_uninstall", {
    name: "copilot_plugins_uninstall",
    label: "Uninstall Plugin",
    description: "Uninstall a Copilot plugin from Pi. Removes MCP servers, skills, and agents installed by the plugin.",
    promptSnippet: "Uninstall a Copilot plugin from Pi",
    promptGuidelines: [
      "Specify the exact plugin name",
      "Use copilot_plugins_list to see installed plugin names",
      "This is a destructive operation — MCP servers and skills will be removed",
    ],
    parameters: UninstallParams,
    exposure: "direct",
    namespace: COPILOT_PLUGINS_NAMESPACE,
    annotations: UNINSTALL_ANNOTATIONS,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      return handleUninstall(params.name);
    },
  });

  // ─── Enable Tool ─────────────────────────────────────────────────────────

  pi.registerTool("copilot_plugins_enable", {
    name: "copilot_plugins_enable",
    label: "Enable Plugin",
    description: "Enable a disabled Copilot plugin. Re-enables its MCP servers and skills.",
    promptSnippet: "Enable a Copilot plugin",
    promptGuidelines: [
      "Use this to re-enable a previously disabled plugin",
      "Use copilot_plugins_list to see disabled plugins",
    ],
    parameters: EnableParams,
    exposure: "direct",
    namespace: COPILOT_PLUGINS_NAMESPACE,
    annotations: ENABLE_DISABLE_ANNOTATIONS,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      return handleEnable(params.name);
    },
  });

  // ─── Disable Tool ────────────────────────────────────────────────────────

  pi.registerTool("copilot_plugins_disable", {
    name: "copilot_plugins_disable",
    label: "Disable Plugin",
    description: "Disable a Copilot plugin. Disables its MCP servers and skills without uninstalling.",
    promptSnippet: "Disable a Copilot plugin",
    promptGuidelines: [
      "Use this to temporarily disable a plugin without uninstalling",
      "Use copilot_plugins_list to see installed plugins",
      "MCP servers and skills will be deactivated but not removed",
    ],
    parameters: DisableParams,
    exposure: "direct",
    namespace: COPILOT_PLUGINS_NAMESPACE,
    annotations: ENABLE_DISABLE_ANNOTATIONS,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      return handleDisable(params.name);
    },
  });

  // ─── Update Tool ─────────────────────────────────────────────────────────

  pi.registerTool("copilot_plugins_update", {
    name: "copilot_plugins_update",
    label: "Update Plugin",
    description: "Update a Copilot plugin to the latest version. Fetches the latest manifest and updates MCP servers, skills, and agents.",
    promptSnippet: "Update a Copilot plugin to latest version",
    promptGuidelines: [
      "Specify the plugin name to update",
      "Use copilot_plugins_list to see installed plugin names",
      "Updates fetch the latest version from the source",
    ],
    parameters: UpdateParams,
    exposure: "direct",
    namespace: COPILOT_PLUGINS_NAMESPACE,
    annotations: INSTALL_ANNOTATIONS,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      return handleUpdate(params.name);
    },
  });

  // ─── Info Tool ───────────────────────────────────────────────────────────

  pi.registerTool("copilot_plugins_info", {
    name: "copilot_plugins_info",
    label: "Plugin Info",
    description: "Show detailed information about an installed plugin including source, version, SHA, installed files, and components.",
    promptSnippet: "Show detailed info about an installed plugin",
    promptGuidelines: [
      "Use this to see detailed information about an installed plugin",
      "Shows source, version, commit SHA, installed MCP servers, skills, and agents",
    ],
    parameters: InfoParams,
    exposure: "direct",
    namespace: COPILOT_PLUGINS_NAMESPACE,
    annotations: LIST_ANNOTATIONS,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      return handleInfo(params.name);
    },
  });

  // ─── Search Tool ─────────────────────────────────────────────────────────

  pi.registerTool("copilot_plugins_search", {
    name: "copilot_plugins_search",
    label: "Search Plugins",
    description: "Search for Copilot plugins across all registered marketplaces. Returns matching plugins with names, descriptions, and source marketplaces.",
    promptSnippet: "Search for Copilot plugins across marketplaces",
    promptGuidelines: [
      "Use this to find plugins by keyword",
      "Searches all registered marketplaces by default",
      "Optionally specify a marketplace to search within",
    ],
    parameters: SearchParams,
    exposure: "direct",
    namespace: COPILOT_PLUGINS_NAMESPACE,
    annotations: BROWSE_ANNOTATIONS,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      return handleSearch(params.query, params.marketplace);
    },
  });
}

// ─── Slash Command Handler ──────────────────────────────────────────────────

async function handleSlashCommand(_args: string[], ctx: ExtensionCommandContext): Promise<void> {
  const { ui } = ctx;

  // Ensure default marketplace is registered
  registerDefaultMarketplace();

  const installed = listPlugins();
  const installedNames = installed.map((p) => p.name).join(", ") || "none";

  ui.notify(
    `Copilot Plugins: ${installed.length} installed (${installedNames}). Use tools to browse, install, or manage plugins.`,
    "info"
  );
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function handleBrowse(marketplace: string, query?: string): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult> {
  try {
    const marketplaceInfo = getMarketplace(marketplace);
    if (!marketplaceInfo) {
      return {
        content: [{ type: "text", text: `Marketplace "${marketplace}" not found. Register it with: pi-copilot-plugins marketplace add <source>` }],
      };
    }

    let plugins;
    if (query) {
      const { results, stale } = await searchMarketplacePlugins(marketplaceInfo.source, query);
      plugins = results;
      if (stale) {
        // Note: using cached marketplace
      }
    } else {
      const { plugins: pl, stale } = await listMarketplacePlugins(marketplaceInfo.source);
      plugins = pl;
      if (stale) {
        // Note: using cached marketplace
      }
    }

    let output = `Plugins in "${marketplace}"${query ? ` matching "${query}"` : ""}:\n\n`;
    for (const plugin of plugins) {
      output += `- **${plugin.name}**${plugin.version ? ` v${plugin.version}` : ""}\n`;
      if (plugin.description) {
        output += `  ${plugin.description}\n`;
      }
      output += "\n";
    }

    return { content: [{ type: "text", text: output }] };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error browsing marketplace: ${err.message}` }],
      isError: true,
    };
  }
}

async function handleInstall(spec: string): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult> {
  try {
    const pluginSpec = parseSpecForExtension(spec);
    const result = await installPluginPackage(pluginSpec);

    if (result.success) {
      let output = `✓ Installed "${result.pluginName}"\n\n`;
      if (result.mcpServers.length > 0) {
        output += `MCP servers: ${result.mcpServers.join(", ")}\n`;
      }
      if (result.skills.length > 0) {
        output += `Skills: ${result.skills.join(", ")}\n`;
      }
      if (result.agents.length > 0) {
        output += `Agents: ${result.agents.join(", ")}\n`;
      }
      return { content: [{ type: "text", text: output }], details: { mcpServers: result.mcpServers, skills: result.skills, agents: result.agents } };
    } else {
      return {
        content: [{ type: "text", text: `✗ Failed to install "${result.pluginName}": ${result.errors?.join(", ") || "unknown error"}` }],
        isError: true,
      };
    }
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `✗ Error: ${err.message}` }],
      isError: true,
    };
  }
}

function handleList(enabled?: boolean): import("@earendil-works/pi-coding-agent").AgentToolResult {
  const plugins = listPlugins({ enabled });

  if (plugins.length === 0) {
    return { content: [{ type: "text", text: "No plugins installed." }] };
  }

  let output = "Installed plugins:\n\n";
  for (const plugin of plugins) {
    output += `- **${plugin.name}**${plugin.version ? ` v${plugin.version}` : ""} ${plugin.enabled ? "✓" : "✗"}\n`;
    if (plugin.mcpServers.length > 0) {
      output += `  MCP: ${plugin.mcpServers.join(", ")}\n`;
    }
    if (plugin.skills.length > 0) {
      output += `  Skills: ${plugin.skills.join(", ")}\n`;
    }
    output += "\n";
  }

  return { content: [{ type: "text", text: output }] };
}

function handleUninstall(name: string): import("@earendil-works/pi-coding-agent").AgentToolResult {
  const result = uninstallPluginPackage(name);

  if (result.success) {
    return { content: [{ type: "text", text: `✓ Uninstalled "${name}"` }] };
  } else {
    return {
      content: [{ type: "text", text: `✗ Failed to uninstall "${name}": ${result.errors?.join(", ") || "not found"}` }],
      isError: true,
    };
  }
}

function handleEnable(name: string): import("@earendil-works/pi-coding-agent").AgentToolResult {
  const result = enablePlugin(name);
  return result
    ? { content: [{ type: "text", text: `✓ Enabled "${name}"` }] }
    : { content: [{ type: "text", text: `✗ Plugin "${name}" not found` }], isError: true };
}

function handleDisable(name: string): import("@earendil-works/pi-coding-agent").AgentToolResult {
  const result = disablePlugin(name);
  return result
    ? { content: [{ type: "text", text: `✓ Disabled "${name}"` }] }
    : { content: [{ type: "text", text: `✗ Plugin "${name}" not found` }], isError: true };
}

async function handleUpdate(name: string): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult> {
  try {
    const plugin = getPlugin(name);
    if (!plugin) {
      return {
        content: [{ type: "text", text: `✗ Plugin "${name}" not found. Use copilot_plugins_list to see installed plugins.` }],
        isError: true,
      };
    }

    const result = await updatePluginPackage(name);

    if (result.success) {
      let output = `✓ Updated "${result.pluginName}"\n\n`;
      if (result.mcpServers.length > 0) {
        output += `MCP servers: ${result.mcpServers.join(", ")}\n`;
      }
      if (result.skills.length > 0) {
        output += `Skills: ${result.skills.join(", ")}\n`;
      }
      if (result.agents.length > 0) {
        output += `Agents: ${result.agents.join(", ")}\n`;
      }
      return { content: [{ type: "text", text: output }], details: { mcpServers: result.mcpServers, skills: result.skills, agents: result.agents } };
    } else {
      return {
        content: [{ type: "text", text: `✗ Failed to update "${result.pluginName}": ${result.errors?.join(", ") || "unknown error"}` }],
        isError: true,
      };
    }
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `✗ Error: ${err.message}` }],
      isError: true,
    };
  }
}

function handleInfo(name: string): import("@earendil-works/pi-coding-agent").AgentToolResult {
  const plugin = getPlugin(name);

  if (!plugin) {
    return {
      content: [{ type: "text", text: `✗ Plugin "${name}" not found. Use copilot_plugins_list to see installed plugins.` }],
      isError: true,
    };
  }

  let output = `Plugin: ${plugin.name}\n`;
  output += `Source: ${plugin.source}\n`;
  if (plugin.version) output += `Version: ${plugin.version}\n`;
  if (plugin.sha) output += `Commit SHA: ${plugin.sha}\n`;
  output += `Enabled: ${plugin.enabled ? "Yes" : "No"}\n`;

  if (plugin.mcpServers.length > 0) {
    output += `\nMCP servers:\n`;
    for (const server of plugin.mcpServers) {
      output += `  - ${server}\n`;
    }
  }

  if (plugin.skills.length > 0) {
    output += `\nSkills (${plugin.skills.length}):\n`;
    for (const skill of plugin.skills) {
      output += `  - ${skill}\n`;
    }
  }

  if (plugin.agents.length > 0) {
    output += `\nAgents (${plugin.agents.length}):\n`;
    for (const agent of plugin.agents) {
      output += `  - ${agent}\n`;
    }
  }

  return { content: [{ type: "text", text: output }], details: plugin };
}

async function handleSearch(query: string, marketplace?: string): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult> {
  try {
    let results: Array<{ name: string; description?: string; source?: string }>;

    if (marketplace) {
      const marketplaceInfo = getMarketplace(marketplace);
      if (!marketplaceInfo) {
        return {
          content: [{ type: "text", text: `Marketplace "${marketplace}" not found.` }],
          isError: true,
        };
      }
      const { results: searchResults } = await searchMarketplacePlugins(marketplaceInfo.source, query);
      results = searchResults.map(r => ({ name: r.name, description: r.description, source: marketplace }));
    } else {
      // Search all marketplaces
      results = [];
      // Note: This would need a listMarketplaces() call — for now, search default
      const { results: searchResults } = await searchMarketplacePlugins("github/copilot-plugins", query);
      results = searchResults.map(r => ({ name: r.name, description: r.description, source: "copilot-plugins" }));
    }

    if (results.length === 0) {
      return { content: [{ type: "text", text: `No plugins found matching "${query}".` }] };
    }

    let output = `Plugins matching "${query}"${marketplace ? ` in "${marketplace}"` : ""}:\n\n`;
    for (const plugin of results) {
      output += `- **${plugin.name}**${plugin.description ? ` — ${plugin.description}` : ""}\n`;
      if (plugin.source) {
        output += `  from ${plugin.source}\n`;
      }
      output += "\n";
    }

    return { content: [{ type: "text", text: output }] };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error searching plugins: ${err.message}` }],
      isError: true,
    };
  }
}

/**
 * Parse a spec string for use in the extension (similar to CLI parseSpec).
 */
function parseSpecForExtension(spec: string): PluginSpec {
  // Marketplace format: name@marketplace
  if (spec.includes("@") && !spec.includes("://")) {
    const [pluginName, marketplaceName] = spec.split("@");
    return {
      name: pluginName,
      source: { type: "marketplace", marketplace: marketplaceName },
    };
  }

  // GitHub repo with subdirectory: owner/repo:path
  if (spec.includes(":") && spec.includes("/")) {
    const [repo, path] = spec.split(":");
    return {
      name: path ? path.split("/").pop() || path : repo.split("/").pop() || repo,
      source: { type: "github", repo, path },
    };
  }

  // GitHub repo: owner/repo
  if (spec.includes("/")) {
    return {
      name: spec.split("/").pop() || spec,
      source: { type: "github", repo: spec },
    };
  }

  // Git URL
  if (spec.startsWith("http://") || spec.startsWith("https://")) {
    return {
      name: spec.split("/").pop()?.replace(/\.git$/, "") || "unknown",
      source: { type: "git", url: spec },
    };
  }

  // Local path
  if (spec.startsWith("./") || spec.startsWith("/") || spec.startsWith("~")) {
    return {
      name: spec.split("/").pop()?.replace(/\.[^/.]+$/, "") || spec,
      source: { type: "local", path: spec },
    };
  }

  // Bare name — assume marketplace
  return {
    name: spec,
    source: { type: "marketplace", marketplace: "copilot-plugins" },
  };
}
