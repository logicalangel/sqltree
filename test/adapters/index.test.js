import { describe, it, expect, vi } from 'vitest';

// Mock the adapter modules before importing
vi.mock('../../src/adapters/postgres.js', async () => {
  const { BaseAdapter } = await import('../../src/adapters/base.js');
  class MockPostgresAdapter extends BaseAdapter {}
  return { PostgresAdapter: MockPostgresAdapter };
});
vi.mock('../../src/adapters/mysql.js', async () => {
  const { BaseAdapter } = await import('../../src/adapters/base.js');
  class MockMySQLAdapter extends BaseAdapter {}
  return { MySQLAdapter: MockMySQLAdapter };
});

import { createAdapter, registerAdapter } from '../../src/adapters/index.js';
import { PostgresAdapter } from '../../src/adapters/postgres.js';
import { MySQLAdapter } from '../../src/adapters/mysql.js';
import { BaseAdapter } from '../../src/adapters/base.js';

describe('createAdapter', () => {
  it('returns PostgresAdapter for "postgres"', () => {
    const adapter = createAdapter('postgres');
    expect(adapter).toBeInstanceOf(PostgresAdapter);
  });

  it('returns PostgresAdapter for "postgresql"', () => {
    const adapter = createAdapter('postgresql');
    expect(adapter).toBeInstanceOf(PostgresAdapter);
  });

  it('returns PostgresAdapter for "pg"', () => {
    const adapter = createAdapter('pg');
    expect(adapter).toBeInstanceOf(PostgresAdapter);
  });

  it('returns MySQLAdapter for "mysql"', () => {
    const adapter = createAdapter('mysql');
    expect(adapter).toBeInstanceOf(MySQLAdapter);
  });

  it('returns MySQLAdapter for "mariadb"', () => {
    const adapter = createAdapter('mariadb');
    expect(adapter).toBeInstanceOf(MySQLAdapter);
  });

  it('throws for unsupported type', () => {
    expect(() => createAdapter('unsupported_db_xyz')).toThrow('Unsupported database type: "unsupported_db_xyz"');
  });

  // Extended database support tests
  it('supports PostgreSQL-compatible databases', () => {
    for (const alias of ['cockroachdb', 'crdb', 'redshift', 'yugabytedb', 'timescaledb', 'supabase', 'neon', 'alloydb', 'aurora-pg', 'greenplum', 'gpdb', 'citus', 'cratedb', 'crate', 'questdb', 'materialize', 'mz']) {
      expect(createAdapter(alias)).toBeInstanceOf(PostgresAdapter);
    }
  });

  it('supports MySQL-compatible databases', () => {
    for (const alias of ['tidb', 'singlestore', 'memsql', 'planetscale', 'vitess', 'aurora-mysql', 'percona', 'clickhouse']) {
      expect(createAdapter(alias)).toBeInstanceOf(MySQLAdapter);
    }
  });

  it('registerAdapter adds a custom adapter', () => {
    class CustomAdapter extends BaseAdapter {}
    registerAdapter('custom', CustomAdapter);
    const adapter = createAdapter('custom');
    expect(adapter).toBeInstanceOf(CustomAdapter);
  });
});
