# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-10-15

### Added
- `reinstall` command — uninstalls then reinstalls a plugin to restore original files
- `lastVersion` tracking in registry — shows version change on update
- Release notes on update — displays previous version → new version with SHA
- Copy entire skill directory on install (not just `SKILL.md`) — uses `copyDir()`
- Read VERSION from package.json dynamically (not hardcoded)
- Reinstall support in slash command handler

### Fixed
- MCP servers now written under `mcpServers` wrapper key (Pi's expected format)
- Bare plugin names now search all registered marketplaces, not just the default
- Marketplace browse slash command correctly destructures `{ plugins, stale }` return value
- Marketplace installs resolved inside `installPluginPackage` before download

## [0.3.1] — 2026-10-15

### Fixed
- MCP servers now written under `mcpServers` wrapper key (Pi's expected format)
- Bare plugin names now search all registered marketplaces, not just the default
- Marketplace browse slash command correctly destructures `{ plugins, stale }` return value
- Marketplace installs resolved inside `installPluginPackage` before download

## [0.2.0] — 2026-10-15

### Added
- `awesome-copilot` marketplace auto-registered alongside `copilot-plugins` by default

### Fixed
- Slash command args parsed as string (not array) — fixes `marketplace list`, `tools enable`, etc.
- Tools enable/disable now shown in slash command help text

## [0.1.0] — 2026-10-14

### Added
- CLI commands: `install`, `uninstall`, `list`, `update`, `enable`, `disable`, `search`
- Marketplace management: `marketplace add`, `marketplace list`, `marketplace browse`, `marketplace refresh`, `marketplace remove`
- MCP server conversion from Copilot `.mcp.json` format to Pi `mcp.json` format
- Skill and agent extraction from plugin packages
- Plugin registry with owner tracking and targeted uninstall
- Pi extension with slash command `/copilot-plugins` and 14 tools (browse, install, list, uninstall, enable, disable, update, info, search, peek, marketplace add/list/refresh/remove)
- Tool toggle system — tools hidden by default, toggle via `copilot_plugins_tools_toggle`
- Slash command subcommands mirroring CLI commands
- Marketplace caching with 24h TTL and staleness warnings
- `--json` flag for `list`, `marketplace list`, and `search` commands
- Color output respecting `NO_COLOR` environment variable
- `--verbose` flag for debug output
- `--dry-run` flag to preview install/uninstall without changes
- `--output-dir` flag for custom install locations
- `--backup` flag to create timestamped backups before changes
- `--yes/-y` flag infrastructure for skipping prompts
- Progress indicators with animated spinner for downloads/clones
- `peek` command to preview plugin manifest before downloading
- `peekSkills()` to read actual skill names from repository directories
- `GITHUB_TOKEN` / `GH_TOKEN` support for higher API rate limits (5000/hr)
- Config file support for `githubToken` with precedence over env vars
- Cache directory naming via SHA1 truncated to 8 characters
- Plugin SHA tracking in registry for integrity verification
- Extension-only plugins detected and skipped from registry with warning

### Changed
- Local path parsing now takes priority over GitHub repo matching
- Marketplace list shows both name and source (e.g. `copilot-plugins (github/copilot-plugins)`)
- Marketplace remove accepts either name or source

### Fixed
- Parallel test isolation via `PI_TEST_DIR` environment variable
- Import paths for ESM compatibility
- Duplicate `ToolsToggleParams` declaration in extension entry
- Extension-only plugins no longer installed silently
- `registerTool()` called with single `ToolDefinition` object (not two arguments)
- Tool labels and descriptions explicitly mention "Copilot"
- Subdirectory source handling for marketplace plugins (e.g. `plugins/azure-skills`)
- Legacy manifest fallback through `.mcp.json` and `.github/mcp.json`
- AutoUpdate field removed from marketplace registry (never acted on)
- Cache directories isolated per plugin and cleaned up on uninstall

### Removed
- `autoUpdate` field from marketplace registry (never acted on)

### Documentation
- Full README with install, CLI, Pi extension, file locations, security, and configuration sections
- CONTRIBUTING.md with setup, commit format, and PR guidelines
- CHANGELOG.md in Keep a Changelog format
- CI/CD workflows for build, test, and coverage
- Release workflow with npm stage publish

### Package
- Repository metadata, bugs URL, homepage, and keywords in package.json
- `@vitest/coverage-v8` dev dependency for CI coverage step
- `package-lock.json` for reproducible installs
- npm pack verified clean (39 files, 310KB)
