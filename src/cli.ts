#!/usr/bin/env node

import { cmdInstall, cmdUninstall, cmdList, cmdUpdate, cmdEnable, cmdDisable, cmdMarketplaceAdd, cmdMarketplaceList, cmdMarketplaceBrowse, cmdMarketplaceRefresh, cmdMarketplaceRemove, cmdSearch, parseSpec } from "./commands.js";
import { bold, cyan, gray } from "./colors.js";

const VERSION = "0.1.0";

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
  pi-copilot-plugins install <spec> [--local]

Install a plugin from a marketplace, GitHub repo, or local directory.

SPEC FORMATS:
  name@marketplace    Plugin from a registered marketplace
  owner/repo          GitHub repository root
  owner/repo:path     Subdirectory in a repository
  https://...         Git URL
  ./path or /abs      Local directory

OPTIONS:
  --local, -l         Install at project level (.pi/mcp.json, .agents/)

EXAMPLES:
  pi-copilot-plugins install workiq@copilot-plugins
  pi-copilot-plugins install microsoft/work-iq:plugins/workiq
  pi-copilot-plugins install ./my-plugin
`);
          break;
        }
        const local = args.includes("--local") || args.includes("-l");
        await cmdInstall(args[1], local);
        break;
      }

      case "uninstall":
      case "remove":
      case "rm": {
        if (args.length < 2 || args[1] === "--help" || args[1] === "-h") {
          console.log(`
USAGE:
  pi-copilot-plugins uninstall <name> [--local]

Uninstall an installed plugin.

OPTIONS:
  --local, -l         Uninstall project-level plugin

EXAMPLES:
  pi-copilot-plugins uninstall workiq
  pi-copilot-plugins uninstall workiq --local
`);
          break;
        }
        const local = args.includes("--local") || args.includes("-l");
        const result = cmdUninstall(args[1], local);
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
      console.error(`Error: ${err.message}`);
    }
    // Exit code: 1 = general error, 3 = plugin not found
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
