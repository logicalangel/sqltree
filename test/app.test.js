import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all side-effectful modules
vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock('../src/ui.js', () => ({
  printBanner: vi.fn(),
}));

vi.mock('../src/tui.js', () => ({
  startTui: vi.fn(),
}));

vi.mock('../src/config.js', () => ({
  loadConnections: vi.fn(() => []),
}));

const mockAdapter = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  connectionInfo: { type: 'postgres', host: 'localhost', port: '5432', database: 'test', user: 'u' },
};

vi.mock('../src/adapters/index.js', () => ({
  createAdapter: vi.fn(() => mockAdapter),
}));

import { run } from '../src/app.js';
import { printBanner } from '../src/ui.js';
import { startTui } from '../src/tui.js';
import { createAdapter } from '../src/adapters/index.js';
import { loadConnections } from '../src/config.js';
import { select, input, password } from '@inquirer/prompts';

describe('app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent process.exit from actually exiting
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  describe('run with --help', () => {
    it('prints usage and exits', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await expect(run(['--help'])).rejects.toThrow('process.exit');
      expect(process.exit).toHaveBeenCalledWith(0);
      expect(spy.mock.calls.some(c => String(c[0]).includes('sqltree'))).toBe(true);
      spy.mockRestore();
    });
  });

  describe('run with --version', () => {
    it('prints version and exits', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await expect(run(['-v'])).rejects.toThrow('process.exit');
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });
  });

  describe('run with --uri', () => {
    it('connects via postgres URI and starts TUI', async () => {
      await run(['--uri', 'postgresql://user:pass@localhost:5432/mydb']);
      expect(printBanner).toHaveBeenCalled();
      expect(createAdapter).toHaveBeenCalledWith('postgres');
      expect(mockAdapter.connect).toHaveBeenCalledWith({ uri: 'postgresql://user:pass@localhost:5432/mydb' });
      expect(startTui).toHaveBeenCalledWith(mockAdapter);
    });

    it('connects via mysql URI', async () => {
      await run(['-u', 'mysql://root:pass@localhost:3306/db']);
      expect(createAdapter).toHaveBeenCalledWith('mysql');
    });

    it('throws on unrecognized URI scheme', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(run(['--uri', 'sqlite:///test.db'])).rejects.toThrow('process.exit');
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });

  describe('run with individual params', () => {
    it('connects with --type and --host', async () => {
      await run(['--type', 'postgres', '--host', 'dbhost', '--port', '5433',
                  '--user', 'admin', '--password', 'secret', '--database', 'prod']);
      expect(createAdapter).toHaveBeenCalledWith('postgres');
      expect(mockAdapter.connect).toHaveBeenCalledWith({
        host: 'dbhost',
        port: 5433,
        user: 'admin',
        password: 'secret',
        database: 'prod',
      });
    });

    it('uses short flags', async () => {
      await run(['-t', 'mysql', '-H', 'h', '-p', '3307', '-U', 'u', '-W', 'p', '-d', 'db']);
      expect(createAdapter).toHaveBeenCalledWith('mysql');
    });

    it('defaults to postgres when only --host is given', async () => {
      await run(['--host', 'somehost']);
      expect(createAdapter).toHaveBeenCalledWith('postgres');
    });
  });

  describe('run interactive mode', () => {
    it('prompts for new connection and starts TUI', async () => {
      select.mockResolvedValueOnce('new'); // action
      select.mockResolvedValueOnce('postgres'); // db type
      select.mockResolvedValueOnce('params'); // method
      input.mockResolvedValueOnce('localhost'); // host
      input.mockResolvedValueOnce('5432'); // port
      input.mockResolvedValueOnce('postgres'); // user
      password.mockResolvedValueOnce('pass'); // password
      input.mockResolvedValueOnce('mydb'); // database

      await run([]);
      expect(printBanner).toHaveBeenCalled();
      expect(startTui).toHaveBeenCalledWith(mockAdapter);
    });

    it('prompts for URI connection', async () => {
      select.mockResolvedValueOnce('new');
      select.mockResolvedValueOnce('postgres');
      select.mockResolvedValueOnce('uri');
      input.mockResolvedValueOnce('postgresql://u:p@h:5432/db');
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await run([]);
      expect(startTui).toHaveBeenCalledWith(mockAdapter);
      spy.mockRestore();
    });

    it('URI validate rejects empty input', async () => {
      select.mockResolvedValueOnce('new');
      select.mockResolvedValueOnce('postgres');
      select.mockResolvedValueOnce('uri');
      input.mockImplementation((opts) => {
        // Exercise the validate function
        if (opts.validate) {
          expect(opts.validate('')).toBe('URI is required');
          expect(opts.validate('  ')).toBe('URI is required');
          expect(opts.validate('pg://x')).toBe(true);
        }
        return Promise.resolve('postgresql://u:p@h:5432/db');
      });
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await run([]);
      expect(startTui).toHaveBeenCalledWith(mockAdapter);
      spy.mockRestore();
    });

    it('database validate rejects empty input', async () => {
      select.mockResolvedValueOnce('new');
      select.mockResolvedValueOnce('postgres');
      select.mockResolvedValueOnce('params');
      let callCount = 0;
      input.mockImplementation((opts) => {
        callCount++;
        // The 5th input call is the database prompt
        if (opts.validate) {
          expect(opts.validate('')).not.toBe(true);
          expect(opts.validate('mydb')).toBe(true);
        }
        if (callCount === 1) return Promise.resolve('localhost');
        if (callCount === 2) return Promise.resolve('5432');
        if (callCount === 3) return Promise.resolve('postgres');
        return Promise.resolve('mydb');
      });
      password.mockResolvedValueOnce('pass');

      await run([]);
      expect(startTui).toHaveBeenCalledWith(mockAdapter);
    });

    it('shows saved connections when available', async () => {
      loadConnections.mockReturnValue([
        { name: 'prod', type: 'postgres', host: 'h', port: '5432', database: 'db' },
      ]);
      select.mockResolvedValueOnce('saved'); // action
      select.mockResolvedValueOnce('prod'); // select connection

      await run([]);
      expect(startTui).toHaveBeenCalledWith(mockAdapter);
    });

    it('connects from saved connection with URI', async () => {
      loadConnections.mockReturnValue([
        { name: 'prod', type: 'postgres', uri: 'postgresql://u:p@h:5432/db' },
      ]);
      select.mockResolvedValueOnce('saved');
      select.mockResolvedValueOnce('prod');

      await run([]);
      expect(createAdapter).toHaveBeenCalledWith('postgres');
    });

    it('handles connection error gracefully', async () => {
      mockAdapter.connect.mockRejectedValueOnce(new Error('Connection refused'));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(
        run(['--uri', 'postgresql://u:p@bad:5432/db'])
      ).rejects.toThrow('process.exit');
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });

    it('handles mariadb URI', async () => {
      await run(['--uri', 'mariadb://root:pass@localhost:3306/db']);
      expect(createAdapter).toHaveBeenCalledWith('mysql');
    });

    it('interactive mysql type uses mysql defaults', async () => {
      select.mockResolvedValueOnce('new');
      select.mockResolvedValueOnce('mysql');
      select.mockResolvedValueOnce('params');
      input.mockResolvedValueOnce('localhost');
      input.mockResolvedValueOnce('3306');
      input.mockResolvedValueOnce('root');
      password.mockResolvedValueOnce('pass');
      input.mockResolvedValueOnce('mydb');

      await run([]);
      expect(createAdapter).toHaveBeenCalledWith('mysql');
    });

    it('interactive mysql URI uses correct placeholder', async () => {
      select.mockResolvedValueOnce('new');
      select.mockResolvedValueOnce('mysql');
      select.mockResolvedValueOnce('uri');
      input.mockResolvedValueOnce('mysql://u:p@h:3306/db');
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await run([]);
      expect(startTui).toHaveBeenCalledWith(mockAdapter);
      spy.mockRestore();
    });

    it('connects from saved connection without URI', async () => {
      loadConnections.mockReturnValue([
        { name: 'local', type: 'mysql', host: 'h', port: 3306, database: 'db', user: 'root' },
      ]);
      select.mockResolvedValueOnce('saved');
      select.mockResolvedValueOnce('local');

      await run([]);
      expect(createAdapter).toHaveBeenCalledWith('mysql');
    });
  });
});
