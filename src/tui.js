import blessed from 'neo-blessed';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { execFileSync } from 'child_process';
import { TreeModel, NodeType } from './tree.js';
import { exportCsv, exportSql, exportMarkdown } from './ui.js';
import { saveConnection } from './config.js';

// ── State ───────────────────────────────────────────────────

let screen, treeBox, detailBox, statusBar, headerBar;
let tree;              // TreeModel instance
let mode = 'tree';     // 'tree' | 'repl' | 'export'
let lastResult = null;
let pageSize = 25;
let asciiMode = false;
let expanded = false;
let browseCleanup = null;
let keyMap = {};

// SQL keywords for tab completion
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'DROP',
  'ALTER', 'TABLE', 'INDEX', 'VIEW', 'DATABASE', 'SCHEMA', 'JOIN', 'LEFT',
  'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AS', 'ORDER', 'BY',
  'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'COUNT', 'SUM', 'AVG',
  'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'NULL', 'IS',
  'TRUE', 'FALSE', 'EXISTS', 'UNION', 'ALL', 'PRIMARY', 'KEY', 'FOREIGN',
  'REFERENCES', 'DEFAULT', 'CHECK', 'UNIQUE', 'CASCADE', 'TRUNCATE',
  'EXPLAIN', 'ANALYZE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'WITH', 'RETURNING',
];

// ── Default Key Bindings ────────────────────────────────────

export const DEFAULT_KEY_MAP = {
  quit:     ['q', 'C-c'],
  up:       ['up', 'k'],
  down:     ['down', 'j'],
  open:     ['right', 'enter', 'l'],
  back:     ['left', 'h', 'backspace'],
  repl:     ['tab'],
  export:   ['e'],
  refresh:  ['r'],
  describe: ['d'],
  scrollUp: ['w'],
  scrollDn: ['s'],
};

export function buildKeyMap(overrides = {}) {
  const map = {};
  for (const [action, defaults] of Object.entries(DEFAULT_KEY_MAP)) {
    map[action] = overrides[action] || defaults;
  }
  return map;
}

// ── Entry Point ─────────────────────────────────────────────

export async function startTui(adapter, opts = {}) {
  mode = 'tree';
  lastResult = null;
  if (opts.pageSize > 0) pageSize = opts.pageSize;
  asciiMode = !!opts.ascii;
  keyMap = buildKeyMap(opts.keyBindings);
  tree = new TreeModel(adapter, { ascii: asciiMode });

  // Show a spinner while loading tree data
  const spinner = ora({ text: chalk.dim(' Loading database tree...'), spinner: 'dots' }).start();
  await tree.init();
  spinner.succeed(chalk.green(' Connected — launching browser'));

  createScreen();
  refreshTree();
  refreshDetail();
  screen.render();
}

// ── Screen Setup ────────────────────────────────────────────

