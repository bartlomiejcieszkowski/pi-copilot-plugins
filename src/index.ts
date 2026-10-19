// @ts-nocheck — Pi extension types are optional peer dependency
import type { ExtensionAPI, ExtensionCommandContext, ToolDefinition, ToolAnnotations, ToolNamespace } from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";
import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { COPILOT_PLUGINS_JSON } from "./types.js";

import type { PluginSpec } from "./types.js";
import { listMarketplacePlugins, findPluginInMarketplace, searchMarketplacePlugins, marketplacePluginToSpec, fetchMarketplace } from "./marketplace.js";
import { installPluginPackage, uninstallPluginPackage, reinstallPluginPackage, updatePluginPackage, peekManifest, peekSkills } from "./installer.js";
import { listPlugins, enablePlugin, disablePlugin, getMarketplace, getPlugin, uninstallPlugin, registerMarketplace, unregisterMarketplace, listMarketplaces } from "./registry.js";
import { getToolState, setToolEnabled, TOOL_NAMES, lockTools, unlockTools, isToolsLocked } from "./types.js";

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

const PeekParams = Type.Object({
  spec: Type.String({
    description: "Plugin spec: name@marketplace, owner/repo, owner/repo:path, git URL, or local path",
  }),
});

const MarketplaceAddParams = Type.Object({
  source: Type.String({
    description: "Marketplace source: owner/repo (e.g., 'github/awesome-copilot')",
  }),
  name: Type.Optional(Type.String({ description: "Display name (defaults to source)" })),
});

const MarketplaceListParams = Type.Object({});

const MarketplaceRefreshParams = Type.Object({
  marketplace: Type.Optional(Type.String({ description: "Marketplace name or source (refreshes all if omitted)" })),
});

const MarketplaceRemoveParams = Type.Object({
  name: Type.String({ description: "Marketplace name or source to remove" }),
});

const ToolsToggleParams = Type.Object({
  enabled: Type.Boolean({ description: "Enable (true) or disable (false) all tools" }),
});

// ─── Tool Registry State ─────────────────────────────────────────────────────

let toolsEnabled = false;

/**
 * Re-register all tools with the given exposure.
 */

/**
 * Register a tool with a specific exposure.
 */
