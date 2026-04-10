# 🌳 sqltree

[![npm version](https://img.shields.io/npm/v/sqltree.svg)](https://www.npmjs.com/package/sqltree)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/github/actions/workflow/status/logicalangel/sqltree/test.yml?label=tests)](https://github.com/logicalangel/sqltree/actions)
[![Coverage](https://img.shields.io/badge/coverage-98%25-brightgreen.svg)](https://github.com/logicalangel/sqltree)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/rastegarpap)
[![Tutorial](https://img.shields.io/badge/Tutorial-Getting%20Started-blue)](https://logicalangel.github.io/SqlTree/)

A beautiful, interactive terminal database client for **PostgreSQL**, **MySQL**, and many compatible databases.
Navigate your databases with a tree browser, run SQL in a full-screen REPL — all from your terminal.

```
  ╔══════════════════════════════════════╗
  ║   🌳 sqltree v1.4                    ║
  ║   PostgreSQL · MySQL · CLI Client    ║
  ╚══════════════════════════════════════╝
```

## Supported Databases

**PostgreSQL-compatible:** PostgreSQL, CockroachDB, Redshift, YugabyteDB, TimescaleDB, Supabase, Neon, AlloyDB, Aurora PostgreSQL

**MySQL-compatible:** MySQL, MariaDB, TiDB, SingleStore, PlanetScale, Vitess, Aurora MySQL, Percona

## Features

- **Two-column TUI** — tree browser on the left, detail panel on the right
- **Interactive tree navigation** — browse databases, schemas, tables, and roles with arrow keys
- **Full-screen SQL REPL** — press `Tab` or `s` to enter SQL mode with auto-completion
- **20+ databases, one tool** — PostgreSQL, MySQL, and many compatible databases with a unified interface
- **Database switching** — select a different database in the tree to reconnect automatically
- **Paginated browsing** — press `Enter` on a table to browse data page by page
- **Export** — save query results to CSV or JSON
- **Saved connections** — store and reuse connection profiles
- **Tab completion** — SQL keywords and table names in REPL mode
- **ASCII mode** — works in terminals without Unicode/emoji support
- **Extensible adapters** — register custom database adapters via `registerAdapter()`

## Quick Start

The easiest way to use sqltree is with `npx` — no install needed:

```bash
# Interactive mode — guided connection setup
npx sqltree

# Connect via URI
npx sqltree --uri postgresql://user:pass@localhost:5432/mydb
npx sqltree --uri mysql://root:secret@127.0.0.1:3306/app

# Connect with individual params
npx sqltree -t postgres -H localhost -p 5432 -U postgres -d mydb
npx sqltree -t mysql -H 127.0.0.1 -U root -d test

# Use DATABASE_URL environment variable
DATABASE_URL=postgresql://user:pass@localhost/mydb npx sqltree
```

### CLI Options

| Flag | Description |
| ---- | ----------- |
| `--uri <url>` | Connection URI |
| `-t, --type <type>` | Database type (postgres, mysql, cockroachdb, etc.) |
| `-H, --host <host>` | Database host |
| `-p, --port <port>` | Database port |
| `-U, --user <user>` | Database user |
| `-P, --password <pass>` | Database password |
| `-d, --database <name>` | Database name |
| `--page-size <n>` | Rows per page when browsing tables (default: 50) |
| `--timeout <ms>` | Connection timeout in milliseconds (default: 10000) |
| `--ssl` | Enable SSL for the connection |
| `--ssl-reject-unauthorized <bool>` | Verify SSL certificates (default: true) |
| `--ascii` | Use ASCII characters instead of emoji |
| `--saved` | Use a previously saved connection |
| `--help` | Show help |
| `--version` | Show version |

### Environment Variables

| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Fallback connection URI when no arguments are provided |

### Global Install (optional)

```bash
npm install -g sqltree
sqltree
```

## Keyboard Shortcuts

### Tree Browser

| Key                 | Action                       |
| ------------------- | ---------------------------- |
| `↑` / `k`           | Move up                      |
| `↓` / `j`           | Move down                    |
| `Enter` / `→` / `l` | Expand node / browse table   |
| `←` / `h`           | Collapse node / go to parent |
| `Tab` / `s`         | Enter SQL REPL mode          |
| `d`                 | Describe table structure     |
| `e`                 | Export last result to CSV    |
| `r`                 | Refresh tree                 |
| `q`                 | Quit                         |

### Browse Mode

| Key | Action        |
| --- | ------------- |
| `↓` | Next page     |
| `↑` | Previous page |
| `←` | Exit browse   |
| `w` | Scroll up     |
| `s` | Scroll down   |

### SQL REPL

| Command               | Action                          |
| --------------------- | ------------------------------- |
| SQL ending with `;`   | Execute query                   |
| `\back`               | Return to tree browser          |
| `\export <csv\|json>` | Export last result              |
| `\save <name>`        | Save current connection profile |
| `Ctrl+C`              | Cancel / return to tree         |

## Saved Connections

Connection profiles are stored in `~/.sqltree/connections.json` with file permissions restricted to your user (mode `0600`).

> **⚠️ Warning:** Profiles contain passwords in plain text — treat this file as sensitive. Avoid committing it to version control.

## Requirements

- Node.js 20+
- Network access to your database server

## Tutorial

New to sqltree? Check out the **[Getting Started Tutorial](https://logicalangel.github.io/SqlTree/)** — a step-by-step guide covering installation, connecting, tree navigation, the SQL REPL, exporting, config, and more.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