function createScreen() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  if (cols < 60 || rows < 10) {
    console.error(`Terminal too small (${cols}x${rows}). Minimum 60x10 required.`);
    process.exit(1);
  }

  screen = blessed.screen({
    smartCSR: true,
    title: 'sqltree',
  });

  // neo-blessed's first initialization enables Node's internal keypress module,
  // which adds a duplicate 'data' listener on stdin causing double key events.
  // Keep only blessed's own program listener.
  while (process.stdin.listenerCount('data') > 1) {
    const listeners = process.stdin.rawListeners('data');
    process.stdin.removeListener('data', listeners[0]);
  }

  // Header
  headerBar = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '',
    style: { fg: 'black', bg: 'cyan', bold: true },
    tags: true,
  });
  updateHeader();

  // Left pane — Tree
  treeBox = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: '25%',
    height: '100%-2',
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' },
      focus: { border: { fg: 'white' } },
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { style: { bg: 'cyan' } },
    keys: false,
    tags: true,
    label: asciiMode ? ' {cyan-fg}Browser{/cyan-fg} ' : ' {cyan-fg}🌳 Browser{/cyan-fg} ',
  });

  // Right pane — Detail
  detailBox = blessed.box({
    parent: screen,
    top: 1,
    left: '25%',
    width: '75%',
    height: '100%-2',
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' },
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { style: { bg: 'cyan' } },
    keys: false,
    tags: true,
  });

  // Status bar
  statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '',
    style: { fg: 'white', bg: '#333333' },
    tags: true,
  });
  updateStatusBar();

  // ── Keyboard Handling ───────────────────────────────────

  screen.key(keyMap.quit, async () => {
    if (mode === 'repl') return; // handled by readline
    screen.destroy();
    console.log(chalk.dim('\n  Disconnecting...'));
    await tree.adapter.disconnect();
    console.log(chalk.dim('  Goodbye!\n'));
    process.exit(0);
  });

  screen.key(keyMap.up, () => {
    if (mode !== 'tree') return;
    tree.moveUp();
    refreshTree();
    refreshDetail();
    screen.render();
  });

  screen.key(keyMap.down, () => {
    if (mode !== 'tree') return;
    tree.moveDown();
    refreshTree();
    refreshDetail();
    screen.render();
  });

  screen.key(keyMap.open, async () => {
    if (mode !== 'tree') return;
    const node = tree.selected;
    if (!node) return;

    if (node.isLeaf) {
      if (node.type === NodeType.TABLE) {
        await browseTable(node);
      } else if (node.type === NodeType.ROLE) {
        await showRoleDetail(node);
      }
    } else {
      if (!node.expanded) {
        await tree.expandNode(node);
      }
      refreshTree();
      refreshDetail();
      screen.render();
    }
  });

  screen.key(keyMap.back, () => {
    if (mode !== 'tree' && mode !== 'browse') return;
    if (mode === 'browse') {
      if (browseCleanup) browseCleanup();
      return;
    }
    const node = tree.selected;
    if (!node) return;

    if (node.expanded && !node.isLeaf) {
      tree.collapseNode(node);
    } else if (node.parent && node.parent.type !== NodeType.SERVER) {
      // Go to parent
      const parentIdx = tree.flatList.indexOf(node.parent);
      if (parentIdx >= 0) tree.cursor = parentIdx;
    }
    refreshTree();
    refreshDetail();
    screen.render();
  });

  // Tab → REPL mode
  screen.key(keyMap.repl, () => {
    if (mode === 'tree') {
      enterReplMode();
    }
  });

  // e → Export
  screen.key(keyMap.export, () => {
    if (mode !== 'tree') return;
    doExport();
  });

  // s → Run SQL (quick) — handled in scroll handler above
  // (kept as comment for clarity; s in tree mode enters REPL)

  // r → Refresh tree
  screen.key(keyMap.refresh, async () => {
    if (mode !== 'tree') return;
    detailBox.setContent('{center}{cyan-fg}Refreshing...{/cyan-fg}{/center}');
    screen.render();
    tree.root.children.forEach(c => {
      if (c.data.database === tree.connInfo.database) {
        c.loaded = false;
        c.children = [];
      }
    });
    const currentDb = tree.root.children.find(c => c.data.database === tree.connInfo.database);
    if (currentDb) {
      await tree._loadDbChildren(currentDb);
    }
    tree._rebuildFlat();
    refreshTree();
    refreshDetail();
    screen.render();
  });

  // d → Describe table
  screen.key(keyMap.describe, async () => {
    if (mode !== 'tree') return;
    const node = tree.selected;
    if (node && node.type === NodeType.TABLE) {
      await describeTable(node);
    }
  });

  // w / s for detail scroll
  screen.key(keyMap.scrollUp, () => {
    detailBox.scroll(-detailBox.height + 2);
    screen.render();
  });
  screen.key(keyMap.scrollDn, () => {
    if (mode === 'tree') {
      enterReplMode();
      return;
    }
    detailBox.scroll(detailBox.height - 2);
    screen.render();
  });
}

// ── Header / Status ─────────────────────────────────────────

function updateHeader() {
  const info = tree.connInfo;
  const prefix = asciiMode ? 'sqltree' : '🌳 sqltree';
  headerBar.setContent(
    ` ${prefix}  {bold}${info.type}://${info.host}:${info.port}/${info.database}{/bold}`
  );
}

function updateStatusBar() {
  if (mode === 'tree') {
    statusBar.setContent(
      ' {bold}↑↓{/bold} Navigate  ' +
      '{bold}Enter/→{/bold} Open  ' +
      '{bold}←{/bold} Back  ' +
      '{bold}Tab/s{/bold} SQL  ' +
      '{bold}d{/bold} Describe  ' +
      '{bold}e{/bold} Export  ' +
      '{bold}r{/bold} Refresh  ' +
      '{bold}q{/bold} Quit'
    );
  } else if (mode === 'repl') {
    statusBar.setContent(
      ' {bold}SQL REPL{/bold}  Type queries ending with {bold};{/bold}  ' +
      '{bold}\\back{/bold} or {bold}Ctrl+C{/bold} to return  ' +
      '{bold}\\export{/bold} to export'
    );
  }
}