function registerToolWithExposure(
  pi: ExtensionAPI,
  name: string,
  def: Omit<ToolDefinition, "name" | "exposure">,
  exposure: "direct" | "hidden"
): void {
  pi.registerTool({ ...def, name, exposure } as ToolDefinition);
}

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


  // ─── Initial Registration: all tools hidden ──────────────────────────────

  reRegisterTools("hidden");

  // ─── Tools Lock/Unlock ─────────────────────────────────────────────────────

  function handleToolsLock(): void {
    lockTools();
    reRegisterToolsForLock(true);
    ui.notify("✓ Copilot tools locked. Toggle tool hidden.", "success");
  }

  function handleToolsUnlock(): void {
    unlockTools();
    reRegisterToolsForLock(false);
    ui.notify("✓ Copilot tools unlocked. Toggle tool restored.", "success");
  }

  function reRegisterToolsForLock(locked: boolean): void {
    // Only controls the toggle tool visibility — does NOT affect the 14 tools
    registerToolWithExposure(pi, "copilot_plugins_tools_toggle", {
      label: "Toggle Copilot Tools",
      description: "Enable or disable all Copilot plugin tools. When disabled, tools are hidden from the model to save context. When enabled, all 14 tools become available for the model to use.",
      promptSnippet: "Toggle Copilot plugin tools on/off",
      promptGuidelines: [
        "Use this to enable tools when the model needs to browse, install, or manage plugins",
        "Tools are disabled by default to save context",
        "Enable tools when you need to install, browse, search, or manage plugins",
        "Disable tools again after you're done to save context",
      ],
      parameters: ToolsToggleParams,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleToolsToggle(params.enabled),
    }, locked ? "hidden" : "direct");
  }

  // ─── Tools Toggle Tool ─────────────────────────────────────────────────────

  // Check if tools were previously locked
  const wasLocked = isToolsLocked();

  // Register toggle tool first (hidden by default)
  pi.registerTool({
    name: "copilot_plugins_tools_toggle",
    label: "Toggle Copilot Tools",
    description: "Enable or disable all Copilot plugin tools. When disabled, tools are hidden from the model to save context. When enabled, all 14 tools become available for the model to use.",
    promptSnippet: "Toggle Copilot plugin tools on/off",
    promptGuidelines: [
      "Use this to enable tools when the model needs to browse, install, or manage plugins",
      "Tools are disabled by default to save context",
      "Enable tools when you need to install, browse, search, or manage plugins",
      "Disable tools again after you're done to save context",
    ],
    parameters: ToolsToggleParams,
    exposure: "hidden",
    namespace: COPILOT_PLUGINS_NAMESPACE,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => handleToolsToggle(params.enabled),
  });

  // Restore lock state if it was locked (hide toggle tool)
  if (wasLocked) {
    reRegisterToolsForLock(true);
  }

  // ─── Tools Toggle Handler ──────────────────────────────────────────────────

  function handleToolsToggle(enabled: boolean): import("@earendil-works/pi-coding-agent").AgentToolResult {
    setToolEnabled("copilot_plugins_tools_toggle", enabled);
    reRegisterTools(enabled ? "direct" : "hidden");
    return {
      content: [{ type: "text", text: enabled ? "✓ Copilot tools enabled. All 14 tools are now available." : "✓ Copilot tools disabled. Tools hidden to save context." }],
    };
  }

  // ─── reRegisterTools ──────────────────────────────────────────────────────

  function reRegisterTools(exposure: "direct" | "hidden"): void {
    registerToolWithExposure(pi, "copilot_plugins_browse", {
      label: "Browse Copilot Plugins",
      description: "Browse plugins in a GitHub Copilot plugin marketplace. Lists available Copilot plugins with their names, versions, and descriptions.",
      promptSnippet: "Browse available GitHub Copilot plugins in a marketplace",
      promptGuidelines: [
        "Use this tool to discover what Copilot plugins are available before installing",
        "Specify a marketplace name (default: 'copilot-plugins')",
        "Optionally provide a search query to filter results",
      ],
      parameters: BrowseParams,
      annotations: BROWSE_ANNOTATIONS,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleBrowse(params.marketplace, params.query),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_install", {
      label: "Install Copilot Plugin",
      description: "Install a GitHub Copilot plugin into Pi. Extracts MCP servers, skills, and agents from the Copilot plugin and registers them with Pi.",
      promptSnippet: "Install a GitHub Copilot plugin into Pi",
      promptGuidelines: [
        "Use spec format: name@marketplace, owner/repo, owner/repo:path, git URL, or local path",
        "Example: 'azure@awesome-copilot' or 'microsoft/work-iq'",
        "Check what a Copilot plugin provides with copilot_plugins_browse first",
      ],
      parameters: InstallParams,
      annotations: INSTALL_ANNOTATIONS,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleInstall(params.spec),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_list", {
      label: "List Copilot Plugins",
      description: "List installed GitHub Copilot plugins with their status, MCP servers, and skills.",
      promptSnippet: "List installed GitHub Copilot plugins",
      promptGuidelines: [
        "Use this to see what Copilot plugins are currently installed",
        "Optionally filter by enabled state",
      ],
      parameters: ListParams,
      annotations: LIST_ANNOTATIONS,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleList(params.enabled),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_uninstall", {
      label: "Uninstall Copilot Plugin",
      description: "Uninstall a GitHub Copilot plugin from Pi. Removes MCP servers, skills, and agents installed by the Copilot plugin.",
      promptSnippet: "Uninstall a GitHub Copilot plugin from Pi",
      promptGuidelines: [
        "Specify the exact plugin name",
        "Use copilot_plugins_list to see installed Copilot plugin names",
        "This is a destructive operation — MCP servers and skills will be removed",
      ],
      parameters: UninstallParams,
      annotations: UNINSTALL_ANNOTATIONS,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleUninstall(params.name),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_enable", {
      label: "Enable Copilot Plugin",
      description: "Enable a disabled GitHub Copilot plugin. Re-enables its MCP servers and skills.",
      promptSnippet: "Enable a GitHub Copilot plugin",
      promptGuidelines: [
        "Use this to re-enable a previously disabled Copilot plugin",
        "Use copilot_plugins_list to see disabled plugins",
      ],
      parameters: EnableParams,
      annotations: ENABLE_DISABLE_ANNOTATIONS,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleEnable(params.name),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_disable", {
      label: "Disable Copilot Plugin",
      description: "Disable a GitHub Copilot plugin. Disables its MCP servers and skills without uninstalling.",
      promptSnippet: "Disable a GitHub Copilot plugin",
      promptGuidelines: [
        "Use this to temporarily disable a Copilot plugin without uninstalling",
        "Use copilot_plugins_list to see installed plugins",
        "MCP servers and skills will be deactivated but not removed",
      ],
      parameters: DisableParams,
      annotations: ENABLE_DISABLE_ANNOTATIONS,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleDisable(params.name),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_update", {
      label: "Update Copilot Plugin",
      description: "Update a GitHub Copilot plugin to the latest version. Fetches the latest manifest and updates MCP servers, skills, and agents.",
      promptSnippet: "Update a GitHub Copilot plugin to latest version",
      promptGuidelines: [
        "Specify the Copilot plugin name to update",
        "Use copilot_plugins_list to see installed plugin names",
        "Updates fetch the latest version from the source",
      ],
      parameters: UpdateParams,
      annotations: INSTALL_ANNOTATIONS,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleUpdate(params.name),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_info", {
      label: "Copilot Plugin Info",
      description: "Show detailed information about an installed GitHub Copilot plugin including source, version, SHA, installed files, and components.",
      promptSnippet: "Show detailed info about an installed GitHub Copilot plugin",
      promptGuidelines: [
        "Use this to see detailed information about an installed Copilot plugin",
        "Shows source, version, commit SHA, installed MCP servers, skills, and agents",
      ],
      parameters: InfoParams,
      annotations: LIST_ANNOTATIONS,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleInfo(params.name),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_search", {
      label: "Search Copilot Plugins",
      description: "Search for GitHub Copilot plugins across all registered marketplaces. Returns matching Copilot plugins with names, descriptions, and source marketplaces.",
      promptSnippet: "Search for Copilot plugins across marketplaces",
      promptGuidelines: [
        "Use this to find Copilot plugins by keyword",
        "Searches all registered marketplaces by default",
        "Optionally specify a marketplace to search within",
      ],
      parameters: SearchParams,
      annotations: BROWSE_ANNOTATIONS,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleSearch(params.query, params.marketplace),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_peek", {
      label: "Peek Copilot Plugin",
      description: "Preview a GitHub Copilot plugin's manifest, MCP servers, skills, and agents without downloading. Useful to check what a plugin provides before installing.",
      promptSnippet: "Preview a Copilot plugin's contents before installing",
      promptGuidelines: [
        "Use this to inspect a Copilot plugin before deciding to install it",
        "Spec format: name@marketplace, owner/repo, owner/repo:path, git URL, or local path",
        "Shows MCP servers, skills, and agents the plugin provides",
        "If no installable components found, the plugin may only contain Copilot-specific extensions",
      ],
      parameters: PeekParams,
      annotations: BROWSE_ANNOTATIONS,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handlePeek(params.spec),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_marketplace_add", {
      label: "Add Copilot Marketplace",
      description: "Register a GitHub Copilot plugin marketplace so plugins from it can be browsed, searched, and installed.",
      promptSnippet: "Add a Copilot plugin marketplace",
      promptGuidelines: [
        "Use this to register a new marketplace before browsing or installing from it",
        "Source format: owner/repo (e.g., 'github/awesome-copilot')",
        "The marketplace's marketplace.json will be fetched and cached",
      ],
      parameters: MarketplaceAddParams,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleMarketplaceAdd(params.source, params.name),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_marketplace_list", {
      label: "List Copilot Marketplaces",
      description: "List all registered GitHub Copilot plugin marketplaces with their names and sources.",
      promptSnippet: "List registered Copilot plugin marketplaces",
      promptGuidelines: [
        "Use this to see which marketplaces are available",
        "Marketplaces must be registered before plugins from them can be installed",
      ],
      parameters: MarketplaceListParams,
      annotations: BROWSE_ANNOTATIONS,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleMarketplaceList(),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_marketplace_refresh", {
      label: "Refresh Copilot Marketplace",
      description: "Force-refresh a GitHub Copilot plugin marketplace's cache. Fetches the latest marketplace.json from the source repository.",
      promptSnippet: "Refresh a Copilot plugin marketplace cache",
      promptGuidelines: [
        "Use this to update marketplace data when plugins have been added or updated",
        "Caches are automatically refreshed every 24 hours",
        "Omit marketplace to refresh all registered marketplaces",
      ],
      parameters: MarketplaceRefreshParams,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleMarketplaceRefresh(params.marketplace),
    }, exposure);

    registerToolWithExposure(pi, "copilot_plugins_marketplace_remove", {
      label: "Remove Copilot Marketplace",
      description: "Remove a registered GitHub Copilot plugin marketplace. Plugins from this marketplace will no longer be searchable or installable.",
      promptSnippet: "Remove a Copilot plugin marketplace",
      promptGuidelines: [
        "Use this to remove a marketplace that is no longer needed",
        "Plugins installed from this marketplace remain installed",
        "Cannot remove a marketplace if plugins are still installed from it",
      ],
      parameters: MarketplaceRemoveParams,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      execute: async (toolCallId, params, signal, onUpdate, ctx) => handleMarketplaceRemove(params.name),
    }, exposure);
  }
}

