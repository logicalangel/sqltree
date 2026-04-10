# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Database support**: CockroachDB, Redshift, YugabyteDB, TimescaleDB, Supabase, Neon, AlloyDB, Aurora (PG & MySQL), MariaDB, TiDB, SingleStore, PlanetScale, Vitess, Percona
- **CLI flags**: `--page-size`, `--timeout`, `--ascii`, `--ssl`, `--ssl-reject-unauthorized`
- **DATABASE_URL** environment variable support as connection fallback
- **ASCII mode**: automatic detection for `TERM=dumb`/`TERM=linux` or via `--ascii` flag
- **BaseAdapter** abstract class for adapter contract enforcement
- **Adapter registry** with `registerAdapter()` for third-party extensibility
- **Error surfacing**: tree loading errors now displayed in the detail panel
- **Minimum terminal size check** (60×10)
- **Connection timeouts** (10 s default) and SSL pass-through for all adapters
- **CI improvements**: macOS test matrix, npm audit step, npm pack dry-run, Dependabot
- **Project files**: `.editorconfig`, `.nvmrc`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates

### Fixed

- `publish.yml` missing `NODE_AUTH_TOKEN` environment variable
- Unused `createReadStream` import removed
- TTY guard prevents crashes in non-interactive environments