// ── Tree Rendering ──────────────────────────────────────────

function refreshTree() {
  const w = treeBox.width - 4;
  const lines = tree.renderLines(w);

  // Ensure the cursor is visible (scroll into view)
  const visibleHeight = treeBox.height - 2;
  const scrollPos = treeBox.getScroll();

  if (tree.cursor < scrollPos) {
    treeBox.setScroll(tree.cursor);
  } else if (tree.cursor >= scrollPos + visibleHeight) {
    treeBox.setScroll(tree.cursor - visibleHeight + 1);
  }

  treeBox.setContent(lines.join('\n'));
}

// ── Detail Panel ────────────────────────────────────────────

function refreshDetail() {
  const node = tree.selected;
  if (!node) {
    detailBox.setContent('{center}{gray-fg}Select an item to see details{/gray-fg}{/center}');
    return;
  }

  let content = '';

  switch (node.type) {
    case NodeType.DATABASE: {
      const isCurrent = node.data.database === tree.connInfo.database;
      content = formatDetailHeader('Database');
      content += `  Name:     {bold}${esc(node.data.database)}{/bold}\n`;
      content += `  Status:   ${isCurrent ? '{green-fg}Connected ◀{/green-fg}' : '{gray-fg}Not connected{/gray-fg}'}\n`;
      if (node.expanded) {
        const tables = countLeaves(node, NodeType.TABLE);
        const schemas = countLeaves(node, NodeType.SCHEMA);
        const roles = countLeaves(node, NodeType.ROLE);
        content += `  Schemas:  {cyan-fg}${schemas}{/cyan-fg}\n`;
        content += `  Tables:   {yellow-fg}${tables}{/yellow-fg}\n`;
        content += `  Roles:    {magenta-fg}${roles}{/magenta-fg}\n`;
      }
      if (!isCurrent) {
        content += `\n  {gray-fg}Press Enter to switch to this database{/gray-fg}\n`;
      }
      break;
    }

    case NodeType.SCHEMA: {
      content = formatDetailHeader('Schema');
      content += `  Name:     {bold}${esc(node.data.schema)}{/bold}\n`;
      const tc = countLeaves(node, NodeType.TABLE);
      content += `  Tables:   {yellow-fg}${tc}{/yellow-fg}\n`;
      break;
    }

    case NodeType.TABLE: {
      content = formatDetailHeader('Table');
      content += `  Name:     {bold}{yellow-fg}${esc(node.data.table)}{/yellow-fg}{/bold}\n`;
      if (node.data.schema) {
        content += `  Schema:   ${esc(node.data.schema)}\n`;
      }
      content += `\n  {gray-fg}Enter: Browse  d: Describe{/gray-fg}\n`;
      break;
    }

    case NodeType.ROLE: {
      content = formatDetailHeader('User / Role');
      content += `  Name:     {bold}{magenta-fg}${esc(node.data.role)}{/magenta-fg}{/bold}\n`;
      break;
    }

    case NodeType.SCHEMA_GROUP:
    case NodeType.TABLE_GROUP:
    case NodeType.ROLE_GROUP: {
      const childCount = node.children.length;
      content = formatDetailHeader(node.label);
      content += `  Items:    {cyan-fg}${childCount}{/cyan-fg}\n`;
      if (!node.expanded) {
        content += `\n  {gray-fg}Press Enter to expand{/gray-fg}\n`;
      }
      break;
    }

    default:
      content = `{gray-fg}${esc(node.label)}{/gray-fg}`;
  }

  if (tree.lastError) {
    content += `\n  {red-fg}Error: ${esc(tree.lastError)}{/red-fg}\n`;
    tree.lastError = null;
  }

  detailBox.setContent(content);
  detailBox.setScroll(0);
}

// ── Table Actions ───────────────────────────────────────────

