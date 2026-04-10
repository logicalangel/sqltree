# Contributing to sqltree

Thanks for your interest in contributing! Here's how to get started.

## Try It

The quickest way to run sqltree is with `npx`:

```bash
npx sqltree
```

## Development Setup

```bash
git clone https://github.com/logicalangel/sqltree.git
cd sqltree
npm install
```

Run locally:

```bash
node bin/sqltree.js
```

## Making Changes

1. Fork the repo and create a branch from `main`.
2. Make your changes.
3. Run the test suite (see below).
4. Test against a real PostgreSQL or MySQL instance if applicable.
5. Commit with a clear message describing what changed and why.
6. Open a pull request.

## Running Tests

```bash
# Run the full test suite
npm test

# Run tests in watch mode during development
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

All pull requests must pass the existing test suite. Please add tests for new functionality.

## Architecture

- **`src/adapters/`** — Database adapters. Each adapter extends `BaseAdapter` from `base.js`. The registry in `index.js` maps database type names to adapter classes.
- **`src/tree.js`** — Tree data model for database objects.
- **`src/tui.js`** — Terminal UI powered by neo-blessed.
- **`src/app.js`** — CLI argument parsing, connection logic, and entry point.
- **`src/config.js`** — Saved connection profile management.
- **`src/ui.js`** — Shared UI helpers (spinners, prompts).

## Reporting Bugs

Open an issue with:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version (`node --version`)
- Database type and version

## Code Style

- ES modules (`import`/`export`)
- No TypeScript — plain JavaScript
- Keep dependencies minimal
- Follow existing patterns in the codebase

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
