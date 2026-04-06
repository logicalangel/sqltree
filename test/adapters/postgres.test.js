import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClient = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
  query: vi.fn(),
  on: vi.fn(),
}));

vi.mock('pg', () => ({
  default: {
    Client: function MockClient() { return mockClient; },
  },
}));

import { PostgresAdapter } from '../../src/adapters/postgres.js';

describe('PostgresAdapter', () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new PostgresAdapter();
  });

  describe('connect', () => {
    it('connects with a URI', async () => {
      await adapter.connect({ uri: 'postgresql://user:pass@localhost:5432/mydb' });
      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('connects with individual params', async () => {
      await adapter.connect({ host: 'myhost', port: 1234, user: 'u', password: 'p', database: 'db' });
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it('uses defaults for missing params', async () => {
      await adapter.connect({});
      expect(mockClient.connect).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('ends the client', async () => {
      await adapter.connect({});
      await adapter.disconnect();
      expect(mockClient.end).toHaveBeenCalled();
    });

    it('handles disconnect when not connected', async () => {
      await adapter.disconnect();
      // no error thrown
    });

    it('swallows end() errors', async () => {
      mockClient.end.mockRejectedValueOnce(new Error('fail'));
      await adapter.connect({});
      await adapter.disconnect();
      // no error thrown
    });
  });

  describe('query', () => {
    it('returns rows result when fields exist', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({
        fields: [{ name: 'id' }, { name: 'name' }],
        rows: [{ id: 1, name: 'Alice' }],
        rowCount: 1,
      });
      const result = await adapter.query('SELECT * FROM users');
      expect(result.type).toBe('rows');
      expect(result.columns).toEqual(['id', 'name']);
      expect(result.rows).toHaveLength(1);
      expect(result.rowCount).toBe(1);
      expect(typeof result.time).toBe('number');
    });

    it('uses rows.length when rowCount is null', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({
        fields: [{ name: 'id' }],
        rows: [{ id: 1 }, { id: 2 }],
        rowCount: null,
      });
      const result = await adapter.query('SELECT id FROM t');
      expect(result.rowCount).toBe(2);
    });

    it('returns command result when no fields', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({
        fields: [],
        rows: [],
        command: 'INSERT',
        rowCount: 5,
      });
      const result = await adapter.query('INSERT INTO t VALUES (1)');
      expect(result.type).toBe('command');
      expect(result.command).toBe('INSERT');
      expect(result.rowCount).toBe(5);
    });

    it('returns command result when fields is undefined', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({
        rows: [],
        command: 'CREATE',
        rowCount: 0,
      });
      const result = await adapter.query('CREATE TABLE t (id int)');
      expect(result.type).toBe('command');
    });

    it('passes params to query', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({ fields: [], rows: [], rowCount: 0 });
      await adapter.query('SELECT $1', ['val']);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT $1', ['val']);
    });
  });

  describe('getDatabases', () => {
    it('queries pg_database', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({
        fields: [{ name: 'name' }],
        rows: [{ name: 'db1' }],
        rowCount: 1,
      });
      const result = await adapter.getDatabases();
      expect(result.type).toBe('rows');
      expect(mockClient.query.mock.calls[0][0]).toContain('pg_database');
    });
  });

  describe('getTables', () => {
    it('queries pg_tables with schema param', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({
        fields: [{ name: 'name' }],
        rows: [{ name: 'users' }],
        rowCount: 1,
      });
      const result = await adapter.getTables('public');
      expect(result.type).toBe('rows');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('pg_tables'),
        ['public']
      );
    });

    it('defaults to public schema', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({
        fields: [{ name: 'name' }],
        rows: [],
        rowCount: 0,
      });
      await adapter.getTables();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        ['public']
      );
    });
  });

  describe('describeTable', () => {
    it('parses schema.table format', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({
        fields: [{ name: 'Column' }],
        rows: [{ Column: 'id' }],
        rowCount: 1,
      });
      await adapter.describeTable('myschema.mytable');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        ['mytable', 'myschema']
      );
    });

    it('defaults to public schema for bare table name', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({
        fields: [{ name: 'Column' }],
        rows: [],
        rowCount: 0,
      });
      await adapter.describeTable('users');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        ['users', 'public']
      );
    });
  });

  describe('getSchemas', () => {
    it('queries information_schema.schemata', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({
        fields: [{ name: 'name' }],
        rows: [{ name: 'public' }],
        rowCount: 1,
      });
      const result = await adapter.getSchemas();
      expect(result.type).toBe('rows');
    });
  });

  describe('getUsers', () => {
    it('queries pg_user', async () => {
      await adapter.connect({});
      mockClient.query.mockResolvedValue({
        fields: [{ name: 'User' }],
        rows: [{ User: 'postgres' }],
        rowCount: 1,
      });
      const result = await adapter.getUsers();
      expect(result.type).toBe('rows');
    });
  });

  describe('quoteIdentifier', () => {
    it('quotes a simple name', () => {
      expect(adapter.quoteIdentifier('users')).toBe('"users"');
    });

    it('quotes schema.table', () => {
      expect(adapter.quoteIdentifier('public.users')).toBe('"public"."users"');
    });

    it('escapes double quotes in names', () => {
      expect(adapter.quoteIdentifier('my"table')).toBe('"my""table"');
    });
  });

  describe('connectionInfo', () => {
    it('parses URI connection info', async () => {
      await adapter.connect({ uri: 'postgresql://admin:secret@dbhost:5433/production' });
      const info = adapter.connectionInfo;
      expect(info.type).toBe('postgres');
      expect(info.host).toBe('dbhost');
      expect(info.port).toBe('5433');
      expect(info.database).toBe('production');
      expect(info.user).toBe('admin');
    });

    it('uses URI defaults for missing parts', async () => {
      await adapter.connect({ uri: 'postgresql://localhost/' });
      const info = adapter.connectionInfo;
      expect(info.type).toBe('postgres');
      expect(info.host).toBe('localhost');
      expect(info.port).toBe('5432');
      expect(info.database).toBe('');
      expect(info.user).toBe('');
    });

    it('returns fallback on invalid URI', async () => {
      await adapter.connect({ uri: ':::invalid' });
      const info = adapter.connectionInfo;
      expect(info.type).toBe('postgres');
      expect(info.host).toBe('?');
    });

    it('returns config-based info for non-URI connection', async () => {
      await adapter.connect({ host: 'myhost', port: 9999, user: 'u', database: 'db' });
      const info = adapter.connectionInfo;
      expect(info.host).toBe('myhost');
      expect(info.port).toBe('9999');
      expect(info.database).toBe('db');
      expect(info.user).toBe('u');
    });

    it('uses defaults for missing config fields', async () => {
      await adapter.connect({});
      const info = adapter.connectionInfo;
      expect(info.host).toBe('localhost');
      expect(info.port).toBe('5432');
      expect(info.database).toBe('');
      expect(info.user).toBe('');
    });
  });

  describe('rawConfig', () => {
    it('returns config with type prefix', async () => {
      await adapter.connect({ host: 'h', port: 1 });
      const raw = adapter.rawConfig;
      expect(raw.type).toBe('postgres');
      expect(raw.host).toBe('h');
    });
  });
});
