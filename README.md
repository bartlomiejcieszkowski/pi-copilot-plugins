# pi-copilot-plugins

Install GitHub Copilot plugins into Pi — extract MCP servers, skills, and agents from Copilot's plugin format and register them in Pi's configuration.

## Features

- **Install** Copilot plugins from marketplaces, GitHub repos, git URLs, or local directories
- **Convert** Copilot's `.mcp.json` OAuth format to Pi's `mcp.json` format
- **Extract** skills (`.agent.md` files) and MCP servers from plugin packages
- **Manage** installed plugins — enable, disable, update, uninstall
- **Browse** marketplace plugins with search
- **Pi extension** — `/copilot-plugins` slash command with tools

## Quick Start

```bash
# Install the package
npm install -g pi-copilot-plugins

# Browse marketplace plugins
pi-copilot-plugins marketplace browse copilot-plugins

# Install a plugin
pi-copilot-plugins install workiq@copilot-plugins

# List installed plugins
pi-copilot-plugins list

# Search for plugins
pi-copilot-plugins search "mcp server"
```

## CLI Commands

### Plugin Management

| Command | Description |
|---------|-------------|
| `install <spec>` | Install a plugin |
| `uninstall <name>` | Uninstall a plugin |
| `list [--json]` | List installed plugins |
| `update [name] [--all]` | Update a plugin or all plugins |
| `enable <name>` | Enable a plugin |
| `disable <name>` | Disable a plugin |
| `search <query>` | Search for plugins in registered marketplaces |

### Marketplace Management

| Command | Description |
|---------|-------------|
| `marketplace add <spec>` | Add a marketplace |
| `marketplace list` | List registered marketplaces |
| `marketplace browse <name>` | Browse marketplace plugins |
| `marketplace refresh [name]` | Refresh marketplace catalog |
| `marketplace remove <name>` | Remove a marketplace |

### Spec Formats

```
name@marketplace    # Plugin from a registered marketplace
owner/repo          # GitHub repository root
owner/repo:path     # Subdirectory in a repository
https://...         # Git URL
./path or /abs      # Local directory
```

### Examples

```bash
# From marketplace
pi-copilot-plugins install workiq@copilot-plugins

# From GitHub repo
pi-copilot-plugins install microsoft/work-iq:plugins/workiq

# From git URL
pi-copilot-plugins install https://github.com/microsoft/work-iq.git

# From local directory
pi-copilot-plugins install ./my-plugin

# Add a custom marketplace
pi-copilot-plugins marketplace add github/copilot-plugins

# Search across all marketplaces
pi-copilot-plugins search "mcp server"
```

## Pi Extension

When installed as a Pi extension, this package provides:

- **Slash command**: `/copilot-plugins` — shows installed plugins and usage info
- **Tools**:
  - `copilot_plugins_browse` — browse marketplace plugins
  - `copilot_plugins_install` — install a plugin by spec
  - `copilot_plugins_list` — list installed plugins
  - `copilot_plugins_uninstall` — uninstall a plugin
  - `copilot_plugins_enable` — enable a plugin
  - `copilot_plugins_disable` — disable a plugin

## File Locations

| Purpose | Path |
|---------|------|
| Plugin registry | `~/.pi/agent/copilot-plugins.json` |
| Plugin cache (downloaded source) | `~/.pi/agent/copilot-plugins-cache/<hash>/` |
| Plugin data (runtime writable dir) | `~/.pi/agent/copilot-plugins-data/<name>/` |
| MCP config | `~/.pi/agent/mcp.json` |
| Skills | `~/.agents/skills/<name>/SKILL.md` |
| Agents | `~/.agents/agents/<name>.agent.md` |

## Security

- Plugins are **not cryptographically signed** — the tool emits warnings on install from untrusted sources
- For GitHub installs, the resolved commit SHA is stored for integrity verification
- MCP server paths are validated to stay within the plugin cache/data directories
- All file writes use atomic writes (write to temp, rename) to prevent corruption

## Architecture

```
src/
├── cli.ts              # CLI entry point
├── commands.ts         # CLI command implementations
├── converter.ts        # MCP server conversion (Copilot → Pi format)
├── installer.ts        # Plugin download, extraction, and installation
├── marketplace.ts      # Marketplace fetching and browsing
├── registry.ts         # Plugin registry management
├── types.ts            # Type definitions
├── index.ts            # Pi extension entry point
└── extension/          # Pi extension tools
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## License

MIT
