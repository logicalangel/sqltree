import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture key handlers registered via screen.key
const keyHandlers = {};
const mockScreen = {
  key: vi.fn((keys, handler) => {
    for (const k of keys) keyHandlers[k] = handler;
  }),
  unkey: vi.fn(),
  render: vi.fn(),
  destroy: vi.fn(),
};

const mockBox = () => ({
  setContent: vi.fn(),
  setScroll: vi.fn(),
  hide: vi.fn(),
  show: vi.fn(),
  getScroll: vi.fn(() => 0),
  scroll: vi.fn(),
  height: 20,
  width: 80,
});

const boxes = [];
vi.mock('neo-blessed', () => ({
  default: {
    screen: vi.fn(() => mockScreen),
    box: vi.fn(() => {
      const b = mockBox();
      boxes.push(b);
      return b;
    }),
  },
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, writeFileSync: vi.fn() };
});

// Mock readline for enterReplMode tests
const { mockRl, rlHandlers } = vi.hoisted(() => {
  const rlHandlers = {};
  const mockRl = {
    prompt: vi.fn(),
    on: vi.fn((event, handler) => { rlHandlers[event] = handler; return mockRl; }),
    close: vi.fn(() => { if (rlHandlers['close']) rlHandlers['close'](); }),
    setPrompt: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  return { mockRl, rlHandlers };
});

vi.mock('readline', () => ({
  createInterface: vi.fn(() => mockRl),
}));

vi.mock('../src/config.js', () => ({
  saveConnection: vi.fn(),
}));

import {
  startTui,
  esc,
  formatDuration,
  formatDetailHeader,
  countLeaves,
  collectTableNames,
  formatCellConsole,
  renderResultContent,
  displayResultConsole,
} from '../src/tui.js';
import { TreeNode, NodeType } from '../src/tree.js';

// ── Pure Helper Tests ───────────────────────────────────────

describe('esc', () => {
  it('escapes curly braces', () => {
    expect(esc('{bold}')).toBe('\\{bold\\}');
  });

  it('handles strings without braces', () => {
    expect(esc('hello')).toBe('hello');
  });

  it('converts non-string values', () => {
    expect(esc(42)).toBe('42');
    expect(esc(null)).toBe('null');
  });
});

describe('formatDuration', () => {
  it('returns <1ms for durations under 1ms', () => {
    expect(formatDuration(0.5)).toBe('<1ms');
  });

  it('formats milliseconds', () => {
    expect(formatDuration(42.3)).toBe('42.3ms');
  });

  it('formats seconds for 1000ms+', () => {
    expect(formatDuration(1500)).toBe('1.50s');
  });

  it('handles exactly 1ms', () => {
    expect(formatDuration(1)).toBe('1.0ms');
  });

  it('handles exactly 1000ms', () => {
    expect(formatDuration(1000)).toBe('1.00s');
  });
});

describe('formatDetailHeader', () => {
  it('creates formatted header', () => {
    const result = formatDetailHeader('My Title');
    expect(result).toContain('My Title');
    expect(result).toContain('─');
  });

  it('escapes braces in title', () => {
    const result = formatDetailHeader('{test}');
    expect(result).toContain('\\{test\\}');
  });
});

describe('countLeaves', () => {
  it('counts leaves of specific type', () => {
    const root = new TreeNode('root', NodeType.DATABASE, { database: 'db' });
    const tg = root.addChild(new TreeNode('Tables', NodeType.TABLE_GROUP));
    tg.addChild(new TreeNode('a', NodeType.TABLE, { table: 'a' }));
    tg.addChild(new TreeNode('b', NodeType.TABLE, { table: 'b' }));
    root.addChild(new TreeNode('admin', NodeType.ROLE, { role: 'admin' }));

    expect(countLeaves(root, NodeType.TABLE)).toBe(2);
    expect(countLeaves(root, NodeType.ROLE)).toBe(1);
    expect(countLeaves(root, NodeType.SCHEMA)).toBe(0);
  });
});

describe('collectTableNames', () => {
  it('collects table names recursively', () => {
    const root = new TreeNode('root', NodeType.SERVER);
    const db = root.addChild(new TreeNode('db', NodeType.DATABASE, { database: 'db' }));
    const tg = db.addChild(new TreeNode('Tables', NodeType.TABLE_GROUP));
    tg.addChild(new TreeNode('users', NodeType.TABLE, { table: 'users' }));
    tg.addChild(new TreeNode('posts', NodeType.TABLE, { table: 'posts' }));

    const names = collectTableNames(root);
    expect(names).toEqual(['users', 'posts']);
  });

  it('returns empty array for node with no tables', () => {
    const root = new TreeNode('root', NodeType.SERVER);
    const names = collectTableNames(root);
    expect(names).toEqual([]);
  });
});

describe('formatCellConsole', () => {
  it('returns NULL for null', () => {
    const result = formatCellConsole(null);
    expect(result).toContain('NULL');
  });

  it('returns NULL for undefined', () => {
    const result = formatCellConsole(undefined);
    expect(result).toContain('NULL');
  });

  it('formats boolean true', () => {
    const result = formatCellConsole(true);
    expect(result).toContain('true');
  });

  it('formats boolean false', () => {
    const result = formatCellConsole(false);
    expect(result).toContain('false');
  });

  it('formats Date', () => {
    const d = new Date('2024-01-01T00:00:00.000Z');
    const result = formatCellConsole(d);
    expect(result).toContain('2024-01-01');
  });

  it('formats objects as JSON', () => {
    const result = formatCellConsole({ a: 1 });
    expect(result).toContain('{"a":1}');
  });

  it('converts numbers to string', () => {
    const result = formatCellConsole(42);
    expect(result).toBe('42');
  });

  it('passes through strings', () => {
    const result = formatCellConsole('hello');
    expect(result).toBe('hello');
  });
});

describe('formatDuration (edge cases)', () => {
  it('handles 999ms', () => {
    expect(formatDuration(999)).toBe('999.0ms');
  });

  it('handles very large duration', () => {
    expect(formatDuration(60000)).toBe('60.00s');
  });
});

describe('renderResultContent', () => {
  it('renders empty result', () => {
    const result = renderResultContent({ rows: [], rowCount: 0 });
    expect(result).toContain('(0 rows)');
  });

  it('renders result with null rows', () => {
    const result = renderResultContent({ rows: null, rowCount: 0 });
    expect(result).toContain('(0 rows)');
  });

  it('renders result with data', () => {
    const result = renderResultContent({
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Alice' }],
      rowCount: 1,
      time: 5.2,
    });
    expect(result).toContain('id');
    expect(result).toContain('name');
    expect(result).toContain('1 row');
  });

  it('handles null values in rows', () => {
    const result = renderResultContent({
      columns: ['val'],
      rows: [{ val: null }],
      rowCount: 1,
    });
    expect(result).toContain('NULL');
  });

  it('handles boolean values', () => {
    const result = renderResultContent({
      columns: ['active'],
      rows: [{ active: true }, { active: false }],
      rowCount: 2,
    });
    expect(result).toContain('true');
    expect(result).toContain('false');
  });

  it('truncates long values', () => {
    const longVal = 'x'.repeat(50);
    const result = renderResultContent({
      columns: ['val'],
      rows: [{ val: longVal }],
      rowCount: 1,
    });
    expect(result).toContain('…');
  });

  it('falls back to Object.keys when columns is missing', () => {
    const result = renderResultContent({
      rows: [{ col1: 'a', col2: 'b' }],
      rowCount: 1,
    });
    expect(result).toContain('col1');
    expect(result).toContain('col2');
  });

  it('handles undefined rowCount', () => {
    const result = renderResultContent({
      columns: ['x'],
      rows: [{ x: 1 }],
    });
    expect(result).toContain('1 row');
  });

  it('shows plural rows', () => {
    const result = renderResultContent({
      columns: ['x'],
      rows: [{ x: 1 }, { x: 2 }],
      rowCount: 2,
      time: 1.5,
    });
    expect(result).toContain('2 rows');
  });

  it('omits time when not provided', () => {
    const result = renderResultContent({
      columns: ['x'],
      rows: [{ x: 1 }],
      rowCount: 1,
    });
    // Should not contain duration formatting
    expect(result).not.toContain('ms');
  });

  it('uses record layout for wide tables', () => {
    const result = renderResultContent({
      columns: ['col1', 'col2', 'col3', 'col4', 'col5', 'col6', 'col7', 'col8'],
      rows: [{ col1: 'a', col2: 'b', col3: 'c', col4: 'd', col5: 'e', col6: 'f', col7: 'g', col8: 'h' }],
      rowCount: 1,
    }, 40);
    expect(result).toContain('Record 1');
    expect(result).toContain('col1');
    expect(result).toContain('│');
  });

  it('uses table layout when columns fit', () => {
    const result = renderResultContent({
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Alice' }],
      rowCount: 1,
    }, 80);
    expect(result).not.toContain('Record');
    expect(result).toContain('id');
    expect(result).toContain('─┼─');
  });
});

describe('displayResultConsole', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('displays rows in table format', () => {
    displayResultConsole({
      type: 'rows',
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Alice' }],
      rowCount: 1,
      time: 3.2,
    });
    expect(console.log).toHaveBeenCalled();
  });

  it('displays empty rows message', () => {
    displayResultConsole({
      type: 'rows',
      columns: ['id'],
      rows: [],
      rowCount: 0,
      time: 1.0,
    });
    const calls = console.log.mock.calls.flat().join(' ');
    expect(calls).toContain('(0 rows)');
  });

  it('displays command result', () => {
    displayResultConsole({
      type: 'command',
      command: 'INSERT',
      rowCount: 3,
      time: 2.0,
    });
    const calls = console.log.mock.calls.flat().join(' ');
    expect(calls).toContain('INSERT');
  });

  it('handles command with null rowCount', () => {
    displayResultConsole({
      type: 'command',
      command: 'CREATE',
      rowCount: null,
      time: 1.0,
    });
    const calls = console.log.mock.calls.flat().join(' ');
    expect(calls).toContain('CREATE');
  });

  it('handles null cell values in table display', () => {
    displayResultConsole({
      type: 'rows',
      columns: ['val'],
      rows: [{ val: null }],
      rowCount: 1,
      time: 1.0,
    });
    expect(console.log).toHaveBeenCalled();
  });

  it('truncates long values in table display', () => {
    displayResultConsole({
      type: 'rows',
      columns: ['val'],
      rows: [{ val: 'x'.repeat(100) }],
      rowCount: 1,
      time: 1.0,
    });
    expect(console.log).toHaveBeenCalled();
  });

  it('displays singular row count', () => {
    displayResultConsole({
      type: 'rows',
      columns: ['id'],
      rows: [{ id: 1 }],
      rowCount: 1,
      time: 1.0,
    });
    const calls = console.log.mock.calls.flat().join(' ');
    expect(calls).toContain('1 row');
  });

  it('handles command with 1 affected row (singular)', () => {
    displayResultConsole({
      type: 'command',
      command: 'DELETE',
      rowCount: 1,
      time: 1.0,
    });
    const calls = console.log.mock.calls.flat().join(' ');
    expect(calls).toContain('1 row');
    expect(calls).not.toContain('1 rows');
  });
});

