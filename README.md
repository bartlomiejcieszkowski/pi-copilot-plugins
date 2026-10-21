# pi-copilot-plugins

[![npm version](https://img.shields.io/npm/v/pi-copilot-plugins.svg)](https://www.npmjs.com/package/pi-copilot-plugins)
[![license](https://img.shields.io/npm/l/pi-copilot-plugins.svg)](https://github.com/bartlomiejcieszkowski/pi-copilot-plugins/blob/main/LICENSE)

Install GitHub Copilot plugins into Pi — extract MCP servers, skills, and agents from Copilot's plugin format and register them in Pi's configuration.

## Features

- **Install** Copilot plugins from marketplaces, GitHub repos, git URLs, or local directories
- **Convert** Copilot's `.mcp.json` OAuth format to Pi's `mcp.json` format
- **Extract** skills (`.agent.md` files) and MCP servers from plugin packages
- **Manage** installed plugins — enable, disable, update, uninstall
- **Browse** marketplace plugins with search
- **Pi extension** — `/copilot-plugins` slash command with tools

## Install

To use `pi-copilot-plugins` as a Pi extension (slash command + tools in chat):

**Option 1: Install from npm**

```bash
pi install npm:pi-copilot-plugins
```

**Option 2: Install from GitHub**

```bash
pi install git:github.com/bartlomiejcieszkowski/pi-copilot-plugins
```

**Option 3: Install from local path (development)**

```bash
pi install ./pi-copilot-plugins
```

Once installed, restart Pi and use:
- `/copilot-plugins` — slash command to show installed count and usage
- Tools: `copilot_plugins_browse`, `copilot_plugins_install`, `copilot_plugins_list`, `copilot_plugins_uninstall`, `copilot_plugins_enable`, `copilot_plugins_disable`, `copilot_plugins_update`, `copilot_plugins_info`, `copilot_plugins_search`

### Development

To test the extension without installing it permanently, use `pi -e` to load it directly:

```bash
pi -e ./pi-copilot-plugins
```

This loads the extension for the current session only — changes to the source are picked up after a Pi reload.

## Local Plugin Directory

You can install plugins from a local directory on your filesystem. The directory must contain a valid plugin manifest:

### Agent Plugins 1.0/1.1 Format

```
my-plugin/
├── .github/
│   └── plugin/
│       └── plugin.json    # Manifest with $schema, mcpServers, skills, agents
├── skills/
│   ├── my-skill/
│   │   └── SKILL.md
│   └── another-skill/
│       └── SKILL.md
└── com.github.copilot/
    └── agents/
        └── my-agent.md
```

### Legacy Format

```
my-plugin/
├── .mcp.json              # MCP server config (or .github/mcp.json)
├── skills/
│   ├── my-skill/
│   │   └── SKILL.md
│   └── another-skill/
│       └── SKILL.md
└── agents/
    └── my-agent.md
```

### Manifest Example (Agent Plugins 1.0)

```json
{
  "$schema": "https://raw.githubusercontent.com/earendil-works/copilot-plugins/main/manifest-schemas/AgentPlugins-1.0.json",
  "name": "my-plugin",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "my-mcp-server"]
    }
  },
  "skills": [
    { "name": "my-skill", "path": "skills/my-skill/SKILL.md" }
  ],
  "agents": [
    { "name": "my-agent", "path": "com.github.copilot/agents/my-agent.md" }
  ]
}
```

### Legacy Manifest Example

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "my-mcp-server"]
    }
  },
  "skills": ["skills/my-skill/SKILL.md"],
  "agents": ["agents/my-agent.md"]
}
```

### Project-Level Install

Use `--local` to install a local plugin at the project level (writes to `.pi/mcp.json` and `.agents/` in the current directory instead of user-level paths):

```bash
pi-copilot-plugins install ./my-plugin --local
```

## Pi Extension

When installed as a Pi extension, this package provides:

- **Slash command**: `/copilot-plugins` — shows installed plugins and usage info
  - `/copilot-plugins help` — show usage reference
  - `/copilot-plugins install <spec>` — install a plugin
  - `/copilot-plugins uninstall <name>` — uninstall a plugin
  - `/copilot-plugins list [--json]` — list installed plugins
  - `/copilot-plugins update [name] [--all]` — update a plugin or all
  - `/copilot-plugins enable <name>` — enable a plugin
  - `/copilot-plugins disable <name>` — disable a plugin
  - `/copilot-plugins search <query>` — search for plugins
  - `/copilot-plugins peek <spec>` — preview a plugin before installing
  - `/copilot-plugins tools` — show tool toggle status
  - `/copilot-plugins tools enable` — enable all Copilot tools
  - `/copilot-plugins tools disable` — disable all Copilot tools
  - `/copilot-plugins marketplace add <source>` — add a marketplace
  - `/copilot-plugins marketplace list` — list marketplaces
  - `/copilot-plugins marketplace browse <name>` — browse marketplace
  - `/copilot-plugins marketplace refresh [name]` — refresh marketplace
  - `/copilot-plugins marketplace remove <name>` — remove marketplace

- **Tools** (disabled by default to save context):
  - `copilot_plugins_browse` — browse marketplace plugins
  - `copilot_plugins_install` — install a plugin by spec
  - `copilot_plugins_list` — list installed plugins
  - `copilot_plugins_uninstall` — uninstall a plugin
  - `copilot_plugins_enable` — enable a plugin
  - `copilot_plugins_disable` — disable a plugin
  - `copilot_plugins_update` — update a plugin
  - `copilot_plugins_info` — show plugin details
  - `copilot_plugins_search` — search for plugins
  - `copilot_plugins_peek` — preview a plugin before installing
  - `copilot_plugins_marketplace_add` — add a marketplace
  - `copilot_plugins_marketplace_list` — list marketplaces
  - `copilot_plugins_marketplace_refresh` — refresh marketplace cache
  - `copilot_plugins_marketplace_remove` — remove a marketplace

- **Tool toggle**: `copilot_plugins_tools_toggle` (always visible)
  - `copilot_plugins_tools_toggle({ enabled: true })` — enable all 14 tools
  - `copilot_plugins_tools_toggle({ enabled: false })` — hide all 14 tools
  - Tools are hidden by default to save context; enable when you need to browse, install, or manage plugins

## File Locations

| Purpose | Path |
| --- | --- |
| Plugin registry | `~/.pi/agent/pi-copilot-plugins.json` |
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

## Configuration

### GitHub Token

GitHub API rate limits are 60 requests/hour for unauthenticated requests. To increase the limit to 5,000 requests/hour, you can provide a GitHub personal access token in one of two ways:

**Option 1: Environment variable**

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

**Option 2: Config file (takes precedence)**

Add a `config` section to your plugin registry file (`~/.pi/agent/pi-copilot-plugins.json`):

```json
{
  "marketplaces": { ... },
  "plugins": { ... },
  "config": {
    "githubToken": "ghp_your_token_here"
  }
}
```

The config file token takes precedence over environment variables. This is useful for sharing configuration across sessions or environments without relying on shell environment setup.

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

## CLI Commands

### Standalone install

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

# From local directory (project-level)
pi-copilot-plugins install ./my-plugin --local

# Add a custom marketplace
pi-copilot-plugins marketplace add github/copilot-plugins

# Search across all marketplaces
pi-copilot-plugins search "mcp server"
```

## License

MIT
