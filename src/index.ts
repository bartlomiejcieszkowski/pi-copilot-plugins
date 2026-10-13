// Pi extension types - optional dependency
interface ExtensionAPI {
  registerCommand(name: string, opts: { description: string; handler: (args: string[], ctx: ExtensionCommandContext) => Promise<void> }): void;
  registerTool(name: string, opts: { description: string; parameters: unknown; execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>> }): void;
}
interface ExtensionCommandContext {
  ui: { notify: (msg: string, type: string) => void };
}

import type { PluginSpec } from "./types.js";
import { registerDefaultMarketplace, listMarketplacePlugins, findPluginInMarketplace, searchMarketplacePlugins, marketplacePluginToSpec } from "./marketplace.js";
import { installPluginPackage, uninstallPluginPackage } from "./installer.js";
import { listPlugins, enablePlugin, disablePlugin, getMarketplace } from "./registry.js";


/**
 * Pi extension entry point.
 * Registers the /copilot-plugins slash command and tools.
 */
export default function (pi: ExtensionAPI): void {
  // Register the slash command
  pi.registerCommand("copilot-plugins", {
    description: "Browse and install GitHub Copilot plugins in Pi",
    handler: async (args, ctx) => {
      await handleSlashCommand(args, ctx);
    },
  });

  // Register tools
  pi.registerTool("copilot_plugins_browse", {
    description: "Browse plugins in a Copilot plugin marketplace",
    parameters: {
      type: "object",
      properties: {
        marketplace: {
          type: "string",
          description: "Marketplace name (e.g., 'copilot-plugins')",
        },
        query: {
          type: "string",
          description: "Search query (optional)",
        },
      },
      required: ["marketplace"],
    },
    execute: async (args: Record<string, unknown>) => {
      return handleBrowse(args.marketplace as string, args.query as string);
    },
  });

  pi.registerTool("copilot_plugins_install", {
    description: "Install a GitHub Copilot plugin into Pi",
    parameters: {
      type: "object",
      properties: {
        spec: {
          type: "string",
          description:
            "Plugin spec: name@marketplace, owner/repo, owner/repo:path, git URL, or local path",
        },
      },
      required: ["spec"],
    },
    execute: async (args: Record<string, unknown>) => {
      return handleInstall(args.spec as string);
    },
  });

  pi.registerTool("copilot_plugins_list", {
    description: "List installed Copilot plugins",
    parameters: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "Filter by enabled state (optional)",
        },
      },
    },
    execute: async (args: Record<string, unknown>) => {
      return handleList(args.enabled as boolean | undefined);
    },
  });

  pi.registerTool("copilot_plugins_uninstall", {
    description: "Uninstall a Copilot plugin from Pi",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Plugin name",
        },
      },
      required: ["name"],
    },
    execute: async (args: Record<string, unknown>) => {
      return handleUninstall(args.name as string);
    },
  });

  pi.registerTool("copilot_plugins_enable", {
    description: "Enable a Copilot plugin",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Plugin name",
        },
      },
      required: ["name"],
    },
    execute: async (args: Record<string, unknown>) => {
      return handleEnable(args.name as string);
    },
  });

  pi.registerTool("copilot_plugins_disable", {
    description: "Disable a Copilot plugin",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Plugin name",
        },
      },
      required: ["name"],
    },
    execute: async (args: Record<string, unknown>) => {
      return handleDisable(args.name as string);
    },
  });
}

// ─── Slash Command Handler ──────────────────────────────────────────────────

async function handleSlashCommand(_args: string[], ctx: { ui: { notify: (msg: string, type: string) => void } }): Promise<void> {
  const { notify } = ctx.ui;

  // Ensure default marketplace is registered
  registerDefaultMarketplace();

  const installed = listPlugins();
  const installedNames = installed.map((p) => p.name).join(", ") || "none";

  notify(
    `Copilot Plugins: ${installed.length} installed (${installedNames}). Use tools to browse, install, or manage plugins.`,
    "info"
  );
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function handleBrowse(marketplace: string, query?: string): Promise<{ content: string; details?: unknown }> {
  try {
    const marketplaceInfo = getMarketplace(marketplace);
    if (!marketplaceInfo) {
      return { content: `Marketplace "${marketplace}" not found. Register it with: pi-copilot-plugins marketplace add <source>` };
    }

    let plugins;
    if (query) {
      plugins = await searchMarketplacePlugins(marketplaceInfo.source, query);
    } else {
      plugins = await listMarketplacePlugins(marketplaceInfo.source);
    }

    let output = `Plugins in "${marketplace}"${query ? ` matching "${query}"` : ""}:\n\n`;
    for (const plugin of plugins) {
      output += `- **${plugin.name}**${plugin.version ? ` v${plugin.version}` : ""}\n`;
      if (plugin.description) {
        output += `  ${plugin.description}\n`;
      }
      output += "\n";
    }

    return { content: output };
  } catch (err: any) {
    return { content: `Error browsing marketplace: ${err.message}` };
  }
}

async function handleInstall(spec: string): Promise<{ content: string; details?: unknown }> {
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
      return { content: output };
    } else {
      return { content: `✗ Failed to install "${result.pluginName}": ${result.errors?.join(", ") || "unknown error"}` };
    }
  } catch (err: any) {
    return { content: `✗ Error: ${err.message}` };
  }
}

function handleList(enabled?: boolean): { content: string } {
  const plugins = listPlugins({ enabled });

  if (plugins.length === 0) {
    return { content: "No plugins installed." };
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

  return { content: output };
}

function handleUninstall(name: string): { content: string } {
  const result = uninstallPluginPackage(name);

  if (result.success) {
    return { content: `✓ Uninstalled "${name}"` };
  } else {
    return { content: `✗ Failed to uninstall "${name}": ${result.errors?.join(", ") || "not found"}` };
  }
}

function handleEnable(name: string): { content: string } {
  const result = enablePlugin(name);
  return result ? { content: `✓ Enabled "${name}"` } : { content: `✗ Plugin "${name}" not found` };
}

function handleDisable(name: string): { content: string } {
  const result = disablePlugin(name);
  return result ? { content: `✓ Disabled "${name}"` } : { content: `✗ Plugin "${name}" not found` };
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
