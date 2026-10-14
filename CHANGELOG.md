# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `peek` command to preview plugin manifest before downloading
- `peekSkills()` function to read actual skill names from directories
- Tool toggle system — tools hidden by default, toggle via slash command or tool
- Slash command subcommands mirroring CLI (15+ subcommands)
- Marketplace caching with 24h TTL and staleness warnings
- `marketplace refresh` command to force refresh cache
- `--dry-run` flag for install/uninstall preview
- `--output-dir` flag for custom install locations
- `--backup` flag to create backups before changes
- `--yes/-y` flag infrastructure for skipping prompts
- Progress indicators with animated spinner
- `GITHUB_TOKEN` support for higher API rate limits (5000/hr)
- `--json` flag for list, marketplace list, and search commands
- Color output respecting `NO_COLOR` environment variable
- `--verbose` flag for debug output

### Changed
- Subdirectory source handling for marketplace plugins (e.g. `plugins/azure-skills`)
- Legacy manifest fallback (.mcp.json, .github/mcp.json)
- Cache directory naming: SHA1 truncated to 8 characters

### Fixed
- Extension-only plugins skipped from registry (no longer installed silently)
- Local path parsing before GitHub repo check
- Parallel test isolation in registry tests
- Import paths for ESM compatibility

## [0.1.0] — 2026-01-01

### Added
- Initial release
- CLI with install, uninstall, list, update, enable, disable, search commands
- Marketplace management (add, list, browse, refresh, remove)
- MCP server conversion (Copilot → Pi format)
- Skill and agent extraction
- Plugin registry with owner tracking
- Pi extension with 14 tools and slash command
- Full README documentation
