import pg from 'pg';
import { BaseAdapter } from './base.js';

export class PostgresAdapter extends BaseAdapter {
  #client = null;
  #config = null;

  async connect(config) {
    this.#config = config;
    const timeout = config.connectTimeout ?? 10000;
    if (config.uri) {
      this.#client = new pg.Client({
        connectionString: config.uri,
        connectionTimeoutMillis: timeout,
        ...(config.ssl != null ? { ssl: config.ssl } : {}),
      });
    } else {
      this.#client = new pg.Client({
        host: config.host || 'localhost',
        port: config.port || 5432,
        user: config.user || 'postgres',
        password: config.password || '',
        database: config.database,
        connectionTimeoutMillis: timeout,
        ...(config.ssl != null ? { ssl: config.ssl } : {}),
      });
    }
    this.#client.on('error', () => {}); // prevent unhandled error crash
    await this.#client.connect();
  }

  async disconnect() {
    if (this.#client) {
      await this.#client.end().catch(() => {});
      this.#client = null;
    }
  }

  async query(sql, params = []) {
    const start = performance.now();
    const result = await this.#client.query(sql, params);
    const time = parseFloat((performance.now() - start).toFixed(1));

    if (result.fields && result.fields.length > 0) {
      return {
        type: 'rows',
        columns: result.fields.map(f => f.name),
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
        time,
      };
    }

    return {
      type: 'command',
      command: result.command || '',
      rowCount: result.rowCount,
      time,
    };
  }

  async getDatabases() {
    return this.query(
      `SELECT datname AS name FROM pg_database WHERE datistemplate = false ORDER BY datname`
    );
  }

  async getTables(schema = 'public') {
    return this.query(
      `SELECT tablename AS name FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
      [schema]
    );
  }

  async describeTable(tableName) {
    const parts = tableName.split('.');
    const table = parts.length > 1 ? parts[1] : parts[0];
    const schema = parts.length > 1 ? parts[0] : 'public';

    return this.query(
      `SELECT
        column_name AS "Column",
        data_type || CASE
          WHEN character_maximum_length IS NOT NULL
          THEN '(' || character_maximum_length || ')'
          ELSE '' END AS "Type",
        is_nullable AS "Nullable",
        COALESCE(column_default, '') AS "Default"
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = $2
      ORDER BY ordinal_position`,
      [table, schema]
    );
  }

  async getSchemas() {
    return this.query(
      `SELECT schema_name AS name FROM information_schema.schemata ORDER BY schema_name`
    );
  }

  async getUsers() {
    return this.query(
      `SELECT usename AS "User", usesuper AS "Superuser", usecreatedb AS "Create DB" FROM pg_user ORDER BY usename`
    );
  }

  quoteIdentifier(name) {
    return name
      .split('.')
      .map(part => '"' + part.replace(/"/g, '""') + '"')
      .join('.');
  }

  get connectionInfo() {
    if (this.#config.uri) {
      try {
        const url = new URL(this.#config.uri);
        return {
          type: 'postgres',
          host: url.hostname || 'localhost',
          port: url.port || '5432',
          database: url.pathname.slice(1) || '',
          user: decodeURIComponent(url.username) || '',
        };
      } catch {
        return { type: 'postgres', host: '?', port: '?', database: '?', user: '?' };
      }
    }
    return {
      type: 'postgres',
      host: this.#config.host || 'localhost',
      port: String(this.#config.port || 5432),
      database: this.#config.database || '',
      user: this.#config.user || '',
    };
  }

  get rawConfig() {
    return { type: 'postgres', ...this.#config };
  }
}
