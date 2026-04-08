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
3. Test against a real PostgreSQL or MySQL instance.
4. Commit with a clear message describing what changed and why.
5. Open a pull request.

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
