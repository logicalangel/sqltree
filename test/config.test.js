import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// We need to mock the CONFIG_DIR/CONFIG_FILE before importing config.js
// Use vi.mock to intercept 'os' homedir so config.js points at our temp dir
let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'sqltree-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// Since config.js uses homedir() at module scope, we need to mock it
// We'll re-import config.js each time with a fresh mock
async function loadModule() {
  vi.resetModules();
  vi.doMock('os', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, homedir: () => tempDir };
  });
  return import('../src/config.js');
}

describe('loadConnections', () => {
  it('returns empty array when config file does not exist', async () => {
    const { loadConnections } = await loadModule();
    expect(loadConnections()).toEqual([]);
  });

  it('returns empty array when config file has invalid JSON', async () => {
    const { mkdirSync, writeFileSync } = await import('fs');
    mkdirSync(join(tempDir, '.sqltree'), { recursive: true });
    writeFileSync(join(tempDir, '.sqltree', 'connections.json'), 'not-json');
    const { loadConnections } = await loadModule();
    expect(loadConnections()).toEqual([]);
  });

  it('returns parsed connections from file', async () => {
    const { mkdirSync, writeFileSync } = await import('fs');
    const data = [{ name: 'test', host: 'localhost' }];
    mkdirSync(join(tempDir, '.sqltree'), { recursive: true });
    writeFileSync(join(tempDir, '.sqltree', 'connections.json'), JSON.stringify(data));
    const { loadConnections } = await loadModule();
    expect(loadConnections()).toEqual(data);
  });
});

describe('saveConnection', () => {
  it('creates config dir and saves new connection', async () => {
    const { saveConnection, loadConnections } = await loadModule();
    saveConnection('myconn', { host: 'localhost', port: 5432 });
    const conns = loadConnections();
    expect(conns).toHaveLength(1);
    expect(conns[0].name).toBe('myconn');
    expect(conns[0].host).toBe('localhost');
  });

  it('updates an existing connection by name', async () => {
    const { saveConnection, loadConnections } = await loadModule();
    saveConnection('myconn', { host: 'localhost', port: 5432 });
    saveConnection('myconn', { host: '127.0.0.1', port: 5433 });
    const conns = loadConnections();
    expect(conns).toHaveLength(1);
    expect(conns[0].host).toBe('127.0.0.1');
    expect(conns[0].port).toBe(5433);
  });

  it('appends a second connection', async () => {
    const { saveConnection, loadConnections } = await loadModule();
    saveConnection('first', { host: 'h1' });
    saveConnection('second', { host: 'h2' });
    const conns = loadConnections();
    expect(conns).toHaveLength(2);
  });

  it('writes file with mode 0o600', async () => {
    const { saveConnection } = await loadModule();
    const { statSync } = await import('fs');
    saveConnection('secure', { host: 'localhost' });
    const filePath = join(tempDir, '.sqltree', 'connections.json');
    const stat = statSync(filePath);
    // On Unix, check file mode (lower 9 bits)
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe('deleteConnection', () => {
  it('removes the connection by name', async () => {
    const { saveConnection, deleteConnection, loadConnections } = await loadModule();
    saveConnection('keep', { host: 'h1' });
    saveConnection('remove', { host: 'h2' });
    deleteConnection('remove');
    const conns = loadConnections();
    expect(conns).toHaveLength(1);
    expect(conns[0].name).toBe('keep');
  });

  it('handles deleting a non-existent name gracefully', async () => {
    const { saveConnection, deleteConnection, loadConnections } = await loadModule();
    saveConnection('keep', { host: 'h1' });
    deleteConnection('nonexistent');
    const conns = loadConnections();
    expect(conns).toHaveLength(1);
  });
});
