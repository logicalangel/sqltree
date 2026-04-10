import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConnection = vi.hoisted(() => ({
  query: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('mysql2/promise', () => ({
  default: {
    createConnection: vi.fn().mockResolvedValue(mockConnection),
  },
}));

import { MySQLAdapter } from '../../src/adapters/mysql.js';

describe('MySQLAdapter', () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new MySQLAdapter();
  });

  describe('connect', () => {
    it('connects with a URI', async () => {
      const mysql = (await import('mysql2/promise')).default;
      await adapter.connect({ uri: 'mysql://root:pass@localhost:3306/mydb' });
      expect(mysql.createConnection).toHaveBeenCalledWith({
        uri: 'mysql://root:pass@localhost:3306/mydb',
        connectTimeout: 10000,
      });
    });

    it('connects with individual params', async () => {
      const mysql = (await import('mysql2/promise')).default;
      await adapter.connect({ host: 'h', port: 3307, user: 'u', password: 'p', database: 'db' });
      expect(mysql.createConnection).toHaveBeenCalledWith({
        host: 'h',
        port: 3307,
        user: 'u',
        password: 'p',
        database: 'db',
        connectTimeout: 10000,
      });
    });

    it('uses defaults for missing params', async () => {
      const mysql = (await import('mysql2/promise')).default;
      await adapter.connect({});
      expect(mysql.createConnection).toHaveBeenCalledWith({
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: '',
        database: undefined,
        connectTimeout: 10000,
      });
    });
  });

  describe('disconnect', () => {
    it('ends the connection', async () => {
      await adapter.connect({});
      await adapter.disconnect();
      expect(mockConnection.end).toHaveBeenCalled();
    });

    it('handles disconnect when not connected', async () => {
      await adapter.disconnect();
      // no error
    });

    it('swallows end() errors', async () => {
      mockConnection.end.mockRejectedValueOnce(new Error('fail'));
      await adapter.connect({});
      await adapter.disconnect();
      // no error
    });
  });

  describe('query', () => {
    it('returns rows result for SELECT-like queries', async () => {
      await adapter.connect({});
      mockConnection.query.mockResolvedValue([
        [{ id: 1, name: 'Alice' }],
        [{ name: 'id' }, { name: 'name' }],
      ]);
      const result = await adapter.query('SELECT * FROM users');
      expect(result.type).toBe('rows');
      expect(result.columns).toEqual(['id', 'name']);
      expect(result.rows).toHaveLength(1);
      expect(result.rowCount).toBe(1);
      expect(typeof result.time).toBe('number');
    });

    it('falls back to Object.keys when fields is null', async () => {
      await adapter.connect({});
      mockConnection.query.mockResolvedValue([
        [{ col1: 'a' }],
        null,
      ]);
      const result = await adapter.query('SELECT col1 FROM t');
      expect(result.columns).toEqual(['col1']);
    });

    it('returns empty columns for empty result with no fields', async () => {
      await adapter.connect({});
      mockConnection.query.mockResolvedValue([[], null]);
      const result = await adapter.query('SELECT * FROM empty');
      expect(result.columns).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it('returns command result for INSERT/UPDATE/DELETE', async () => {
      await adapter.connect({});
      mockConnection.query.mockResolvedValue([
        { affectedRows: 3, insertId: 0 },
        undefined,
      ]);
      const result = await adapter.query('DELETE FROM t WHERE id > 5');
      expect(result.type).toBe('command');
      expect(result.rowCount).toBe(3);
    });

    it('returns 0 rowCount when affectedRows is undefined', async () => {
      await adapter.connect({});
      mockConnection.query.mockResolvedValue([{}, undefined]);
      const result = await adapter.query('TRUNCATE t');
      expect(result.type).toBe('command');
      expect(result.rowCount).toBe(0);
    });

    it('passes params to query', async () => {
      await adapter.connect({});
      mockConnection.query.mockResolvedValue([[], null]);
      await adapter.query('SELECT ?', ['val']);
      expect(mockConnection.query).toHaveBeenCalledWith('SELECT ?', ['val']);
    });
  });

  describe('getDatabases', () => {
    it('runs SHOW DATABASES', async () => {
      await adapter.connect({});
      mockConnection.query.mockResolvedValue([
        [{ Database: 'db1' }],
        [{ name: 'Database' }],
      ]);
      const result = await adapter.getDatabases();
      expect(result.type).toBe('rows');
    });
  });

  describe('getTables', () => {
    it('queries information_schema.tables', async () => {
      await adapter.connect({});
      mockConnection.query.mockResolvedValue([
        [{ name: 'users' }],
        [{ name: 'name' }],
      ]);
      const result = await adapter.getTables();
      expect(result.type).toBe('rows');
    });
  });

  describe('describeTable', () => {
    it('queries information_schema.columns with table param', async () => {
      await adapter.connect({});
      mockConnection.query.mockResolvedValue([
        [{ Column: 'id', Type: 'int' }],
        [{ name: 'Column' }, { name: 'Type' }],
      ]);
      const result = await adapter.describeTable('users');
      expect(result.type).toBe('rows');
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('information_schema.columns'),
        ['users']
      );
    });
  });

  describe('getSchemas', () => {
    it('runs SHOW DATABASES', async () => {
      await adapter.connect({});
      mockConnection.query.mockResolvedValue([
        [{ Database: 'db1' }],
        [{ name: 'Database' }],
      ]);
      const result = await adapter.getSchemas();
      expect(result.type).toBe('rows');
    });
  });

  describe('getUsers', () => {
    it('queries mysql.user', async () => {
      await adapter.connect({});
      mockConnection.query.mockResolvedValue([
        [{ User: 'root', Host: 'localhost' }],
        [{ name: 'User' }, { name: 'Host' }],
      ]);
      const result = await adapter.getUsers();
      expect(result.type).toBe('rows');
    });
  });

  describe('quoteIdentifier', () => {
    it('quotes a simple name with backticks', () => {
      expect(adapter.quoteIdentifier('users')).toBe('`users`');
    });

    it('quotes db.table', () => {
      expect(adapter.quoteIdentifier('mydb.users')).toBe('`mydb`.`users`');
    });

    it('escapes backticks in names', () => {
      expect(adapter.quoteIdentifier('my`table')).toBe('`my``table`');
    });
  });

  describe('connectionInfo', () => {
    it('parses URI connection info', async () => {
      await adapter.connect({ uri: 'mysql://admin:secret@dbhost:3307/production' });
      const info = adapter.connectionInfo;
      expect(info.type).toBe('mysql');
      expect(info.host).toBe('dbhost');
      expect(info.port).toBe('3307');
      expect(info.database).toBe('production');
      expect(info.user).toBe('admin');
    });

    it('uses URI defaults for missing parts', async () => {
      await adapter.connect({ uri: 'mysql://localhost/' });
      const info = adapter.connectionInfo;
      expect(info.type).toBe('mysql');
      expect(info.host).toBe('localhost');
      expect(info.port).toBe('3306');
      expect(info.database).toBe('');
      expect(info.user).toBe('');
    });

    it('returns fallback on invalid URI', async () => {
      await adapter.connect({ uri: ':::invalid' });
      const info = adapter.connectionInfo;
      expect(info.type).toBe('mysql');
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
      expect(info.port).toBe('3306');
      expect(info.database).toBe('');
      expect(info.user).toBe('');
    });
  });

  describe('rawConfig', () => {
    it('returns config with type prefix', async () => {
      await adapter.connect({ host: 'h', port: 1 });
      const raw = adapter.rawConfig;
      expect(raw.type).toBe('mysql');
      expect(raw.host).toBe('h');
    });
  });
});
