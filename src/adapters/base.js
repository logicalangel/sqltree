export class BaseAdapter {
  async connect(config) { throw new Error('not implemented'); }
  async disconnect() { throw new Error('not implemented'); }
  async query(sql, params = []) { throw new Error('not implemented'); }
  async getDatabases() { throw new Error('not implemented'); }
  async getTables(schema) { throw new Error('not implemented'); }
  async describeTable(tableName) { throw new Error('not implemented'); }
  async getSchemas() { throw new Error('not implemented'); }
  async getUsers() { throw new Error('not implemented'); }
  quoteIdentifier(name) { throw new Error('not implemented'); }
  get connectionInfo() { throw new Error('not implemented'); }
  get rawConfig() { throw new Error('not implemented'); }
}
