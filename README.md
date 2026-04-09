# 🌳 sqltree

[![npm version](https://img.shields.io/npm/v/sqltree.svg)](https://www.npmjs.com/package/sqltree)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/github/actions/workflow/status/logicalangel/sqltree/test.yml?label=tests)](https://github.com/logicalangel/sqltree/actions)
[![Coverage](https://img.shields.io/badge/coverage-98%25-brightgreen.svg)](https://github.com/logicalangel/sqltree)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/rastegarpap)

A beautiful, interactive terminal database client for **PostgreSQL** and **MySQL**.
Navigate your databases with a tree browser, run SQL in a full-screen REPL — all from your terminal.

```
  ╔══════════════════════════════════════╗
  ║   🌳 sqltree v1.3                    ║
  ║   PostgreSQL · MySQL · CLI Client    ║
  ╚══════════════════════════════════════╝
```

## Features

- **Two-column TUI** — tree browser on the left, detail panel on the right
- **Interactive tree navigation** — browse databases, schemas, tables, and roles with arrow keys
- **Full-screen SQL REPL** — press `Tab` or `s` to enter SQL mode with auto-completion
- **Two databases, one tool** — PostgreSQL and MySQL with a unified interface
- **Database switching** — select a different database in the tree to reconnect automatically
- **Paginated browsing** — press `Enter` on a table to browse data page by page
- **Export** — save query results to CSV or JSON
- **Saved connections** — store and reuse connection profiles
- **Tab completion** — SQL keywords and table names in REPL mode

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
```

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

> **Note:** Profiles may contain passwords — treat this file as sensitive.

## Requirements

- Node.js 20+
- Network access to your database server

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
