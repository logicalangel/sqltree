import { describe, it, expect, vi, beforeEach } from 'vitest';
import { printBanner, exportCsv } from '../src/ui.js';

describe('printBanner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('prints banner lines to console', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printBanner();
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('sqltree');
  });
});

describe('exportCsv', () => {
  it('generates CSV with header and rows', () => {
    const result = {
      columns: ['id', 'name'],
      rows: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    };
    const csv = exportCsv(result);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,name');
    expect(lines[1]).toBe('1,Alice');
    expect(lines[2]).toBe('2,Bob');
  });

  it('falls back to Object.keys when columns is missing', () => {
    const result = {
      rows: [{ x: 10, y: 20 }],
    };
    const csv = exportCsv(result);
    expect(csv).toBe('x,y\n10,20');
  });

  it('handles null and undefined values as empty strings', () => {
    const result = {
      columns: ['a', 'b'],
      rows: [{ a: null, b: undefined }],
    };
    const csv = exportCsv(result);
    expect(csv).toBe('a,b\n,');
  });

  it('quotes values containing commas', () => {
    const result = {
      columns: ['val'],
      rows: [{ val: 'hello, world' }],
    };
    const csv = exportCsv(result);
    expect(csv).toBe('val\n"hello, world"');
  });

  it('escapes double quotes inside values', () => {
    const result = {
      columns: ['val'],
      rows: [{ val: 'say "hi"' }],
    };
    const csv = exportCsv(result);
    expect(csv).toBe('val\n"say ""hi"""');
  });

  it('quotes values containing newlines', () => {
    const result = {
      columns: ['val'],
      rows: [{ val: 'line1\nline2' }],
    };
    const csv = exportCsv(result);
    expect(csv).toBe('val\n"line1\nline2"');
  });

  it('handles numeric and boolean values', () => {
    const result = {
      columns: ['num', 'bool'],
      rows: [{ num: 42, bool: true }],
    };
    const csv = exportCsv(result);
    expect(csv).toBe('num,bool\n42,true');
  });
});
