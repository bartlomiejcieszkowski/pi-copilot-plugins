# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Configured skill paths that point directly at a skill directory are now discovered (#25)
- Skill installation copies the skill directory instead of passing the `SKILL.md` file path to directory copy logic, and removes the destination if the copy fails (#26)

### Security

- Files inside a plugin that resolve outside it through a symlink or junction are no longer copied into the skills or agents directories (#28)
- Configured `skills` and `agents` paths containing `..`, or pointing outside the plugin, are rejected at discovery time instead of being installed (#28)

## [1.0.3] — 2026-11-24

### Security

- Marketplace `{"source": "url"}` entries are validated before use, so a manifest can no longer pass git's `ext::` transport (or shell syntax) to `git clone` and execute commands (#23)
- `git clone` and `git rev-parse` run through `execFile` with an argument array instead of a shell string, so urls and cache paths are never re-parsed by a shell (#23)
- Marketplace sources containing `..` segments are rejected instead of resolved above the plugin cache, and a plugin sub path that escapes the cache directory is rejected before cloning (#23)
- `owner/repo` sources from marketplace manifests must match `owner/repo` before being interpolated into GitHub urls or API paths (#23)

### Changed

- Git clone urls are limited to `https://` and `ssh://` (plus the scp-like ssh form); plain `http://`, bare or command-bearing strings are rejected before they reach git (#23)
- Updated `undici` from ^8.12.4 to ^8.13.1

### Fixed

- Marketplace plugins that declare `metadata.pluginRoot` now resolve relative sources inside the marketplace repository instead of cloning an unrelated `owner/repo` GitHub repository (#22)
- `install name@marketplace` now clones the marketplace source (not the registered marketplace name) (#22)
- Peek reports manifest read/validation errors separately from missing catalog entries (#22)
- Peek and install read manifests from `.github/plugin/plugin.json`, `.plugin/plugin.json`, and `.claude-plugin/plugin.json` inside the plugin directory (#22)
- `update --all` uses the registry source (including the resolved plugin path and scope) instead of the flattened repository name (#22)

## [1.0.2] — 2026-11-20

### Fixed

- Marketplace fetch falls back to `master` when `main` returns HTTP 404 (#15)
- Registry writes use a temp file named per process and retry the rename when another process still holds the target open (Windows `EPERM`)
- Test workers get their own `PI_TEST_DIR` instead of sharing one, which made the registry test flaky under parallel execution

### Changed

- Updated `undici` from ^8.12.2 to ^8.12.4
- Updated `vitest` from ^5.0.5 to ^5.1.0
- Updated `@vitest/coverage-v8` from ^5.0.5 to ^5.1.0
- Updated `@types/node` from ^26.6.5 to ^26.6.6

## [1.0.1] — 2026-10-21

### Fixed

- Tool toggle scope: lock/unlock only controls toggle tool visibility, enable/disable only controls 14 tools visibility (two independent axes)
- Config-based exposure at startup: read config first, register tools with correct exposure (not hardcoded hidden then re-register)
- Missing `return` in toggle tool execute handlers — tools now respond correctly
- Duplicate toggle tool registration removed
- Tools status display: use `isToolsEnabled()`/`isToolsLocked()` booleans instead of per-tool `getToolState()` object
- Tools default subcommand: call `handleToolsLock/Unlock/handleToolsToggle` for immediate effect instead of just `setToolEnabled`
- Updated lock/unlock messages to reflect scope (only toggle tool affected by lock/unlock)

### Changed

- Updated `undici` from ^8.11.2 to ^8.12.2
- Updated `vitest` from ^5.0.4 to ^5.0.5
- Updated `@vitest/coverage-v8` from ^5.0.4 to ^5.0.5

## [1.0.0] — 2026-10-19

### Changed

- writeRegistry only writes when content actually changed (prevents unnecessary file modifications)
- createDefaultConfig no longer overwrites existing config on every access

### Fixed

- Path constants use path.join to prevent existsSync false negatives on Windows
- writeRegistry atomic rename works on Windows cross-drive scenarios
- readOrCreateConfig handles malformed JSON gracefully
- npm pkg fix: bin path (`./dist/cli.js` → `dist/cli.js`), repository.url normalized to `git+https://`

## [0.6.0] — 2026-10-16

### Added

- `validate <file.json>` command — validates a manifest against Agent Plugins 1.0.0 spec
- Manifest validator with checks for required fields, name constraints, metadata types, extensions field
- Unknown fields reported and ignored per §5.2
- Tool lock/unlock system — lock hides toggle tool permanently
- Config file created with default marketplaces on first run
- Reload warning after install/uninstall/update operations

### Changed

- Marketplace add uses `name` field from `marketplace.json` when available
- Registry file renamed from `copilot-plugins.json` to `pi-copilot-plugins.json`

### Fixed

- Manifest detection improved with candidate path listing on failure
- Backslash paths in skill/agent paths rejected per spec convention
- Peek manifest handles subdirectory sources with normalized paths

## [0.5.0] — 2026-10-15

### Changed

- Updated `undici` from ^7.0.0 to ^8.11.2
- Updated `vitest` from ^3.0.0 to ^5.0.4
- Updated `@vitest/coverage-v8` from ^3.0.0 to ^5.0.4
- Updated `typescript` from 5.9.3 to 7.0.2 (semver-major)
- Updated `@types/node` from 22.20.5 to 26.6.5 (semver-major)
- Updated `actions/checkout` from 4 to 7
- Updated `actions/setup-node` from 4 to 7
- Require Node 22+ (aligns with Pi's own Node requirement)
- Removed Node 20.x from CI test matrix
- Release workflow updated to use OIDC instead of NPM_TOKEN secret
- Release workflow triggers on push tags v* instead of GitHub release published

### Added

- `engines.node >= 22` in package.json

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