async function showRoleDetail(node) {
  detailBox.setContent(`{center}{cyan-fg}Loading...{/cyan-fg}{/center}`);
  screen.render();

  try {
    const result = await tree.adapter.getUsers();
    lastResult = result;
    const roleData = result.rows.find(r =>
      (r.User || r.user || Object.values(r)[0]) === node.data.role
    );

    let content = formatDetailHeader(`Role: ${node.data.role}`);
    if (roleData) {
      for (const [key, val] of Object.entries(roleData)) {
        content += `  ${key}: {bold}${esc(String(val))}{/bold}\n`;
      }
    }

    detailBox.setContent(content);
    detailBox.setScroll(0);
    screen.render();
  } catch (err) {
    detailBox.setContent(`{red-fg}  Error: ${esc(err.message)}{/red-fg}`);
    screen.render();
  }
}

async function describeTable(node) {
  const tableName = node.data.table;
  const schema = node.data.schema;
  const fullName = schema ? `${schema}.${tableName}` : tableName;

  detailBox.setContent(`{center}{cyan-fg}Loading structure...{/cyan-fg}{/center}`);
  screen.render();

  try {
    const result = await tree.adapter.describeTable(fullName);
    lastResult = result;

    let content = formatDetailHeader(`Structure: ${tableName}`);
    content += renderResultContent(result, detailBox.width - 4);

    detailBox.setContent(content);
    detailBox.setScroll(0);
    screen.render();
  } catch (err) {
    detailBox.setContent(`{red-fg}  Error: ${esc(err.message)}{/red-fg}`);
    screen.render();
  }
}

async function browseTable(node) {
  const tableName = node.data.table;
  const schema = node.data.schema;
  const fullName = schema ? `${schema}.${tableName}` : tableName;
  const quoted = tree.adapter.quoteIdentifier(fullName);

  detailBox.setContent(`{center}{cyan-fg}Loading...{/cyan-fg}{/center}`);
  screen.render();

  try {
    const countResult = await tree.adapter.query(`SELECT COUNT(*) AS total FROM ${quoted}`);
    const total = parseInt(countResult.rows[0].total);

    if (total === 0) {
      detailBox.setContent(`{gray-fg}  Table "${esc(tableName)}" is empty{/gray-fg}`);
      screen.render();
      return;
    }

    const totalPages = Math.ceil(total / pageSize);
    let page = 0;

    const loadPage = async () => {
      const offset = page * pageSize;
      const result = await tree.adapter.query(
        `SELECT * FROM ${quoted} LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`
      );
      lastResult = result;

      let content = formatDetailHeader(`${tableName} — Page ${page + 1}/${totalPages} (${total} rows)`);
      content += renderResultContent(result, detailBox.width - 4);
      content += `\n  {gray-fg}↓: Next  ↑: Prev  ←: Back  w/s: Scroll{/gray-fg}\n`;

      detailBox.setContent(content);
      detailBox.setScroll(0);
      screen.render();
    };

    await loadPage();

    // Temporary key bindings for browse mode
    const prevMode = mode;
    mode = 'browse';
    statusBar.setContent(
      ' {bold}Browse{/bold}  ' +
      '{bold}↓{/bold} Next page  ' +
      '{bold}↑{/bold} Prev page  ' +
      '{bold}←{/bold} Back  ' +
      '{bold}w/s{/bold} Scroll'
    );
    screen.render();

    const cleanup = () => {
      browseCleanup = null;
      screen.unkey(['down'], nextHandler);
      screen.unkey(['up'], prevHandler);
      mode = prevMode;
      updateStatusBar();
      refreshDetail();
      screen.render();
    };

    const nextHandler = async () => {
      if (mode !== 'browse') return;
      if (page < totalPages - 1) {
        page++;
        await loadPage();
      }
    };

    const prevHandler = async () => {
      if (mode !== 'browse') return;
      if (page > 0) {
        page--;
        await loadPage();
      }
    };

    browseCleanup = cleanup;
    screen.key(['down'], nextHandler);
    screen.key(['up'], prevHandler);
  } catch (err) {
    detailBox.setContent(`{red-fg}  Error: ${esc(err.message)}{/red-fg}`);
    screen.render();
  }
}

// ── REPL Mode (Full Screen) ────────────────────────────────

