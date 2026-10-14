# Contributing to pi-copilot-plugins

Thanks for your interest in contributing!

## Getting Started

### Prerequisites

- Node.js 22+
- Git

### Setup

```bash
git clone https://github.com/bartlomiejcieszkowski/pi-copilot-plugins.git
cd pi-copilot-plugins
npm install
npm run build
```

### Running Tests

```bash
npm test          # run tests in watch mode
npx vitest run    # run tests once
npx vitest run --coverage  # run with coverage report
```

### Making Changes

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Run tests: `npm test`
4. Ensure build is clean: `npm run build`
5. Commit with a [Conventional Commits](https://www.conventionalcommits.org/) message
6. Push and open a Pull Request

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add marketplace refresh command
fix: handle malformed plugin manifests
docs: update README with installation guide
chore: update dependencies
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`

## Code Style

- TypeScript strict mode enabled
- No `any` types
- Use `const { x } = require("y")` for Node builtins (environment compatibility)
- Static imports for all other modules (ESM)
- 2-space indentation

## Pull Request Process

1. Ensure all tests pass (`npm test`)
2. Ensure build is clean (`npm run build`)
3. Update README.md if you change functionality
4. Get review from maintainers
5. Squash merge on approval

## Reporting Bugs

Use [GitHub Issues](https://github.com/bartlomiejcieszkowski/pi-copilot-plugins/issues). Include:

- What you tried
- Expected behavior
- Actual behavior
- Steps to reproduce
