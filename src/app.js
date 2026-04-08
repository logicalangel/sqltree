import { select, input, password as passwordPrompt } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { printBanner } from './ui.js';
import { createAdapter } from './adapters/index.js';
import { loadConnections } from './config.js';
import { startTui } from './tui.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(join(__dirname, '..', 'package.json'), 'utf-8'));

// ── Entry point ─────────────────────────────────────────────

export async function run(args) {
  const opts = parseArgs(args);

  if (opts.help) { printUsage(); process.exit(0); }
  if (opts.version) { console.log(pkg.version); process.exit(0); }

  printBanner(pkg.version);

  try {
    let adapter;

    if (opts.uri) {
      adapter = await connectWithUri(opts.uri);
    } else if (opts.host || opts.type) {
      adapter = await connectWithOpts(opts);
    } else {
      adapter = await interactiveConnect();
    }

    await startTui(adapter);
  } catch (err) {
    console.error(chalk.red(`\n  Error: ${err.message}\n`));
    process.exit(1);
  }
}

// ── Arg parsing ─────────────────────────────────────────────

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    switch (a) {
      case '--uri':      case '-u':  opts.uri = next(); break;
      case '--type':     case '-t':  opts.type = next(); break;
      case '--host':     case '-H':  opts.host = next(); break;
      case '--port':     case '-p':  opts.port = parseInt(next()); break;
      case '--user':     case '-U':  opts.user = next(); break;
      case '--password': case '-W':  opts.password = next(); break;
      case '--database': case '-d':  opts.database = next(); break;
      case '--help':                 opts.help = true; break;
      case '--version':  case '-v':  opts.version = true; break;
    }
  }
  return opts;
}

// ── Connection helpers ──────────────────────────────────────

function detectType(uri) {
  if (uri.startsWith('postgres')) return 'postgres';
  if (uri.startsWith('mysql') || uri.startsWith('mariadb')) return 'mysql';
  throw new Error('Cannot detect database type from URI. Use --type to specify.');
}

async function connectWithSpinner(type, config) {
  const spinner = ora({ text: chalk.dim(' Connecting...'), spinner: 'dots' }).start();
  try {
    const adapter = createAdapter(type);
    await adapter.connect(config);
    spinner.succeed(chalk.green(' Connected'));
    return adapter;
  } catch (err) {
    spinner.fail(chalk.red(' Connection failed'));
    throw err;
  }
}

async function connectWithUri(uri) {
  return connectWithSpinner(detectType(uri), { uri });
}

async function connectWithOpts(opts) {
  return connectWithSpinner(opts.type || 'postgres', {
    host: opts.host,
    port: opts.port,
    user: opts.user,
    password: opts.password,
    database: opts.database,
  });
}

// ── Interactive connection flow ─────────────────────────────

async function interactiveConnect() {
  const saved = loadConnections();
  const choices = [{ name: '⚡ New connection', value: 'new' }];
  if (saved.length > 0) {
    choices.push({ name: '📁 Saved connections', value: 'saved' });
  }

  const action = await select({ message: 'What would you like to do?', choices });

  if (action === 'saved') return connectFromSaved(saved);
  return connectNew();
}

async function connectNew() {
  const type = await select({
    message: 'Database type',
    choices: [
      { name: 'PostgreSQL', value: 'postgres' },
      { name: 'MySQL', value: 'mysql' },
    ],
  });

  const method = await select({
    message: 'Connection method',
    choices: [
      { name: 'Connection URI', value: 'uri' },
      { name: 'Individual parameters', value: 'params' },
    ],
  });

  if (method === 'uri') {
    const placeholder = type === 'postgres'
      ? 'postgresql://user:pass@localhost:5432/mydb'
      : 'mysql://user:pass@localhost:3306/mydb';
    const uri = await input({
      message: 'Connection URI',
      validate: v => v.trim() ? true : 'URI is required',
    });
    console.log(chalk.dim(`  hint: ${placeholder}`));
    return connectWithSpinner(type, { uri });
  }

  const host = await input({ message: 'Host', default: 'localhost' });
  const defaultPort = type === 'postgres' ? '5432' : '3306';
  const port = await input({ message: 'Port', default: defaultPort });
  const defaultUser = type === 'postgres' ? 'postgres' : 'root';
  const user = await input({ message: 'User', default: defaultUser });
  const pass = await passwordPrompt({ message: 'Password', mask: '•' });
  const database = await input({
    message: 'Database',
    validate: v => v.trim() ? true : 'Database name is required',
  });

  return connectWithSpinner(type, {
    host,
    port: parseInt(port),
    user,
    password: pass,
    database,
  });
}

async function connectFromSaved(saved) {
  const name = await select({
    message: 'Select connection',
    choices: saved.map(s => ({
      name: `${s.name} ${chalk.dim(`(${s.type}://${s.host || '?'}:${s.port || '?'}/${s.database || '?'})`)}`,
      value: s.name,
    })),
  });

  const conn = saved.find(s => s.name === name);
  if (conn.uri) {
    return connectWithSpinner(conn.type || detectType(conn.uri), { uri: conn.uri });
  }
  return connectWithSpinner(conn.type || 'postgres', conn);
}

// ── Usage ───────────────────────────────────────────────────

function printUsage() {
  console.log(`
${chalk.bold('sqltree')} — A minimal CLI database client for PostgreSQL & MySQL

${chalk.bold('Usage:')}
  sqltree [options]

${chalk.bold('Options:')}
  --uri,  -u <uri>     Connection URI
  --type, -t <type>    Database type ${chalk.dim('(postgres | mysql)')}
  --host, -H <host>    Hostname ${chalk.dim('(default: localhost)')}
  --port, -p <port>    Port ${chalk.dim('(default: 5432 / 3306)')}
  --user, -U <user>    Username
  --password, -W <pw>  Password
  --database, -d <db>  Database name
  --help               Show this help
  --version, -v        Show version

${chalk.bold('Examples:')}
  sqltree --uri postgresql://user:pass@localhost:5432/mydb
  sqltree -t mysql -H 127.0.0.1 -U root -d test
  sqltree                  ${chalk.dim('# interactive mode')}
`);
}
