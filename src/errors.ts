// Improved error messages with actionable suggestions.

export function formatError(message: string, context?: { type?: string; name?: string }): string {
  const type = context?.type || "general";
  const name = context?.name;

  // Plugin not found
  if (type === "plugin" && message.includes("not found")) {
    return `Plugin "${name}" not found. Try:\n` +
      `  - 'pi-copilot-plugins search ${name}' to find it in marketplaces\n` +
      `  - 'pi-copilot-plugins marketplace list' to see registered marketplaces\n` +
      `  - 'pi-copilot-plugins marketplace add github/owner/repo' to add a new marketplace`;
  }

  // Marketplace not registered
  if (type === "marketplace" && message.includes("not registered")) {
    return `Marketplace "${name}" not registered. Run:\n` +
      `  pi-copilot-plugins marketplace add github/owner/repo`;
  }

  // Plugin not installed
  if (message.includes("not installed")) {
    if (name) {
      return `Plugin "${name}" is not installed. Run:\n` +
        `  pi-copilot-plugins install <spec> to install it`;
    }
    return `The specified plugin is not installed. Check with:\n` +
      `  pi-copilot-plugins list`;
  }

  // Already exists
  if (message.includes("already exists")) {
    if (name) {
      return `${name} already exists. Use --force to overwrite.`;
    }
    return `An item with this name already exists. Use --force to overwrite.`;
  }

  // MCP not found
  if (message.includes("not found") && message.includes("mcp")) {
    return `MCP configuration not found. Pi's mcp.json may not exist yet.\n` +
      `  Run 'pi-copilot-plugins install <spec>' to create it.`;
  }

  // Clone failure
  if (message.includes("Failed to clone")) {
    return `Failed to clone repository. Make sure:\n` +
      `  - The repository exists and is accessible\n` +
      `  - You have network connectivity\n` +
      `  - Git is installed and in PATH`;
  }

  // Unknown source type
  if (message.includes("Unknown source type")) {
    return `Unknown plugin source type. Supported types are:\n` +
      `  - marketplace: name@marketplace\n` +
      `  - github: owner/repo or owner/repo:path\n` +
      `  - git: https://...\n` +
      `  - local: ./path or /abs/path`;
  }

  // Scope mismatch (project vs user level)
  if (message.includes("is installed at")) {
    if (message.includes("project level")) {
      return `This plugin is installed at project level. Use --local to manage it:\n` +
        `  pi-copilot-plugins ${message.includes("uninstall") ? "uninstall" : "enable"} <name> --local`;
    }
    return `This plugin is installed at user level. Use without --local to manage it:\n` +
      `  pi-copilot-plugins ${message.includes("uninstall") ? "uninstall" : "enable"} <name>`;
  }

  // Default: return the original message with a suggestion hint
  if (type !== "general") {
    return `${message}\n` +
      `Hint: Run 'pi-copilot-plugins --help' for usage information.`;
  }

  return message;
}
