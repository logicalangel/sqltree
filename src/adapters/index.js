import { PostgresAdapter } from './postgres.js';
import { MySQLAdapter } from './mysql.js';
import { BaseAdapter } from './base.js';

const registry = new Map();

export function registerAdapter(name, AdapterClass) {
  registry.set(name.toLowerCase(), AdapterClass);
}

// PostgreSQL-compatible databases (all use the pg wire protocol)
for (const alias of [
  'postgres', 'postgresql', 'pg',
  'cockroachdb', 'crdb',
  'redshift',
  'yugabytedb', 'yugabyte', 'ysql',
  'timescaledb', 'timescale',
  'supabase',
  'neon',
  'alloydb',
  'aurora-pg', 'aurora-postgres',
  'greenplum', 'gpdb',
  'citus',
  'cratedb', 'crate',
  'questdb',
  'materialize', 'mz',
]) {
  registerAdapter(alias, PostgresAdapter);
}

// MySQL-compatible databases (all use the MySQL wire protocol)
for (const alias of [
  'mysql', 'mariadb',
  'tidb',
  'singlestore', 'memsql',
  'planetscale',
  'vitess',
  'aurora-mysql',
  'percona',
  'clickhouse',
]) {
  registerAdapter(alias, MySQLAdapter);
}

export function createAdapter(type) {
  const AdapterClass = registry.get(type.toLowerCase());
  if (!AdapterClass) {
    const known = [...new Set(registry.values())].length;
    throw new Error(
      `Unsupported database type: "${type}". ` +
      `Supported: ${[...registry.keys()].join(', ')}`
    );
  }
  const adapter = new AdapterClass();
  if (!(adapter instanceof BaseAdapter)) {
    throw new Error(`Adapter for "${type}" must extend BaseAdapter`);
  }
  return adapter;
}

export { BaseAdapter } from './base.js';