function enterReplMode() {
  mode = 'repl';

  // Hide tree/detail, show full screen box
  treeBox.hide();
  detailBox.hide();

  const replBox = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: '100%',
    height: '100%-2',
    border: { type: 'line' },
    style: { border: { fg: 'magenta' } },
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { style: { bg: 'magenta' } },
    label: ' {magenta-fg}SQL REPL{/magenta-fg} ',
  });

  updateStatusBar();
  headerBar.setContent(
    ` ${asciiMode ? 'sqltree' : '🌳 sqltree'}  {bold}SQL REPL{/bold}  —  ${tree.connInfo.type}://${tree.connInfo.host}:${tree.connInfo.port}/${tree.connInfo.database}`
  );
  screen.render();

  // Destroy the blessed screen temporarily, enter raw readline REPL
  screen.destroy();

  // Clean up lingering keypress listeners from blessed to prevent double input in REPL
  process.stdin.removeAllListeners('keypress');

  console.log('');
  console.log(chalk.magenta.bold('  ┌─────────────────────────────────────┐'));
  console.log(chalk.magenta.bold('  │') + chalk.white.bold('  SQL REPL Mode                     ') + chalk.magenta.bold('│'));
  console.log(chalk.magenta.bold('  │') + chalk.dim('  Type queries ending with ;         ') + chalk.magenta.bold('│'));
  console.log(chalk.magenta.bold('  │') + chalk.dim('  \\back to return to tree browser    ') + chalk.magenta.bold('│'));
  console.log(chalk.magenta.bold('  │') + chalk.dim('  \\export <csv|json|sql|md> export   ') + chalk.magenta.bold('│'));
  console.log(chalk.magenta.bold('  │') + chalk.dim('  \\dump / \\restore <file>            ') + chalk.magenta.bold('│'));
  console.log(chalk.magenta.bold('  └─────────────────────────────────────┘'));
  console.log('');

  const tableNames = collectTableNames(tree.root);

  const completer = (line) => {
    const word = line.split(/\s+/).pop() || '';
    const all = [
      ...SQL_KEYWORDS,
      ...SQL_KEYWORDS.map(k => k.toLowerCase()),
      ...tableNames,
    ];
    const hits = all.filter(w => w.toLowerCase().startsWith(word.toLowerCase()));
    return [hits.length ? hits : [], word];
  };

  let sqlBuffer = '';
  const makePrompt = () => chalk.magenta('SQL') + chalk.dim(' ▸ ');
  const contPrompt = chalk.dim('  ··· ');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: makePrompt(),
    completer,
    terminal: true,
    historySize: 500,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();

    // Back command
    if (!sqlBuffer && (trimmed === '\\back' || trimmed === '\\b' || trimmed === '\\menu')) {
      rl.close();
      return;
    }

    // Export command
    if (!sqlBuffer && trimmed.startsWith('\\export')) {
      if (!lastResult || lastResult.type !== 'rows' || !lastResult.rows.length) {
        console.log(chalk.red('  No data to export. Run a query first.'));
        rl.prompt();
        return;
      }
      const parts = trimmed.split(/\s+/);
      const fmt = parts[1] || 'csv';
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const ext = fmt === 'md' || fmt === 'markdown' ? 'md' : fmt;
      const filename = `sqltree_${ts}.${ext}`;
      let content;
      if (fmt === 'json') {
        content = JSON.stringify(lastResult.rows, null, 2);
      } else if (fmt === 'sql') {
        content = exportSql(lastResult);
      } else if (fmt === 'md' || fmt === 'markdown') {
        content = exportMarkdown(lastResult);
      } else {
        content = exportCsv(lastResult);
      }
      writeFileSync(filename, content, 'utf-8');
      console.log(chalk.green(`  Exported ${lastResult.rows.length} rows → ${filename}`));
      rl.prompt();
      return;
    }

    // Dump command
    if (!sqlBuffer && trimmed.startsWith('\\dump')) {
      const parts = trimmed.split(/\s+/);
      const file = parts[1];
      const info = tree.connInfo;
      try {
        if (info.type === 'mysql') {
          const args = ['-h', info.host, '-P', String(info.port), '-u', info.user];
          if (info.password) args.push(`-p${info.password}`);
          args.push(info.database);
          if (file) args.push('--result-file', file);
          const out = execFileSync('mysqldump', args, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
          if (!file) { console.log(out); } else { console.log(chalk.green(`  Dumped → ${file}`)); }
        } else {
          const args = ['-h', info.host, '-p', String(info.port), '-U', info.user, '-d', info.database];
          if (file) args.push('-f', file);
          const env = { ...process.env };
          if (info.password) env.PGPASSWORD = info.password;
          const out = execFileSync('pg_dump', args, { encoding: 'utf-8', env, maxBuffer: 50 * 1024 * 1024 });
          if (!file) { console.log(out); } else { console.log(chalk.green(`  Dumped → ${file}`)); }
        }
      } catch (err) {
        console.log(chalk.red(`  Dump failed: ${err.message}`));
      }
      rl.prompt();
      return;
    }

    // Restore command
    if (!sqlBuffer && trimmed.startsWith('\\restore')) {
      const parts = trimmed.split(/\s+/);
      const file = parts[1];
      if (!file) {
        console.log(chalk.red('  Usage: \\restore <file>'));
        rl.prompt();
        return;
      }
      const info = tree.connInfo;
      try {
        if (info.type === 'mysql') {
          const args = ['-h', info.host, '-P', String(info.port), '-u', info.user, info.database, '-e', `source ${file}`];
          if (info.password) args.push(`-p${info.password}`);
          execFileSync('mysql', args, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
        } else {
          const env = { ...process.env };
          if (info.password) env.PGPASSWORD = info.password;
          execFileSync('psql', ['-h', info.host, '-p', String(info.port), '-U', info.user, '-d', info.database, '-f', file], { encoding: 'utf-8', env, maxBuffer: 50 * 1024 * 1024 });
        }
        console.log(chalk.green(`  Restored from ${file}`));
      } catch (err) {
        console.log(chalk.red(`  Restore failed: ${err.message}`));
      }
      rl.prompt();
      return;
    }

    // Save command
    if (!sqlBuffer && trimmed.startsWith('\\save')) {
      const name = trimmed.replace(/^\\save\s*/, '').trim();
      if (!name) {
        console.log(chalk.red('  Usage: \\save <name>'));
      } else {
        saveConnection(name, tree.adapter.rawConfig);
        console.log(chalk.green(`  Connection saved as "${name}"`));
      }
      rl.prompt();
      return;
    }

    if (!trimmed && !sqlBuffer) {
      rl.prompt();
      return;
    }

    sqlBuffer += (sqlBuffer ? '\n' : '') + line;

    if (!sqlBuffer.trimEnd().endsWith(';')) {
      rl.setPrompt(contPrompt);
      rl.prompt();
      return;
    }

    const sql = sqlBuffer.trimEnd();
    sqlBuffer = '';
    rl.setPrompt(makePrompt());

    if (sql === ';') {
      rl.prompt();
      return;
    }

    rl.pause();
    const spinChar = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let si = 0;
    const spinInterval = setInterval(() => {
      process.stdout.write(`\r  ${chalk.cyan(spinChar[si++ % spinChar.length])} Running...`);
    }, 80);

    try {
      const result = await tree.adapter.query(sql);
      clearInterval(spinInterval);
      process.stdout.write('\r' + ' '.repeat(30) + '\r');
      displayResultConsole(result);
      lastResult = result;
    } catch (err) {
      clearInterval(spinInterval);
      process.stdout.write('\r' + ' '.repeat(30) + '\r');
      console.log(chalk.red(`  ${err.message}\n`));
    }

    rl.resume();
    rl.prompt();
  });

  rl.on('SIGINT', () => {
    if (sqlBuffer) {
      sqlBuffer = '';
      rl.setPrompt(makePrompt());
      console.log(chalk.dim(' ^C'));
      rl.prompt();
    } else {
      rl.close();
    }
  });

  rl.on('close', () => {
    console.log(chalk.dim('  ← Returning to tree browser...\n'));
    mode = 'tree';

    // Fully reset stdin before blessed re-initializes.
    // readline.close() pauses stdin, disables rawMode, and leaves stale listeners.
    // blessed's internal markers must be cleared so it re-runs _listenInput()
    // and keys.emitKeypressEvents() with fresh handlers.
    process.stdin.removeAllListeners();
    delete process.stdin._blessedInput;
    delete process.stdin._keypressHandler;
    delete process.stdin._dataHandler;
    delete process.stdin._keypressDecoder;
    if (process.stdin.isPaused()) process.stdin.resume();
    process.stdin.ref();

    // Recreate the screen
    createScreen();
    refreshTree();
    refreshDetail();
    updateHeader();
    updateStatusBar();
    screen.render();
  });
}

