import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TreeNode, TreeModel, NodeType } from '../src/tree.js';

// Mock createAdapter for _switchDatabase dynamic import
const { mockNewAdapter } = vi.hoisted(() => {
  const mockNewAdapter = {
    connectionInfo: {
      type: 'postgres',
      host: 'localhost',
      port: '5432',
      database: 'other',
      user: 'testuser',
    },
    rawConfig: { type: 'postgres', host: 'localhost', database: 'other' },
    getDatabases: vi.fn().mockResolvedValue({
      type: 'rows', columns: ['name'],
      rows: [{ name: 'mydb' }, { name: 'other' }], rowCount: 2,
    }),
    getSchemas: vi.fn().mockResolvedValue({
      type: 'rows', columns: ['name'],
      rows: [{ name: 'public' }], rowCount: 1,
    }),
    getTables: vi.fn().mockResolvedValue({
      type: 'rows', columns: ['name'],
      rows: [{ name: 'orders' }], rowCount: 1,
    }),
    getUsers: vi.fn().mockResolvedValue({
      type: 'rows', columns: ['User'],
      rows: [{ User: 'admin' }], rowCount: 1,
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    query: vi.fn(),
    quoteIdentifier: vi.fn((n) => `"${n}"`),
  };
  return { mockNewAdapter };
});

vi.mock('../src/adapters/index.js', () => ({
  createAdapter: vi.fn(() => mockNewAdapter),
}));

// ── TreeNode Tests ──────────────────────────────────────────

describe('TreeNode', () => {
  it('creates a node with defaults', () => {
    const node = new TreeNode('test', NodeType.TABLE);
    expect(node.label).toBe('test');
    expect(node.type).toBe(NodeType.TABLE);
    expect(node.data).toEqual({});
    expect(node.children).toEqual([]);
    expect(node.expanded).toBe(false);
    expect(node.loaded).toBe(false);
    expect(node.parent).toBe(null);
  });

  it('creates a node with custom data', () => {
    const node = new TreeNode('db1', NodeType.DATABASE, { database: 'db1' });
    expect(node.data).toEqual({ database: 'db1' });
  });

  describe('addChild', () => {
    it('adds a child and sets parent', () => {
      const parent = new TreeNode('root', NodeType.SERVER);
      const child = new TreeNode('child', NodeType.DATABASE);
      const result = parent.addChild(child);
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(child);
      expect(child.parent).toBe(parent);
      expect(result).toBe(child);
    });
  });

  describe('depth', () => {
    it('returns 0 for root node', () => {
      const node = new TreeNode('root', NodeType.SERVER);
      expect(node.depth).toBe(0);
    });

    it('returns correct depth for nested nodes', () => {
      const root = new TreeNode('root', NodeType.SERVER);
      const child = new TreeNode('child', NodeType.DATABASE);
      const grandchild = new TreeNode('gc', NodeType.TABLE);
      root.addChild(child);
      child.addChild(grandchild);
      expect(child.depth).toBe(1);
      expect(grandchild.depth).toBe(2);
    });
  });

  describe('isLeaf', () => {
    it('returns true for TABLE type', () => {
      const node = new TreeNode('t', NodeType.TABLE);
      expect(node.isLeaf).toBe(true);
    });

    it('returns true for ROLE type', () => {
      const node = new TreeNode('r', NodeType.ROLE);
      expect(node.isLeaf).toBe(true);
    });

    it('returns false for DATABASE type', () => {
      const node = new TreeNode('db', NodeType.DATABASE);
      expect(node.isLeaf).toBe(false);
    });

    it('returns false for SERVER type', () => {
      const node = new TreeNode('s', NodeType.SERVER);
      expect(node.isLeaf).toBe(false);
    });

    it('returns false for SCHEMA_GROUP type', () => {
      expect(new TreeNode('sg', NodeType.SCHEMA_GROUP).isLeaf).toBe(false);
    });

    it('returns false for SCHEMA type', () => {
      expect(new TreeNode('s', NodeType.SCHEMA).isLeaf).toBe(false);
    });

    it('returns false for TABLE_GROUP type', () => {
      expect(new TreeNode('tg', NodeType.TABLE_GROUP).isLeaf).toBe(false);
    });

    it('returns false for ROLE_GROUP type', () => {
      expect(new TreeNode('rg', NodeType.ROLE_GROUP).isLeaf).toBe(false);
    });
  });
});

// ── NodeType Tests ──────────────────────────────────────────

describe('NodeType', () => {
  it('has all expected types', () => {
    expect(NodeType.SERVER).toBe('server');
    expect(NodeType.DATABASE).toBe('database');
    expect(NodeType.SCHEMA_GROUP).toBe('schema_group');
    expect(NodeType.SCHEMA).toBe('schema');
    expect(NodeType.TABLE_GROUP).toBe('table_group');
    expect(NodeType.TABLE).toBe('table');
    expect(NodeType.ROLE_GROUP).toBe('role_group');
    expect(NodeType.ROLE).toBe('role');
  });
});

// ── TreeModel Tests ─────────────────────────────────────────

function createMockAdapter(type = 'postgres', database = 'mydb') {
  return {
    connectionInfo: {
      type,
      host: 'localhost',
      port: type === 'postgres' ? '5432' : '3306',
      database,
      user: 'testuser',
    },
    rawConfig: { type, host: 'localhost', database },
    getDatabases: vi.fn().mockResolvedValue({
      type: 'rows',
      columns: ['name'],
      rows: [{ name: 'mydb' }, { name: 'other' }],
      rowCount: 2,
    }),
    getSchemas: vi.fn().mockResolvedValue({
      type: 'rows',
      columns: ['name'],
      rows: [{ name: 'public' }, { name: 'private' }],
      rowCount: 2,
    }),
    getTables: vi.fn().mockResolvedValue({
      type: 'rows',
      columns: ['name'],
      rows: [{ name: 'users' }, { name: 'posts' }],
      rowCount: 2,
    }),
    getUsers: vi.fn().mockResolvedValue({
      type: 'rows',
      columns: ['User'],
      rows: [{ User: 'admin' }],
      rowCount: 1,
    }),
    describeTable: vi.fn().mockResolvedValue({
      type: 'rows',
      columns: ['Column'],
      rows: [{ Column: 'id' }],
      rowCount: 1,
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    query: vi.fn(),
    quoteIdentifier: vi.fn((n) => `"${n}"`),
  };
}

describe('TreeModel', () => {
  let adapter, model;

  beforeEach(() => {
    adapter = createMockAdapter();
    model = new TreeModel(adapter);
  });

  describe('constructor', () => {
    it('sets up initial state', () => {
      expect(model.adapter).toBe(adapter);
      expect(model.root).toBe(null);
      expect(model.flatList).toEqual([]);
      expect(model.cursor).toBe(0);
      expect(model.connInfo).toBe(adapter.connectionInfo);
    });
  });

  describe('init', () => {
    it('builds tree with databases and positioned cursor', async () => {
      await model.init();
      expect(model.root).not.toBeNull();
      expect(model.root.type).toBe(NodeType.SERVER);
      expect(model.root.expanded).toBe(true);
      expect(model.root.children.length).toBe(2); // mydb, other

      const mydb = model.root.children.find(c => c.data.database === 'mydb');
      expect(mydb.expanded).toBe(true);

      const other = model.root.children.find(c => c.data.database === 'other');
      expect(other.expanded).toBe(false);

      // Cursor should be on mydb
      expect(model.flatList[model.cursor]).toBe(mydb);
    });

    it('loads schemas and tables for postgres', async () => {
      await model.init();
      expect(adapter.getSchemas).toHaveBeenCalled();
      expect(adapter.getTables).toHaveBeenCalled();
      expect(adapter.getUsers).toHaveBeenCalled();
    });

    it('handles getDatabases failure gracefully', async () => {
      adapter.getDatabases.mockRejectedValue(new Error('fail'));
      await model.init();
      // Falls back to current database
      expect(model.root.children.length).toBe(1);
      expect(model.root.children[0].data.database).toBe('mydb');
    });

    it('builds tree for mysql adapter', async () => {
      adapter = createMockAdapter('mysql', 'mydb');
      model = new TreeModel(adapter);
      await model.init();
      expect(model.root.children.length).toBe(2);
      // MySQL doesn't have schemas, instead has Tables group directly
      const mydb = model.root.children.find(c => c.data.database === 'mydb');
      const tableGroup = mydb.children.find(c => c.type === NodeType.TABLE_GROUP);
      expect(tableGroup).toBeTruthy();
      expect(tableGroup.expanded).toBe(true);
    });

    it('handles getSchemas failure', async () => {
      adapter.getSchemas.mockRejectedValue(new Error('fail'));
      await model.init();
      // Still builds tree without schemas
      expect(model.root).not.toBeNull();
    });

    it('handles getTables failure', async () => {
      adapter.getTables.mockRejectedValue(new Error('fail'));
      await model.init();
      expect(model.root).not.toBeNull();
    });

    it('handles getUsers failure', async () => {
      adapter.getUsers.mockRejectedValue(new Error('fail'));
      await model.init();
      expect(model.root).not.toBeNull();
    });
  });

  describe('moveUp / moveDown', () => {
    it('moves cursor down', async () => {
      await model.init();
      const start = model.cursor;
      model.moveDown();
      expect(model.cursor).toBe(start + 1);
    });

    it('does not move past the end', async () => {
      await model.init();
      const max = model.flatList.length - 1;
      model.cursor = max;
      model.moveDown();
      expect(model.cursor).toBe(max);
    });

    it('moves cursor up', async () => {
      await model.init();
      model.cursor = 2;
      model.moveUp();
      expect(model.cursor).toBe(1);
    });

    it('does not move before 0', async () => {
      await model.init();
      model.cursor = 0;
      model.moveUp();
      expect(model.cursor).toBe(0);
    });
  });

  describe('selected', () => {
    it('returns current node', async () => {
      await model.init();
      const node = model.selected;
      expect(node).toBe(model.flatList[model.cursor]);
    });

    it('returns null for empty flatList', () => {
      expect(model.selected).toBe(null);
    });
  });

  describe('expandNode', () => {
    it('expands a collapsed node', async () => {
      await model.init();
      const other = model.root.children.find(c => c.data.database === 'other');
      expect(other.expanded).toBe(false);
      // Mark it so it doesn't need switch
      other.data.needsSwitch = false;
      other.loaded = true;
      await model.expandNode(other);
      expect(other.expanded).toBe(true);
    });

    it('does nothing for leaf nodes', async () => {
      await model.init();
      const table = new TreeNode('t', NodeType.TABLE, { table: 't' });
      await model.expandNode(table);
      expect(table.expanded).toBe(false); // leaf stays unchanged
    });

    it('loads schema children on expand', async () => {
      await model.init();
      const mydb = model.root.children.find(c => c.data.database === 'mydb');
      const schemaGroup = mydb.children.find(c => c.type === NodeType.SCHEMA_GROUP);
      const privateSchema = schemaGroup.children.find(c => c.data.schema === 'private');
      expect(privateSchema.loaded).toBe(false);
      await model.expandNode(privateSchema);
      expect(privateSchema.loaded).toBe(true);
    });
  });

  describe('collapseNode', () => {
    it('collapses an expanded node', async () => {
      await model.init();
      const mydb = model.root.children.find(c => c.data.database === 'mydb');
      expect(mydb.expanded).toBe(true);
      model.collapseNode(mydb);
      expect(mydb.expanded).toBe(false);
    });

    it('does not collapse leaf nodes', async () => {
      await model.init();
      const table = new TreeNode('t', NodeType.TABLE);
      model.collapseNode(table);
      // no error
    });

    it('does not collapse SERVER node', async () => {
      await model.init();
      model.collapseNode(model.root);
      expect(model.root.expanded).toBe(true);
    });

    it('moves cursor up if it was on a child of collapsed node', async () => {
      await model.init();
      const mydb = model.root.children.find(c => c.data.database === 'mydb');
      // Move cursor to a child of mydb
      const childIdx = model.flatList.findIndex(n => n.parent === mydb || (n.parent && n.parent.parent === mydb));
      if (childIdx >= 0) {
        model.cursor = childIdx;
        model.collapseNode(mydb);
        // After collapse, cursor should be within valid range
        expect(model.cursor).toBeGreaterThanOrEqual(0);
        expect(model.cursor).toBeLessThan(model.flatList.length);
      }
    });

    it('clamps cursor if it exceeds flatList length', async () => {
      await model.init();
      model.cursor = model.flatList.length - 1;
      const mydb = model.root.children.find(c => c.data.database === 'mydb');
      model.collapseNode(mydb);
      expect(model.cursor).toBeLessThanOrEqual(model.flatList.length - 1);
    });
  });

  describe('_switchDatabase', () => {
    it('reconnects adapter to new database (params config)', async () => {
      await model.init();
      const other = model.root.children.find(c => c.data.database === 'other');
      other.data.needsSwitch = true;
      other.loaded = false;
      other.children = [];

      await model._switchDatabase(other);

      expect(mockNewAdapter.connect).toHaveBeenCalledWith(
        expect.objectContaining({ database: 'other' })
      );
      expect(adapter.disconnect).toHaveBeenCalled();
      expect(model.adapter).toBe(mockNewAdapter);
      expect(other.data.needsSwitch).toBe(false);
      expect(other.data.switched).toBe(true);
    });

    it('reconnects adapter with URI config', async () => {
      adapter.rawConfig = { type: 'postgres', uri: 'postgresql://u:p@localhost:5432/mydb' };
      await model.init();
      const other = model.root.children.find(c => c.data.database === 'other');
      other.data.needsSwitch = true;
      other.loaded = false;
      other.children = [];
      mockNewAdapter.connect.mockClear();

      await model._switchDatabase(other);

      expect(mockNewAdapter.connect).toHaveBeenCalledWith(
        expect.objectContaining({ uri: expect.stringContaining('other') })
      );
    });

    it('handles invalid URI with fallback regex', async () => {
      adapter.rawConfig = { type: 'postgres', uri: 'not-a-valid-url/mydb' };
      await model.init();
      const other = model.root.children.find(c => c.data.database === 'other');
      other.data.needsSwitch = true;
      other.loaded = false;
      other.children = [];
      mockNewAdapter.connect.mockClear();

      await model._switchDatabase(other);

      expect(mockNewAdapter.connect).toHaveBeenCalledWith(
        expect.objectContaining({ uri: expect.stringContaining('other') })
      );
    });

    it('expandNode triggers _switchDatabase for needsSwitch node', async () => {
      await model.init();
      const other = model.root.children.find(c => c.data.database === 'other');
      other.data.needsSwitch = true;
      other.loaded = false;
      other.children = [];
      mockNewAdapter.connect.mockClear();

      await model.expandNode(other);

      expect(mockNewAdapter.connect).toHaveBeenCalled();
      expect(other.expanded).toBe(true);
    });
  });

  describe('_loadDbChildren', () => {
    it('marks node as loaded and adds children', async () => {
      await model.init();
      const mydb = model.root.children.find(c => c.data.database === 'mydb');
      expect(mydb.loaded).toBe(true);
      expect(mydb.children.length).toBeGreaterThan(0);
    });

    it('skips if already loaded', async () => {
      await model.init();
      const mydb = model.root.children.find(c => c.data.database === 'mydb');
      const childCount = mydb.children.length;
      adapter.getSchemas.mockClear();
      await model._loadDbChildren(mydb);
      expect(mydb.children.length).toBe(childCount);
      expect(adapter.getSchemas).not.toHaveBeenCalled();
    });

    it('marks non-current db as needsSwitch', async () => {
      await model.init();
      const other = model.root.children.find(c => c.data.database === 'other');
      other.loaded = false;
      other.children = [];
      await model._loadDbChildren(other);
      expect(other.data.needsSwitch).toBe(true);
    });
  });

  describe('_loadTablesForSchema', () => {
    it('loads tables into schema node', async () => {
      await model.init();
      const mydb = model.root.children.find(c => c.data.database === 'mydb');
      const schemaGroup = mydb.children.find(c => c.type === NodeType.SCHEMA_GROUP);
      const privateSchema = schemaGroup.children.find(c => c.data.schema === 'private');

      expect(privateSchema.loaded).toBe(false);
      await model._loadTablesForSchema(privateSchema, 'private');
      expect(privateSchema.loaded).toBe(true);

      const tableGroup = privateSchema.children.find(c => c.type === NodeType.TABLE_GROUP);
      expect(tableGroup).toBeTruthy();
      expect(tableGroup.children.length).toBe(2); // users, posts
    });

    it('skips if already loaded', async () => {
      await model.init();
      const mydb = model.root.children.find(c => c.data.database === 'mydb');
      const schemaGroup = mydb.children.find(c => c.type === NodeType.SCHEMA_GROUP);
      const publicSchema = schemaGroup.children.find(c => c.data.schema === 'public');
      // public is already loaded in init
      adapter.getTables.mockClear();
      await model._loadTablesForSchema(publicSchema, 'public');
      expect(adapter.getTables).not.toHaveBeenCalled();
    });
  });

  describe('renderLines', () => {
    it('returns array of styled lines', async () => {
      await model.init();
      const lines = model.renderLines(80);
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.length).toBeGreaterThan(0);
    });

    it('handles empty tree', () => {
      model.root = new TreeNode('root', NodeType.SERVER);
      model.root.expanded = false;
      model._rebuildFlat();
      const lines = model.renderLines(80);
      expect(lines).toEqual([]);
    });
  });

  describe('_renderChild', () => {
    it('renders different node types with correct icons', async () => {
      await model.init();
      const lines = model.renderLines(80);
      // We can't assert exact formatting (chalk), but we can check lines exist
      expect(lines.length).toBeGreaterThan(0);
    });
  });

  describe('_rebuildFlat', () => {
    it('rebuilds flat list from expanded nodes', async () => {
      await model.init();
      const count = model.flatList.length;
      expect(count).toBeGreaterThan(0);

      // Collapse all databases
      for (const child of model.root.children) {
        child.expanded = false;
      }
      model._rebuildFlat();
      // Only database nodes should be in the flat list
      expect(model.flatList.length).toBe(2); // mydb, other
    });
  });
});
