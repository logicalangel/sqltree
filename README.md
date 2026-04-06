# 🌳 sqltree

[![npm version](https://img.shields.io/npm/v/sqltree.svg)](https://www.npmjs.com/package/sqltree)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/github/actions/workflow/status/logicalangel/sqltree/test.yml?label=tests)](https://github.com/logicalangel/sqltree/actions)
[![Coverage](https://img.shields.io/badge/coverage-98%25-brightgreen.svg)](https://github.com/logicalangel/sqltree)

A beautiful, interactive terminal database client for **PostgreSQL** and **MySQL**.
Navigate your databases with a tree browser, run SQL in a full-screen REPL — all from your terminal.

```
  ╔══════════════════════════════════════╗
  ║   🌳 sqltree v1.0                    ║
  ║   PostgreSQL · MySQL · CLI Client   ║
  ╚══════════════════════════════════════╝
```

## Features

- **Two-column TUI** — tree browser on the left, detail panel on the right
- **Interactive tree navigation** — browse databases, schemas, tables, and roles with arrow keys
- **Full-screen SQL REPL** — press `Tab` to enter SQL mode with auto-completion
- **Two databases, one tool** — PostgreSQL and MySQL with a unified interface
- **Database switching** — select a different database in the tree to reconnect automatically
- **Table preview** — press `Enter` on a table to see structure + data preview
- **Paginated browsing** — `b` to browse large tables page by page
- **Export** — save query results to CSV or JSON
- **Saved connections** — store and reuse connection profiles
- **Tab completion** — SQL keywords and table names in REPL mode

## Install

```bash
# Clone and install
git clone https://github.com/pariarastegar/sqltree.git
cd sqltree
npm install

# Make `sqltree` available globally
npm link

# Or run directly
node bin/sqltree.js
```

## Usage

```bash
# Interactive mode — guided connection setup
sqltree

# Connect via URI
sqltree --uri postgresql://user:pass@localhost:5432/mydb
sqltree --uri mysql://root:secret@127.0.0.1:3306/app

# Connect with individual params
sqltree -t postgres -H localhost -p 5432 -U postgres -d mydb
sqltree -t mysql -H 127.0.0.1 -U root -d test
```

## Keyboard Shortcuts

### Tree Browser

| Key                 | Action                       |
| ------------------- | ---------------------------- |
| `↑` / `k`           | Move up                      |
| `↓` / `j`           | Move down                    |
| `Enter` / `→` / `l` | Expand node / preview table  |
| `←` / `h`           | Collapse node / go to parent |
| `Tab` / `s`         | Enter SQL REPL mode          |
| `b`                 | Browse table (paginated)     |
| `d`                 | Describe table structure     |
| `e`                 | Export last result to CSV    |
| `r`                 | Refresh tree                 |
| `q`                 | Quit                         |

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

- Node.js 18+
- Network access to your database server

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