// ── Export ───────────────────────────────────────────────────

function doExport() {
  if (!lastResult || lastResult.type !== 'rows' || !lastResult.rows.length) {
    detailBox.setContent('{red-fg}  No data to export. Select a table or run a query first.{/red-fg}');
    screen.render();
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const formats = { csv: exportCsv, sql: exportSql, md: exportMarkdown };
  const lines = Object.keys(formats).map((f, i) =>
    `  {bold}${i + 1}{/bold}) ${f.toUpperCase()}`
  );
  lines.push('  {bold}4{/bold}) JSON');

  detailBox.setContent(
    formatDetailHeader('Export') +
    lines.join('\n') + '\n\n  {gray-fg}Press 1-4 to choose format{/gray-fg}'
  );
  screen.render();

  const prevMode = mode;
  mode = 'export';

  const handler = (ch) => {
    if (mode !== 'export') return;
    screen.unkey(['1', '2', '3', '4', 'escape'], handler);
    mode = prevMode;

    if (ch === 'escape' || ch === '\x1b') {
      refreshDetail();
      screen.render();
      return;
    }

    const map = { '1': 'csv', '2': 'sql', '3': 'md', '4': 'json' };
    const fmt = map[ch];
    if (!fmt) { refreshDetail(); screen.render(); return; }

    const filename = `sqltree_${ts}.${fmt}`;
    const content = fmt === 'json'
      ? JSON.stringify(lastResult.rows, null, 2)
      : formats[fmt](lastResult);
    writeFileSync(filename, content, 'utf-8');

    detailBox.setContent(
      `{green-fg}  Exported ${lastResult.rows.length} rows → ${esc(filename)}{/green-fg}`
    );
    screen.render();
  };

  screen.key(['1', '2', '3', '4', 'escape'], handler);
}

// ── Result Display (for REPL console mode) ──────────────────

export function displayResultConsole(result) {
  if (result.type === 'rows') {
    if (result.rows.length === 0) {
      console.log(chalk.dim('  (0 rows)'));
      return;
    }

    const columns = result.columns || Object.keys(result.rows[0]);

    if (expanded) {
      const maxKeyLen = Math.max(...columns.map(c => c.length));
      result.rows.forEach((row, i) => {
        console.log(chalk.dim(`─── Row ${i + 1} ${'─'.repeat(40)}`));
        columns.forEach(col => {
          const key = col.padEnd(maxKeyLen);
          console.log(`  ${chalk.bold.cyan(key)} │ ${formatCellConsole(row[col])}`);
        });
      });
    } else {
      const colWidths = columns.map((col) =>
        result.rows.reduce(
          (max, row) => Math.max(max, Math.min(String(row[col] ?? 'NULL').length, 40)),
          col.length
        )
      );

      const header = columns.map((c, i) => chalk.bold.cyan(c.padEnd(colWidths[i]))).join(' │ ');
      const sep = colWidths.map(w => '─'.repeat(w)).join('─┼─');
      console.log(`  ${header}`);
      console.log(chalk.dim(`  ${sep}`));

      result.rows.forEach(row => {
        const line = columns.map((c, i) => {
          const val = row[c];
          const raw = String(val ?? 'NULL');
          const padded = raw.length > colWidths[i]
            ? raw.slice(0, colWidths[i] - 1) + '…'
            : raw.padEnd(colWidths[i]);
          return val === null || val === undefined
            ? chalk.dim(padded)
            : padded;
        }).join(' │ ');
        console.log(`  ${line}`);
      });
    }

    console.log(
      chalk.dim(`  ${result.rowCount} row${result.rowCount !== 1 ? 's' : ''} · ${formatDuration(result.time)}`)
    );
  } else {
    const rc = result.rowCount;
    const rowInfo = rc != null ? ` · ${rc} row${rc !== 1 ? 's' : ''} affected` : '';
    console.log(
      chalk.green(`  ${result.command || 'OK'}${rowInfo} · ${formatDuration(result.time)}`)
    );
  }
  console.log('');
}

export const formatCellConsole = (value) =>
  value === null || value === undefined ? chalk.dim('NULL') :
  typeof value === 'boolean' ? (value ? chalk.green('true') : chalk.red('false')) :
  value instanceof Date ? chalk.yellow(value.toISOString()) :
  typeof value === 'object' ? chalk.dim(JSON.stringify(value)) :
  String(value);

export const formatDuration = (ms) =>
  ms < 1 ? '<1ms' :
  ms < 1000 ? `${ms.toFixed(1)}ms` :
  `${(ms / 1000).toFixed(2)}s`;

// ── Render result as blessed markup ─────────────────────────

const formatCell = (val, maxWidth) => {
  const raw = String(val ?? 'NULL');
  const str = raw.length > maxWidth ? raw.slice(0, maxWidth - 1) + '…' : raw.padEnd(maxWidth);
  if (val === null || val === undefined) return `{gray-fg}${esc(str)}{/gray-fg}`;
  if (typeof val === 'boolean') return val ? `{green-fg}${esc(str)}{/green-fg}` : `{red-fg}${esc(str)}{/red-fg}`;
  return esc(str);
};

const formatFooter = (result) => {
  const count = result.rowCount ?? result.rows.length;
  const time = result.time != null ? ` · ${formatDuration(result.time)}` : '';
  return `{gray-fg}  ${count} row${count !== 1 ? 's' : ''}${time}{/gray-fg}\n`;
};

const renderAsTable = (columns, colWidths, result) => {
  const header = columns
    .map((c, i) => `{bold}{cyan-fg}${esc(c.padEnd(colWidths[i]))}{/cyan-fg}{/bold}`)
    .join(' │ ');
  const sep = colWidths.map(w => '─'.repeat(w)).join('─┼─');
  const rows = result.rows
    .map(row =>
      '  ' + columns.map((c, i) => formatCell(row[c], colWidths[i])).join(' │ ')
    )
    .join('\n');
  return `  ${header}\n{gray-fg}  ${sep}{/gray-fg}\n${rows}\n${formatFooter(result)}`;
};

const formatRecordField = (col, maxKeyLen, rawVal, maxValLen) => {
  const key = esc(col.padEnd(maxKeyLen));
  const raw = String(rawVal ?? 'NULL');
  const val = raw.length > maxValLen ? raw.slice(0, maxValLen - 1) + '…' : raw;
  const styledVal =
    rawVal === null || rawVal === undefined ? `{gray-fg}${esc(val)}{/gray-fg}` :
    typeof rawVal === 'boolean' ? (rawVal ? `{green-fg}${esc(val)}{/green-fg}` : `{red-fg}${esc(val)}{/red-fg}`) :
    typeof rawVal === 'object' ? `{gray-fg}${esc(val)}{/gray-fg}` :
    esc(val);
  return `  {bold}{cyan-fg}${key}{/cyan-fg}{/bold} │ ${styledVal}`;
};

const renderAsRecords = (columns, result, availableWidth) => {
  const maxKeyLen = Math.max(...columns.map(c => c.length));
  const maxValLen = Math.max(availableWidth - maxKeyLen - 7, 10);
  const divider = '─'.repeat(Math.min(availableWidth - 4, 40));

  const records = result.rows.map((row, idx) => {
    const header = `{gray-fg}  ─── Record ${idx + 1} ${divider}───{/gray-fg}`;
    const fields = columns.map(col => formatRecordField(col, maxKeyLen, row[col], maxValLen));
    return [header, ...fields].join('\n');
  }).join('\n');

  return `${records}\n${formatFooter(result)}`;
};

export const renderResultContent = (result, availableWidth = 60) => {
  if (!result.rows || result.rows.length === 0) {
    return '{gray-fg}  (0 rows){/gray-fg}\n';
  }

  const columns = result.columns || Object.keys(result.rows[0]);
  const maxCellWidth = 30;

  const colWidths = columns.map((col) =>
    result.rows.reduce(
      (max, row) => Math.max(max, Math.min(String(row[col] ?? 'NULL').length, maxCellWidth)),
      col.length
    )
  );

  const totalTableWidth = colWidths.reduce((s, w) => s + w, 0) + (columns.length - 1) * 3 + 4;

  return totalTableWidth <= availableWidth
    ? renderAsTable(columns, colWidths, result)
    : renderAsRecords(columns, result, availableWidth);
};

// ── Helpers (pure functions) ────────────────────────────────

export const esc = (str) =>
  String(str).replace(/\{/g, '\\{').replace(/\}/g, '\\}');

export const formatDetailHeader = (title) =>
  `\n{bold}{cyan-fg}  ${esc(title)}{/cyan-fg}{/bold}\n${'─'.repeat(40)}\n`;

export const countLeaves = (node, type) =>
  (node.type === type ? 1 : 0) +
  node.children.reduce((sum, child) => sum + countLeaves(child, type), 0);

export const collectTableNames = (node) =>
  node.type === NodeType.TABLE
    ? [node.data.table]
    : node.children.flatMap(collectTableNames);
