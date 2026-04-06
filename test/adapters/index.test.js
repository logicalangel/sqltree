import { describe, it, expect, vi } from 'vitest';

// Mock the adapter modules before importing
vi.mock('../../src/adapters/postgres.js', () => ({
  PostgresAdapter: vi.fn(),
}));
vi.mock('../../src/adapters/mysql.js', () => ({
  MySQLAdapter: vi.fn(),
}));

import { createAdapter } from '../../src/adapters/index.js';
import { PostgresAdapter } from '../../src/adapters/postgres.js';
import { MySQLAdapter } from '../../src/adapters/mysql.js';

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
    expect(() => createAdapter('sqlite')).toThrow('Unsupported database type: "sqlite"');
  });
});