// ─── Slash Command Handler ──────────────────────────────────────────────────

async function handleSlashCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const { ui } = ctx;

  const parts = args.trim().split(/\s+/).filter(Boolean);

  if (!parts.length || parts[0] === "help" || parts[0] === "--help" || parts[0] === "-h") {
    // Show help / installed count
    const installed = listPlugins();
    const installedNames = installed.map((p) => p.name).join(", ") || "none";
    ui.notify(
      `Copilot Plugins: ${installed.length} installed (${installedNames}).\n\n` +
      `Usage: /copilot-plugins <command> [args]\n\n` +
      `Commands:\n` +
      `  install <spec>        Install a plugin\n` +
      `  uninstall <name>      Uninstall a plugin\n` +
      `  reinstall <name>      Reinstall a plugin\n` +
      `  list [--json]         List installed plugins\n` +
      `  update [name] [--all] Update a plugin or all\n` +
      `  enable <name>         Enable a plugin\n` +
      `  disable <name>        Disable a plugin\n` +
      `  search <query>        Search for plugins\n` +
      `  peek <spec>           Preview a plugin\n` +
      `  validate <file.json>  Validate manifest\n` +
      `  tools                 Show tool toggle status\n` +
      `  tools enable          Enable all Copilot tools\n` +
      `  tools disable         Disable all Copilot tools\n` +
      `  tools lock            Lock tools permanently (hide toggle)\n` +
      `  tools unlock          Unlock tools (show toggle again)\n` +
      `  marketplace add <src> Add a marketplace\n` +
      `  marketplace list      List marketplaces\n` +
      `  marketplace browse <name> Browse marketplace\n` +
      `  marketplace refresh [name] Refresh marketplace\n` +
      `  marketplace remove <name> Remove marketplace`,
      "info"
    );
    return;
  }

  const command = parts[0];
  const rest = parts.slice(1);

  try {
    switch (command) {
      case "install": {
        if (!rest.length) {
          ui.notify("Usage: /copilot-plugins install <spec>", "error");
          return;
        }
        const result = await installPluginPackage(parseSpecForExtension(rest[0]));
        if (result.success) {
          let output = `✓ Installed "${result.pluginName}"\n\n`;
          if (result.mcpServers.length) output += `MCP: ${result.mcpServers.join(", ")}\n`;
          if (result.skills.length) output += `Skills: ${result.skills.join(", ")}\n`;
          if (result.agents.length) output += `Agents: ${result.agents.join(", ")}\n`;
          output += `\n⚠️ Note: Changes to MCP servers and skills require a Pi reload to take effect. Run /reload or restart Pi to apply changes.`;
          ui.notify(output.trim(), "success");
        } else {
          ui.notify(`✗ Failed: ${result.errors?.join(", ") || "unknown error"}`, "error");
        }
        break;
      }
      case "uninstall": {
        if (!rest.length) {
          ui.notify("Usage: /copilot-plugins uninstall <name>", "error");
          return;
        }
        const result = uninstallPluginPackage(rest[0]);
        if (result.success) {
          let output = `✓ Uninstalled "${rest[0]}"`;
          output += `\n\n⚠️ Note: Changes to MCP servers and skills require a Pi reload to take effect. Run /reload or restart Pi to apply changes.`;
          ui.notify(output.trim(), "success");
        } else {
          ui.notify(`✗ Failed: ${result.errors?.join(", ") || "not found"}`, "error");
        }
        break;
      }
      case "reinstall": {
        if (!rest.length) {
          ui.notify("Usage: /copilot-plugins reinstall <name>", "error");
          return;
        }
        const result = await reinstallPluginPackage(rest[0]);
        if (result.success) {
          let output = `✓ Reinstalled "${result.pluginName}"`;
          output += `\n\n⚠️ Note: Changes to MCP servers and skills require a Pi reload to take effect. Run /reload or restart Pi to apply changes.`;
          ui.notify(output.trim(), "success");
        } else {
          ui.notify(`✗ Failed: ${result.errors?.join(", ") || "unknown error"}`, "error");
        }
        break;
      }
      case "list": {
        const json = rest.includes("--json");
        const plugins = listPlugins();
        if (plugins.length === 0) {
          ui.notify("No plugins installed.", "info");
        } else if (json) {
          ui.notify(JSON.stringify(plugins, null, 2), "info");
        } else {
          let output = "Installed plugins:\n\n";
          for (const p of plugins) {
            output += `- **${p.name}**${p.version ? ` v${p.version}` : ""} ${p.enabled ? "✓" : "✗"}\n`;
            if (p.mcpServers.length) output += `  MCP: ${p.mcpServers.join(", ")}\n`;
            if (p.skills.length) output += `  Skills: ${p.skills.join(", ")}\n`;
            output += "\n";
          }
          ui.notify(output.trim(), "info");
        }
        break;
      }
      case "update": {
        const all = rest.includes("--all");
        const name = all ? undefined : rest.find(r => r !== "--all");
        if (!name && !all) {
          ui.notify("Usage: /copilot-plugins update [name] [--all]", "error");
          return;
        }
        if (all) {
          const installed = listPlugins();
          const updated: string[] = [];
          for (const p of installed) {
            try {
              const r = await updatePluginPackage(p.name);
              if (r.success) updated.push(p.name);
            } catch {
              // Skip errors
            }
          }
          ui.notify(`✓ Updated ${updated.length} plugin(s): ${updated.join(", ") || "none"}\n\n⚠️ Note: Changes to MCP servers and skills require a Pi reload to take effect. Run /reload or restart Pi to apply changes.`, "info");
        } else {
          const result = await updatePluginPackage(name!);
          if (result.success) {
            let output = `✓ Updated "${result.pluginName}"`;
            output += `\n\n⚠️ Note: Changes to MCP servers and skills require a Pi reload to take effect. Run /reload or restart Pi to apply changes.`;
            ui.notify(output.trim(), "success");
          } else {
            ui.notify(`✗ Failed: ${result.errors?.join(", ") || "unknown error"}`, "error");
          }
        }
        break;
      }
      case "enable": {
        if (!rest.length) {
          ui.notify("Usage: /copilot-plugins enable <name>", "error");
          return;
        }
        const r = enablePlugin(rest[0]);
        ui.notify(r ? `✓ Enabled "${rest[0]}"` : `✗ Plugin "${rest[0]}" not found`, r ? "success" : "error");
        break;
      }
      case "disable": {
        if (!rest.length) {
          ui.notify("Usage: /copilot-plugins disable <name>", "error");
          return;
        }
        const r = disablePlugin(rest[0]);
        ui.notify(r ? `✓ Disabled "${rest[0]}"` : `✗ Plugin "${rest[0]}" not found`, r ? "success" : "error");
        break;
      }
      case "search": {
        if (!rest.length) {
          ui.notify("Usage: /copilot-plugins search <query>", "error");
          return;
        }
        const results = await searchMarketplacePlugins("github/copilot-plugins", rest.join(" "));
        if (results.length === 0) {
          ui.notify(`No plugins found matching "${rest.join(" ")}".`, "info");
        } else {
          let output = `Plugins matching "${rest.join(" ")}":\n\n`;
          for (const p of results) {
            output += `- **${p.name}**${p.description ? ` — ${p.description}` : ""}\n\n`;
          }
          ui.notify(output.trim(), "info");
        }
        break;
      }
      case "peek": {
        if (!rest.length) {
          ui.notify("Usage: /copilot-plugins peek <spec>", "error");
          return;
        }
        const result = await handlePeek(rest[0]);
        ui.notify(result.content[0].type === "text" ? result.content[0].text : "", "info");
        break;
      }
      case "validate": {
        if (!rest.length) {
          ui.notify("Usage: /copilot-plugins validate <file.json>", "error");
          return;
        }
        try {
          const content = readFileSync(rest[0], "utf-8");
          const manifest = JSON.parse(content);
          console.log(`Validating ${rest[0]} against Agent Plugins 1.0.0 spec...`);
          const valid = validateManifest(manifest);
          if (valid) {
            ui.notify(`✓ ${rest[0]} is valid`, "success");
          } else {
            ui.notify(`✗ ${rest[0]} has validation errors`, "error");
          }
        } catch (err: any) {
          ui.notify(`✗ Error: ${err.message}`, "error");
        }
        break;
      }
      case "tools": {
        if (!rest.length) {
          // Show current tool state
          const state = getToolState();
          const enabled = Object.entries(state).filter(([, v]) => v);
          const disabled = Object.entries(state).filter(([, v]) => !v);
          let output = "Copilot tools status:\n\n";
          if (enabled.length) {
            output += "Enabled:\n";
            for (const [name] of enabled) {
              output += `  ✓ ${name}\n`;
            }
            output += "\n";
          }
          if (disabled.length) {
            output += "Disabled:\n";
            for (const [name] of disabled) {
              output += `  ✗ ${name}\n`;
            }
          }
          ui.notify(output.trim(), "info");
          return;
        }
        const sub = rest[0];
        if (sub === "enable") {
          handleToolsToggle(true);
          ui.notify("✓ Copilot tools enabled.", "success");
        } else if (sub === "disable") {
          handleToolsToggle(false);
          ui.notify("✓ Copilot tools disabled.", "success");
        } else if (sub === "lock") {
          handleToolsLock();
          ui.notify("✓ Copilot tools locked. All tools hidden.", "success");
        } else if (sub === "unlock") {
          handleToolsUnlock();
          ui.notify("✓ Copilot tools unlocked. Toggle tool restored.", "success");
        } else {
          ui.notify("Usage: /copilot-plugins tools [enable|disable|lock|unlock]\nRun /copilot-plugins tools (no args) to see current status.", "error");
        }
        break;
      }
      case "marketplace": {
        if (!rest.length) {
          ui.notify("Usage: /copilot-plugins marketplace <subcommand>\nSubcommands: add, list, browse, refresh, remove", "error");
          return;
        }
        const sub = rest[0];
        const subArgs = rest.slice(1);
        switch (sub) {
          case "add": {
            if (!subArgs.length) {
              ui.notify("Usage: /copilot-plugins marketplace add <source>", "error");
              return;
            }
            registerMarketplace(subArgs[0], subArgs[0]);
            ui.notify(`✓ Marketplace "${subArgs[0]}" registered.`, "success");
            break;
          }
          case "list": {
            const mps = listMarketplaces();
            if (mps.length === 0) {
              ui.notify("No marketplaces registered.", "info");
            } else {
              let output = "Registered marketplaces:\n\n";
              for (const m of mps) {
                output += `- **${m.name}** (${m.source})\n\n`;
              }
              ui.notify(output.trim(), "info");
            }
            break;
          }
          case "browse": {
            if (!subArgs.length) {
              ui.notify("Usage: /copilot-plugins marketplace browse <name>", "error");
              return;
            }
            const mp = getMarketplace(subArgs[0]);
            if (!mp) {
              ui.notify(`Marketplace "${subArgs[0]}" not found.`, "error");
              return;
            }
            const result = await listMarketplacePlugins(mp.source);
            if (result.plugins.length === 0) {
              ui.notify(`No plugins in "${subArgs[0]}".`, "info");
            } else {
              let output = `Plugins in "${subArgs[0]}":\n\n`;
              for (const p of result.plugins) {
                output += `- **${p.name}**${p.version ? ` v${p.version}` : ""}\n`;
                if (p.description) output += `  ${p.description}\n\n`;
              }
              ui.notify(output.trim(), "info");
            }
            break;
          }
          case "refresh": {
            if (subArgs.length) {
              const mp = getMarketplace(subArgs[0]);
              if (!mp) {
                ui.notify(`Marketplace "${subArgs[0]}" not found.`, "error");
                return;
              }
              await fetchMarketplace(mp.source, true);
              ui.notify(`✓ Marketplace "${subArgs[0]}" refreshed.`, "success");
            } else {
              const mps = listMarketplaces();
              const refreshed: string[] = [];
              for (const m of mps) {
                try { await fetchMarketplace(m.source, true); refreshed.push(m.name); } catch { /* skip */ }
              }
              ui.notify(`✓ Refreshed ${refreshed.length} marketplace(s).`, "info");
            }
            break;
          }
          case "remove": {
            if (!subArgs.length) {
              ui.notify("Usage: /copilot-plugins marketplace remove <name>", "error");
              return;
            }
            const mp = getMarketplace(subArgs[0]);
            if (!mp) {
              ui.notify(`Marketplace "${subArgs[0]}" not found.`, "error");
              return;
            }
            const hasInstalled = listPlugins().some(p => p.source === mp.source);
            if (hasInstalled) {
              ui.notify(`✗ Cannot remove — plugins are still installed from it.`, "error");
              return;
            }
            unregisterMarketplace(subArgs[0]);
            ui.notify(`✓ Marketplace "${subArgs[0]}" removed.`, "success");
            break;
          }
          default:
            ui.notify(`Unknown marketplace subcommand: ${sub}\nUse: add, list, browse, refresh, remove`, "error");
        }
        break;
      }
      default:
        ui.notify(`Unknown command: ${command}\nRun /copilot-plugins help for usage.`, "error");
    }
  } catch (err: any) {
    ui.notify(`✗ Error: ${err.message}`, "error");
  }
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
      output += `\n⚠️ Note: Changes to MCP servers and skills require a Pi reload to take effect. Run /reload or restart Pi to apply changes.`;
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
    let output = `✓ Uninstalled "${name}"`;
    output += `\n\n⚠️ Note: Changes to MCP servers and skills require a Pi reload to take effect. Run /reload or restart Pi to apply changes.`;
    return { content: [{ type: "text", text: output }] };
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