describe('startTui', () => {
  let mockAdapter;

  beforeEach(() => {
    // Reset key handlers and boxes
    Object.keys(keyHandlers).forEach(k => delete keyHandlers[k]);
    boxes.length = 0;
    vi.clearAllMocks();

    mockAdapter = {
      connectionInfo: {
        type: 'postgres',
        host: 'localhost',
        port: '5432',
        database: 'mydb',
        user: 'testuser',
      },
      rawConfig: { type: 'postgres', host: 'localhost', port: 5432, database: 'mydb' },
      getDatabases: vi.fn().mockResolvedValue({
        type: 'rows', columns: ['name'],
        rows: [{ name: 'mydb' }, { name: 'other' }],
        rowCount: 2,
      }),
      getSchemas: vi.fn().mockResolvedValue({
        type: 'rows', columns: ['name'],
        rows: [{ name: 'public' }],
        rowCount: 1,
      }),
      getTables: vi.fn().mockResolvedValue({
        type: 'rows', columns: ['name'],
        rows: [{ name: 'users' }],
        rowCount: 1,
      }),
      getUsers: vi.fn().mockResolvedValue({
        type: 'rows', columns: ['User'],
        rows: [{ User: 'admin' }],
        rowCount: 1,
      }),
      disconnect: vi.fn(),
      connect: vi.fn(),
      query: vi.fn().mockResolvedValue({
        type: 'rows', columns: ['id', 'name'],
        rows: [{ id: 1, name: 'Alice' }],
        rowCount: 1, time: 5,
      }),
      describeTable: vi.fn().mockResolvedValue({
        type: 'rows', columns: ['Column', 'Type'],
        rows: [{ Column: 'id', Type: 'int' }],
        rowCount: 1, time: 2,
      }),
      quoteIdentifier: vi.fn((n) => `"${n}"`),
    };
  });

  it('initializes tree model and creates screen', async () => {
    await startTui(mockAdapter);
    expect(mockAdapter.getDatabases).toHaveBeenCalled();
    expect(mockScreen.key).toHaveBeenCalled();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('registers up/down/left/right/tab/e/s/r/d/pageup/pagedown keys', async () => {
    await startTui(mockAdapter);
    expect(keyHandlers['up']).toBeDefined();
    expect(keyHandlers['down']).toBeDefined();
    expect(keyHandlers['left']).toBeDefined();
    expect(keyHandlers['right']).toBeDefined();
    expect(keyHandlers['tab']).toBeDefined();
    expect(keyHandlers['e']).toBeDefined();
    expect(keyHandlers['r']).toBeDefined();
    expect(keyHandlers['d']).toBeDefined();
    expect(keyHandlers['pageup']).toBeDefined();
    expect(keyHandlers['pagedown']).toBeDefined();
  });

  it('up/down keys navigate tree', async () => {
    await startTui(mockAdapter);
    keyHandlers['down']();
    keyHandlers['up']();
    // No error means the handlers ran correctly
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('right key expands non-leaf node', async () => {
    await startTui(mockAdapter);
    // Navigate down to a non-leaf node and expand
    await keyHandlers['right']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('right key on table node shows table detail', async () => {
    await startTui(mockAdapter);
    // flatList: mydb(0) Schemas(1) public(2) Tables(3) users(4) Roles(5) other(6)
    for (let i = 0; i < 4; i++) keyHandlers['down']();
    await keyHandlers['right']();
    expect(mockAdapter.query).toHaveBeenCalled();
  });

  it('right key on role node shows role detail', async () => {
    await startTui(mockAdapter);
    // Navigate to Roles group (5), expand it, then down to admin
    for (let i = 0; i < 5; i++) keyHandlers['down']();
    await keyHandlers['right'](); // expand role group
    keyHandlers['down'](); // move to admin
    await keyHandlers['right'](); // show role detail
    expect(mockAdapter.getUsers).toHaveBeenCalled();
  });

  it('left key collapses expanded node', async () => {
    await startTui(mockAdapter);
    // Navigate to expanded mydb and collapse
    keyHandlers['down']();
    keyHandlers['left']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('left key on leaf navigates to parent', async () => {
    await startTui(mockAdapter);
    // Navigate to a leaf (users table)
    for (let i = 0; i < 5; i++) keyHandlers['down']();
    keyHandlers['left']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('r key refreshes tree', async () => {
    await startTui(mockAdapter);
    await keyHandlers['r']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('right key on table node browses table', async () => {
    await startTui(mockAdapter);
    for (let i = 0; i < 4; i++) keyHandlers['down']();

    mockAdapter.query
      .mockResolvedValueOnce({ type: 'rows', columns: ['total'], rows: [{ total: 50 }], rowCount: 1, time: 1 })
      .mockResolvedValueOnce({ type: 'rows', columns: ['id'], rows: [{ id: 1 }], rowCount: 1, time: 1 });

    await keyHandlers['right']();
    expect(mockAdapter.query).toHaveBeenCalled();
  });

  it('right key — browse empty table', async () => {
    await startTui(mockAdapter);
    for (let i = 0; i < 4; i++) keyHandlers['down']();

    mockAdapter.query.mockResolvedValueOnce({
      type: 'rows', columns: ['total'], rows: [{ total: 0 }], rowCount: 1, time: 1,
    });

    await keyHandlers['right']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('d key on table node describes table', async () => {
    await startTui(mockAdapter);
    for (let i = 0; i < 4; i++) keyHandlers['down']();
    await keyHandlers['d']();
    expect(mockAdapter.describeTable).toHaveBeenCalled();
  });

  it('e key with no lastResult shows error', async () => {
    await startTui(mockAdapter);
    keyHandlers['e']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('e key with lastResult exports CSV', async () => {
    await startTui(mockAdapter);
    // Browse table to set lastResult, then exit browse to export
    for (let i = 0; i < 4; i++) keyHandlers['down']();
    mockAdapter.query
      .mockResolvedValueOnce({ type: 'rows', columns: ['total'], rows: [{ total: 50 }], rowCount: 1, time: 1 })
      .mockResolvedValueOnce({ type: 'rows', columns: ['id'], rows: [{ id: 1 }], rowCount: 1, time: 1 });
    await keyHandlers['right'](); // enter browse, sets lastResult
    keyHandlers['left'](); // exit browse back to tree
    keyHandlers['e']();
    const { writeFileSync } = await import('fs');
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('pageup/pagedown scroll detail', async () => {
    await startTui(mockAdapter);
    keyHandlers['pageup']();
    keyHandlers['pagedown']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('q key disconnects and exits', async () => {
    await startTui(mockAdapter);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {});
    await keyHandlers['q']();
    expect(mockScreen.destroy).toHaveBeenCalled();
    expect(mockAdapter.disconnect).toHaveBeenCalled();
  });

  it('showTableDetail handles query error', async () => {
    await startTui(mockAdapter);
    for (let i = 0; i < 4; i++) keyHandlers['down']();
    mockAdapter.describeTable.mockRejectedValueOnce(new Error('table error'));
    await keyHandlers['right']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('showRoleDetail handles query error', async () => {
    await startTui(mockAdapter);
    // Expand role group first
    for (let i = 0; i < 5; i++) keyHandlers['down']();
    await keyHandlers['right'](); // expand
    keyHandlers['down'](); // admin
    mockAdapter.getUsers.mockRejectedValueOnce(new Error('role error'));
    await keyHandlers['right']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('describeTable handles query error', async () => {
    await startTui(mockAdapter);
    for (let i = 0; i < 4; i++) keyHandlers['down']();
    mockAdapter.describeTable.mockRejectedValueOnce(new Error('describe error'));
    await keyHandlers['d']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('browseTable handles query error', async () => {
    await startTui(mockAdapter);
    for (let i = 0; i < 4; i++) keyHandlers['down']();
    mockAdapter.query.mockRejectedValueOnce(new Error('browse error'));
    await keyHandlers['right']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('refreshDetail shows correct info for database node', async () => {
    await startTui(mockAdapter);
    // Cursor is at server (0), move to mydb (1)
    keyHandlers['down']();
    // refreshDetail is called internally, just verify render was called
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('refreshDetail shows info for non-connected database', async () => {
    await startTui(mockAdapter);
    // flatList: mydb(0) Schemas(1) public(2) Tables(3) users(4) Roles(5) other(6)
    for (let i = 0; i < 6; i++) keyHandlers['down']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('refreshDetail handles schema node', async () => {
    await startTui(mockAdapter);
    // public schema at index 2
    for (let i = 0; i < 2; i++) keyHandlers['down']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('refreshDetail handles table group node', async () => {
    await startTui(mockAdapter);
    // Tables group at index 3
    for (let i = 0; i < 3; i++) keyHandlers['down']();
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('refreshDetail handles role node', async () => {
    await startTui(mockAdapter);
    // Expand role group first, then navigate to admin
    for (let i = 0; i < 5; i++) keyHandlers['down']();
    await keyHandlers['right'](); // expand
    keyHandlers['down'](); // admin
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('d key on non-table is a noop', async () => {
    await startTui(mockAdapter);
    // cursor at server node
    const callsBefore = mockAdapter.describeTable.mock.calls.length;
    await keyHandlers['d']();
    expect(mockAdapter.describeTable.mock.calls.length).toBe(callsBefore);
  });



  it('showRoleDetail finds matching role data', async () => {
    await startTui(mockAdapter);
    mockAdapter.getUsers.mockResolvedValue({
      type: 'rows', columns: ['User', 'Host'],
      rows: [{ User: 'admin', Host: 'localhost' }],
      rowCount: 1,
    });
    for (let i = 0; i < 5; i++) keyHandlers['down']();
    await keyHandlers['right'](); // expand role group
    keyHandlers['down'](); // admin
    await keyHandlers['right'](); // show role detail
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('browse pagination — next page and exit via left', async () => {
    await startTui(mockAdapter);
    for (let i = 0; i < 4; i++) keyHandlers['down']();

    mockAdapter.query
      .mockResolvedValueOnce({ type: 'rows', columns: ['total'], rows: [{ total: 50 }], rowCount: 1, time: 1 })
      .mockResolvedValueOnce({ type: 'rows', columns: ['id'], rows: [{ id: 1 }], rowCount: 1, time: 1 })
      .mockResolvedValueOnce({ type: 'rows', columns: ['id'], rows: [{ id: 2 }], rowCount: 1, time: 1 });

    await keyHandlers['right'](); // enter browse
    await keyHandlers['right'](); // next page (browse handler overrides)
    expect(mockAdapter.query).toHaveBeenCalled();
    keyHandlers['left'](); // back to tree
  });

  it('browse right handler no-op when already on last page', async () => {
    await startTui(mockAdapter);
    for (let i = 0; i < 4; i++) keyHandlers['down']();

    // total=10, pageSize=25 → only 1 page → next does nothing
    mockAdapter.query
      .mockResolvedValueOnce({ type: 'rows', columns: ['total'], rows: [{ total: 10 }], rowCount: 1, time: 1 })
      .mockResolvedValueOnce({ type: 'rows', columns: ['id'], rows: [{ id: 1 }], rowCount: 1, time: 1 });

    await keyHandlers['right'](); // enter browse
    const callsBefore = mockAdapter.query.mock.calls.length;
    await keyHandlers['right'](); // no-op, only 1 page
    expect(mockAdapter.query.mock.calls.length).toBe(callsBefore);
  });



  it('tab key enters REPL mode', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);

    // Reset rl handler tracking
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    mockRl.prompt.mockClear();
    mockRl.on.mockClear();

    keyHandlers['tab']();

    expect(mockScreen.destroy).toHaveBeenCalled();
    expect(mockRl.prompt).toHaveBeenCalled();
    expect(rlHandlers['line']).toBeDefined();
    expect(rlHandlers['SIGINT']).toBeDefined();
    expect(rlHandlers['close']).toBeDefined();
  });

  it('REPL \\back command closes readline', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    await rlHandlers['line']('\\back');
    expect(mockRl.close).toHaveBeenCalled();
  });

  it('REPL \\b command closes readline', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    await rlHandlers['line']('\\b');
    expect(mockRl.close).toHaveBeenCalled();
  });

  it('REPL \\menu command closes readline', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    await rlHandlers['line']('\\menu');
    expect(mockRl.close).toHaveBeenCalled();
  });

  it('REPL \\export with no data shows error', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    await rlHandlers['line']('\\export csv');
    // Should log error about no data
    expect(mockRl.prompt).toHaveBeenCalled();
  });

  it('REPL \\export with data exports file', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);

    // Set lastResult via describe
    for (let i = 0; i < 4; i++) keyHandlers['down']();
    await keyHandlers['d']();

    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    // Now lastResult has rows from describeTable
    // But describeTable sets lastResult = result with type=rows
    // We need result with rows. The mock returns rows with id/name.
    // Actually, the d key sets lastResult to the describeTable result.
    // describeTable mock returns { type: 'rows', columns: ['Column', 'Type'], rows: [{ Column: 'id', Type: 'int' }], rowCount: 1, time: 2 }

    await rlHandlers['line']('\\export csv');
    const { writeFileSync } = await import('fs');
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('REPL \\export json format', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);

    for (let i = 0; i < 4; i++) keyHandlers['down']();
    await keyHandlers['d'](); // sets lastResult

    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    await rlHandlers['line']('\\export json');
    const { writeFileSync } = await import('fs');
    expect(writeFileSync).toHaveBeenCalled();
    // Check that JSON.stringify was used (json content)
    const lastCall = writeFileSync.mock.calls[writeFileSync.mock.calls.length - 1];
    expect(lastCall[0]).toMatch(/\.json$/);
  });

  it('REPL \\save without name shows error', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    await rlHandlers['line']('\\save');
    expect(mockRl.prompt).toHaveBeenCalled();
  });

  it('REPL \\save with name saves connection', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    await rlHandlers['line']('\\save myconn');
    expect(mockRl.prompt).toHaveBeenCalled();
  });

  it('REPL empty line is no-op', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    mockRl.prompt.mockClear();
    await rlHandlers['line']('');
    expect(mockRl.prompt).toHaveBeenCalled();
  });

  it('REPL multi-line SQL accumulates until semicolon', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    mockRl.setPrompt.mockClear();
    // First line without semicolon
    await rlHandlers['line']('SELECT *');
    expect(mockRl.setPrompt).toHaveBeenCalled();

    // Complete with semicolon
    mockAdapter.query.mockResolvedValueOnce({
      type: 'rows', columns: ['id'], rows: [{ id: 1 }], rowCount: 1, time: 5,
    });
    await rlHandlers['line']('FROM users;');
    expect(mockAdapter.query).toHaveBeenCalled();
  });

  it('REPL handles bare semicolon', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    mockRl.prompt.mockClear();
    await rlHandlers['line'](';');
    expect(mockRl.prompt).toHaveBeenCalled();
  });

  it('REPL handles query error', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    mockAdapter.query.mockRejectedValueOnce(new Error('syntax error'));
    await rlHandlers['line']('BAD SQL;');
    expect(console.log).toHaveBeenCalled();
  });

  it('REPL SIGINT with buffer clears buffer', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    // Accumulate some SQL
    await rlHandlers['line']('SELECT *');
    mockRl.setPrompt.mockClear();
    rlHandlers['SIGINT']();
    expect(mockRl.setPrompt).toHaveBeenCalled();
  });

  it('REPL SIGINT without buffer closes rl', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    mockRl.close.mockClear();
    rlHandlers['SIGINT']();
    expect(mockRl.close).toHaveBeenCalled();
  });

  it('REPL close handler returns to tree mode', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    // Trigger close directly
    rlHandlers['close']();
    // Should recreate screen and render
    expect(mockScreen.render).toHaveBeenCalled();
  });

  it('s key also enters REPL mode', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);

    keyHandlers['s']();
    expect(mockScreen.destroy).toHaveBeenCalled();
    expect(mockRl.prompt).toHaveBeenCalled();
  });

  it('REPL completer provides SQL keyword and table completions', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    // Capture completer from createInterface call
    const { createInterface } = await import('readline');
    const config = createInterface.mock.calls[createInterface.mock.calls.length - 1][0];
    const completer = config.completer;

    // Test matching SQL keyword
    const [hits1, word1] = completer('SEL');
    expect(hits1.length).toBeGreaterThan(0);
    expect(word1).toBe('SEL');

    // Test matching table name
    const [hits2, word2] = completer('use');
    expect(hits2.length).toBeGreaterThan(0);
    expect(word2).toBe('use');

    // Test no match
    const [hits3, word3] = completer('zzzzz');
    expect(hits3).toEqual([]);
    expect(word3).toBe('zzzzz');
  });

  it('REPL query execution displays result and sets lastResult', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    mockAdapter.query.mockImplementation(() => {
      // Advance timers so the spinner interval fires at least once
      vi.advanceTimersByTime(100);
      return Promise.resolve({
        type: 'rows', columns: ['id'], rows: [{ id: 1 }], rowCount: 1, time: 5,
      });
    });

    await rlHandlers['line']('SELECT 1;');
    expect(mockAdapter.query).toHaveBeenCalled();
    expect(process.stdout.write).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('REPL query error clears spinner', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => {});
    await startTui(mockAdapter);
    Object.keys(rlHandlers).forEach(k => delete rlHandlers[k]);
    keyHandlers['tab']();

    mockAdapter.query.mockImplementation(() => {
      vi.advanceTimersByTime(100);
      return Promise.reject(new Error('bad query'));
    });

    await rlHandlers['line']('BAD;');
    expect(process.stdout.write).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
