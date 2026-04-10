import mysql from 'mysql2/promise';
import { BaseAdapter } from './base.js';

export class MySQLAdapter extends BaseAdapter {
  #connection = null;
  #config = null;

  async connect(config) {
    this.#config = config;
    const timeout = config.connectTimeout ?? 10000;
    if (config.uri) {
      this.#connection = await mysql.createConnection({
        uri: config.uri,
        connectTimeout: timeout,
        ...(config.ssl != null ? { ssl: config.ssl } : {}),
      });
    } else {
      this.#connection = await mysql.createConnection({
        host: config.host || 'localhost',
        port: config.port || 3306,
        user: config.user || 'root',
        password: config.password || '',
        database: config.database,
        connectTimeout: timeout,
        ...(config.ssl != null ? { ssl: config.ssl } : {}),
      });
    }
  }

  async disconnect() {
    if (this.#connection) {
      await this.#connection.end().catch(() => {});
      this.#connection = null;
    }
  }

  async query(sql, params = []) {
    const start = performance.now();
    const [result, fields] = await this.#connection.query(sql, params);
    const time = parseFloat((performance.now() - start).toFixed(1));

    // SELECT / SHOW / DESCRIBE return arrays
    if (Array.isArray(result)) {
      return {
        type: 'rows',
        columns: fields ? fields.map(f => f.name) : (result.length > 0 ? Object.keys(result[0]) : []),
        rows: result,
        rowCount: result.length,
        time,
      };
    }

    // INSERT / UPDATE / DELETE return ResultSetHeader
    return {
      type: 'command',
      command: '',
      rowCount: result.affectedRows || 0,
      time,
    };
  }

  async getDatabases() {
    return this.query('SHOW DATABASES');
  }

  async getTables() {
    return this.query(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY table_name`
    );
  }

  async describeTable(tableName) {
    return this.query(
      `SELECT
        column_name AS \`Column\`,
        column_type AS \`Type\`,
        is_nullable AS \`Nullable\`,
        COALESCE(column_default, '') AS \`Default\`,
        column_key AS \`Key\`,
        extra AS \`Extra\`
      FROM information_schema.columns
      WHERE table_name = ? AND table_schema = DATABASE()
      ORDER BY ordinal_position`,
      [tableName]
    );
  }

  async getSchemas() {
    return this.query('SHOW DATABASES');
  }

  async getUsers() {
    return this.query(
      `SELECT User, Host FROM mysql.user ORDER BY User`
    );
  }

  quoteIdentifier(name) {
    return name
      .split('.')
      .map(part => '`' + part.replace(/`/g, '``') + '`')
      .join('.');
  }

  get connectionInfo() {
    if (this.#config.uri) {
      try {
        const url = new URL(this.#config.uri);
        return {
          type: 'mysql',
          host: url.hostname || 'localhost',
          port: url.port || '3306',
          database: url.pathname.slice(1) || '',
          user: decodeURIComponent(url.username) || '',
        };
      } catch {
        return { type: 'mysql', host: '?', port: '?', database: '?', user: '?' };
      }
    }
    return {
      type: 'mysql',
      host: this.#config.host || 'localhost',
      port: String(this.#config.port || 3306),
      database: this.#config.database || '',
      user: this.#config.user || '',
    };
  }

  get rawConfig() {
    return { type: 'mysql', ...this.#config };
  }
}