// ─── Peek Handler ────────────────────────────────────────────────────────────

async function handlePeek(spec: string): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult> {
  try {
    const marketplaces = listMarketplaces();
    if (marketplaces.length === 0) {
      return { content: [{ type: "text", text: "No marketplaces registered. Add one with: pi-copilot-plugins marketplace add <source>" }] };
    }

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
      if (targetMarketplace && mp.source !== targetMarketplace && mp.name !== targetMarketplace) continue;

      try {
        const { plugins } = await listMarketplacePlugins(mp.source);
        const match = plugins.find(p => p.name.toLowerCase() === pluginName.toLowerCase());
        if (!match) continue;

        const pluginSpec = marketplacePluginToSpec(match, mp.source);
        const manifest = await peekManifest(pluginSpec);
        if (!manifest) continue;

        const skills = await peekSkills(pluginSpec);

        const mcpServers = "mcpServers" in manifest && manifest.mcpServers && typeof manifest.mcpServers === "object"
          ? Object.keys(manifest.mcpServers as Record<string, unknown>)
          : [];
        const agents = "agents" in manifest && manifest.agents && Array.isArray(manifest.agents)
          ? manifest.agents.map((a: any) => typeof a === "string" ? a : a.name || "unknown")
          : [];

        let output = `**${match.name}**${match.version ? ` v${match.version}` : ""}\n`;
        output += `from ${mp.source}\n`;
        if (match.description) output += `${match.description}\n`;
        output += `source: ${typeof match.source === "string" ? match.source : JSON.stringify(match.source)}\n`;

        if (mcpServers.length) {
          output += `\nMCP servers:\n`;
          for (const s of mcpServers) output += `  - ${s}\n`;
        }
        if (skills.length) {
          output += `\nSkills (${skills.length}):\n`;
          for (const s of skills) output += `  - ${s}\n`;
        }
        if (agents.length) {
          output += `\nAgents:\n`;
          for (const a of agents) output += `  - ${a}\n`;
        }

        if (!mcpServers.length && !skills.length && !agents.length) {
          output += `\n⚠️ No installable components (MCP servers, skills, or agents). Plugin may contain only Copilot-specific extensions.`;
        }

        return { content: [{ type: "text", text: output }], details: { mcpServers, skills, agents } };
      } catch {
        // Skip marketplace fetch errors
      }
    }

    return { content: [{ type: "text", text: `No plugin found matching "${pluginName}".` }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: `✗ Error peeking plugin: ${err.message}` }], isError: true };
  }
}

