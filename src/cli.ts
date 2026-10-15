#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
let VERSION = "0.0.0";
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
  VERSION = pkg.version || "0.0.0";
} catch {
  // Use default if package.json can't be read
}

import { cmdInstall, cmdUninstall, cmdReinstall, cmdList, cmdUpdate, cmdEnable, cmdDisable, cmdMarketplaceAdd, cmdMarketplaceList, cmdMarketplaceBrowse, cmdMarketplaceRefresh, cmdMarketplaceRemove, cmdSearch, cmdPeek, parseSpec } from "./commands.js";
import { bold, cyan, gray, red } from "./colors.js";
import { formatError } from "./errors.js";

function printUsage(): void {
  console.log(`
${bold(`pi-copilot-plugins v${VERSION}`)}

${bold("DESCRIPTION:"  )}
  Manage GitHub Copilot plugins in Pi.

${bold("USAGE:")}
  pi-copilot-plugins <command> [options]

${bold("COMMANDS:")}
  ${cyan("install <spec>")}${bold(" (alias: add)")}
    Install a plugin
  ${cyan("uninstall <name>")}${bold(" (aliases: remove, rm)")}
    Uninstall a plugin
  ${cyan("reinstall <name>")}
    Reinstall a plugin (uninstall then reinstall to restore originals)

${bold("OPTIONS:")}
  ${cyan("--local, -l")}           Install/uninstall at project level (.pi/mcp.json, .agents/)
  ${cyan("list [--json]")}         List installed plugins
  ${cyan("update [name] [--all]")} Update a plugin or all plugins
  ${cyan("enable <name>")}         Enable a plugin
  ${cyan("disable <name>")}        Disable a plugin
  ${cyan("search <query>")}        Search for plugins in registered marketplaces

${bold("MARKETPLACE COMMANDS:")}
  ${cyan("marketplace add <spec>")}${bold(" (alias: add)")}
    Add a marketplace
  ${cyan("marketplace list [--json]")}
    List registered marketplaces
  ${cyan("marketplace browse <name>")}
    Browse marketplace plugins
  ${cyan("marketplace refresh [name]")}${bold(" (aliases: update, refresh)")}
    Refresh marketplace catalog
  ${cyan("marketplace remove <name>")}
    Remove a marketplace

${bold("OPTIONS:")}
  ${cyan("--version")}   Show version number
  ${cyan("--help")}      Show help

${bold("ENVIRONMENT:")}
  ${cyan("GITHUB_TOKEN")} or ${cyan("GH_TOKEN")}    GitHub personal access token for higher API rate limits
                      (5,000/hr vs 60/hr unauthenticated)

${bold("SPEC FORMATS (for install):"  )}
  ${cyan("name@marketplace")}    Plugin from a registered marketplace
  ${cyan("owner/repo")}          GitHub repository root
  ${cyan("owner/repo:path")}     Subdirectory in a repository
  ${cyan("https://...")}         Git URL
  ${cyan("./path or /abs")}      Local directory

${bold("EXAMPLES:")}
  pi-copilot-plugins install workiq@copilot-plugins
  pi-copilot-plugins install microsoft/work-iq:plugins/workiq
  pi-copilot-plugins install https://github.com/microsoft/work-iq.git
  pi-copilot-plugins install ./my-plugin
  pi-copilot-plugins search "mcp server"
  pi-copilot-plugins marketplace add github/copilot-plugins
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  try {
    switch (command) {
      case "peek": {
        const nonFlagArgs = args.slice(1).filter(a => !a.startsWith("--"));
        const jsonFlag = args.includes("--json");
        if (nonFlagArgs.length < 1) {
          console.log(`
USAGE:
  pi-copilot-plugins peek <name> [marketplace-source] [--json]

Preview a plugin's manifest and components without downloading.
Searches all registered marketplaces (or a specific one if scoped).

OPTIONS:
  --json                Output as JSON

EXAMPLES:
  pi-copilot-plugins peek agent-council
  pi-copilot-plugins peek agent-council@github/awesome-copilot
  pi-copilot-plugins peek agent-council --json
`);
          break;
        }
        const spec = nonFlagArgs[0];
        await cmdPeek(spec, jsonFlag);
        break;
      }
      case "--version":
      case "-v":
        console.log(VERSION);
        break;

      case "--help":
      case "-h":
      case "help":
        printUsage();
        break;

      case "install":
      case "add": {
        if (args.length < 2 || args[1] === "--help" || args[1] === "-h") {
          console.log(`
USAGE:
  pi-copilot-plugins install <spec> [--local] [--verbose] [--dry-run]

Install a plugin from a marketplace, GitHub repo, or local directory.

SPEC FORMATS:
  name@marketplace    Plugin from a registered marketplace
  owner/repo          GitHub repository root
  owner/repo:path     Subdirectory in a repository
  https://...         Git URL
  ./path or /abs      Local directory

OPTIONS:
  --local, -l         Install at project level (.pi/mcp.json, .agents/)
  --verbose, -V       Show verbose output (download URLs, files copied, etc.)
  --dry-run           Preview install without making changes
  --yes, -y           Skip confirmation prompts (future use)
  --output-dir <dir>  Custom install directory (overrides all default paths)
  --backup            Create backup before modifying files

EXAMPLES:
  pi-copilot-plugins install workiq@copilot-plugins
  pi-copilot-plugins install microsoft/work-iq:plugins/workiq
  pi-copilot-plugins install ./my-plugin
`);
          break;
        }
        const local = args.includes("--local") || args.includes("-l");
        const verbose = args.includes("--verbose") || args.includes("-V");
        const dryRun = args.includes("--dry-run");
        const yes = args.includes("--yes") || args.includes("-y");
        const outputDir = args.find((a) => a.startsWith("--output-dir="))?.split("=")[1] ||
                          args.find((a) => a === "--output-dir") ? args[args.indexOf("--output-dir") + 1] : undefined;
        const backup = args.includes("--backup");
        await cmdInstall(args[1], local, verbose, dryRun, yes, outputDir, backup);
        break;
      }

      case "uninstall":
      case "remove":
      case "rm": {
        if (args.length < 2 || args[1] === "--help" || args[1] === "-h") {
          console.log(`
USAGE:
  pi-copilot-plugins uninstall <name> [--local] [--verbose] [--dry-run]

Uninstall an installed plugin.

OPTIONS:
  --local, -l         Uninstall project-level plugin
  --verbose, -V       Show verbose output (files removed, servers removed, etc.)
  --dry-run           Preview uninstall without making changes
  --yes, -y           Skip confirmation prompts (future use)
  --output-dir <dir>  Custom install directory (overrides all default paths)
  --backup            Create backup before modifying files

EXAMPLES:
  pi-copilot-plugins uninstall workiq
  pi-copilot-plugins uninstall workiq --local
`);
          break;
        }
        const local = args.includes("--local") || args.includes("-l");
        const verbose = args.includes("--verbose") || args.includes("-V");
        const dryRun = args.includes("--dry-run");
        const yes = args.includes("--yes") || args.includes("-y");
        const outputDir = args.find((a) => a.startsWith("--output-dir="))?.split("=")[1] ||
                          args.find((a) => a === "--output-dir") ? args[args.indexOf("--output-dir") + 1] : undefined;
        const backup = args.includes("--backup");
        const result = cmdUninstall(args[1], local, verbose, dryRun, yes, outputDir, backup);
        process.exit(result.success ? 0 : 1);
      }

      case "reinstall": {
        if (args.length < 2 || args[1] === "--help" || args[1] === "-h") {
          console.log(`
USAGE:
  pi-copilot-plugins reinstall <name> [--local] [--verbose] [--dry-run]

Reinstall an installed plugin (uninstall then reinstall to restore originals).

OPTIONS:
  --local, -l         Reinstall project-level plugin
  --verbose, -V       Show verbose output
  --dry-run           Preview reinstall without making changes
  --yes, -y           Skip confirmation prompts (future use)
  --output-dir <dir>  Custom install directory (overrides all default paths)
  --backup            Create backup before modifying files

EXAMPLES:
  pi-copilot-plugins reinstall workiq
  pi-copilot-plugins reinstall workiq --local
`);
          break;
        }
        const local = args.includes("--local") || args.includes("-l");
        const verbose = args.includes("--verbose") || args.includes("-V");
        const dryRun = args.includes("--dry-run");
        const yes = args.includes("--yes") || args.includes("-y");
        const outputDir = args.find((a) => a.startsWith("--output-dir="))?.split("=")[1] ||
                          args.find((a) => a === "--output-dir") ? args[args.indexOf("--output-dir") + 1] : undefined;
        const backup = args.includes("--backup");
        const result = await cmdReinstall(args[1], local, verbose, dryRun, yes, outputDir, backup);
        process.exit(result.success ? 0 : 1);
      }

      case "list": {
        const json = args.includes("--json");
        cmdList(json);
        break;
      }

      case "update": {
        const all = args.includes("--all");
        const name = all ? undefined : args[1];
        await cmdUpdate(name, all);
        break;
      }

      case "enable": {
        if (args.length < 2) {
          console.error("Error: enable requires a plugin name");
          process.exit(2);
        }
        cmdEnable(args[1]);
        break;
      }

      case "disable": {
        if (args.length < 2) {
          console.error("Error: disable requires a plugin name");
          process.exit(2);
        }
        cmdDisable(args[1]);
        break;
      }

      case "search": {
        if (args.length < 2) {
          console.error("Error: search requires a query");
          process.exit(2);
        }
        const json = args.includes("--json");
        await cmdSearch(args[1], json);
        break;
      }

      case "marketplace": {
        if (args.length < 2) {
          console.error("Error: marketplace requires a subcommand");
          process.exit(2);
        }

        const subcommand = args[1];

        switch (subcommand) {
          case "add": {
            if (args.length < 3) {
              console.error("Error: marketplace add requires a source");
              process.exit(2);
            }
            await cmdMarketplaceAdd(args[2]);
            break;
          }

          case "list": {
            const json = args.includes("--json");
            cmdMarketplaceList(json);
            break;
          }

          case "browse": {
            if (args.length < 3) {
              console.error("Error: marketplace browse requires a marketplace name");
              process.exit(2);
            }
            const json = args.includes("--json");
            await cmdMarketplaceBrowse(args[2], json);
            break;
          }

          case "refresh":
          case "update": {
            await cmdMarketplaceRefresh(args[2]);
            break;
          }

          case "remove": {
            if (args.length < 3) {
              console.error("Error: marketplace remove requires a marketplace name");
              process.exit(2);
            }
            const force = args.includes("--force");
            cmdMarketplaceRemove(args[2], force);
            break;
          }

          default:
            console.error(`Unknown marketplace subcommand: ${subcommand}`);
            process.exit(2);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(2);
    }
  } catch (err: any) {
    if (err.message) {
      const formatted = formatError(err.message, {
        type: err.type || "general",
        name: err.name,
      });
      console.error(red(`Error: ${formatted}`));
    }
    // Exit code: 1 = general error, 2 = usage, 3 = plugin not found
    if (err.message?.includes("not found")) {
      process.exit(3);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message || err}`);
  process.exit(1);
});