// ─── Marketplace Add Handler ─────────────────────────────────────────────────

function handleMarketplaceAdd(source: string, name?: string): import("@earendil-works/pi-coding-agent").AgentToolResult {
  try {
    const displayName = name || source;
    registerMarketplace(displayName, source);
    return { content: [{ type: "text", text: `✓ Marketplace "${displayName}" (${source}) registered.` }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: `✗ Failed to register marketplace: ${err.message}` }], isError: true };
  }
}

// ─── Marketplace List Handler ────────────────────────────────────────────────

function handleMarketplaceList(): import("@earendil-works/pi-coding-agent").AgentToolResult {
  const marketplaces = listMarketplaces();

  if (marketplaces.length === 0) {
    return { content: [{ type: "text", text: "No marketplaces registered." }] };
  }

  let output = "Registered Copilot plugin marketplaces:\n\n";
  for (const mp of marketplaces) {
    output += `- **${mp.name}** (${mp.source})\n\n`;
  }
  return { content: [{ type: "text", text: output }] };
}

// ─── Marketplace Refresh Handler ─────────────────────────────────────────────

async function handleMarketplaceRefresh(marketplace?: string): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult> {
  try {
    if (marketplace) {
      const mp = getMarketplace(marketplace);
      if (!mp) {
        return { content: [{ type: "text", text: `Marketplace "${marketplace}" not found.` }], isError: true };
      }
      await fetchMarketplace(mp.source, true);
      return { content: [{ type: "text", text: `✓ Marketplace "${mp.name}" (${mp.source}) refreshed.` }] };
    }

    // Refresh all
    const marketplaces = listMarketplaces();
    const refreshed: string[] = [];
    for (const mp of marketplaces) {
      try {
        await fetchMarketplace(mp.source, true);
        refreshed.push(mp.name);
      } catch {
        // Skip errors
      }
    }
    return { content: [{ type: "text", text: `✓ Refreshed ${refreshed.length} marketplace(s): ${refreshed.join(", ") || "none"}.` }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: `✗ Error refreshing marketplace: ${err.message}` }], isError: true };
  }
}

// ─── Marketplace Remove Handler ──────────────────────────────────────────────

function handleMarketplaceRemove(name: string): import("@earendil-works/pi-coding-agent").AgentToolResult {
  try {
    // Check if any installed plugins use this marketplace
    const installed = listPlugins();
    const mp = getMarketplace(name);
    if (!mp) {
      return { content: [{ type: "text", text: `Marketplace "${name}" not found.` }], isError: true };
    }

    const hasInstalledPlugins = installed.some(p => p.source === mp.source);
    if (hasInstalledPlugins) {
      return { content: [{ type: "text", text: `✗ Cannot remove marketplace "${mp.name}" — plugins are still installed from it.` }], isError: true };
    }

    unregisterMarketplace(name);
    return { content: [{ type: "text", text: `✓ Marketplace "${mp.name}" removed.` }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: `✗ Failed to remove marketplace: ${err.message}` }], isError: true };
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
