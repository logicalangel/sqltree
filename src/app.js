import { select, input, password as passwordPrompt } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { printBanner } from './ui.js';
import { createAdapter } from './adapters/index.js';
import { loadConnections, loadSettings } from './config.js';
import { startTui } from './tui.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(join(__dirname, '..', 'package.json'), 'utf-8'));

// ── Entry point ─────────────────────────────────────────────

export async function run(args) {
  const opts = parseArgs(args);

  if (opts.help) { printUsage(); process.exit(0); }
  if (opts.version) { console.log(pkg.version); process.exit(0); }

  printBanner(pkg.version);

  if (!process.stdout.isTTY) {
    console.error('sqltree requires an interactive terminal (TTY). Pipe mode is not supported.');
    process.exit(1);
  }

  // Load config file settings, then override with CLI flags
  const settings = loadSettings();

  // Check DATABASE_URL env when no connection args given
  if (!opts.uri && !opts.host && !opts.type && process.env.DATABASE_URL) {
    opts.uri = process.env.DATABASE_URL;
  }

  const ascii = opts.ascii ?? settings.ascii ?? false;
  const effectivePageSize = opts.pageSize ?? settings.pageSize ?? 25;
  const effectiveTimeout = opts.timeout ?? settings.timeout ?? 10000;
  const effectiveSsl = opts.ssl ?? settings.ssl ?? false;
  const keyBindings = settings.keyBindings || {};

  const connectConfig = {};
  if (effectiveTimeout) connectConfig.connectTimeout = effectiveTimeout;
  if (effectiveSsl) {
    connectConfig.ssl = opts.sslRejectUnauthorized === false
      ? { rejectUnauthorized: false }
      : true;
  }

  try {
    let adapter;

    if (opts.uri) {
      adapter = await connectWithUri(opts.uri, connectConfig);
    } else if (opts.host || opts.type) {
      adapter = await connectWithOpts(opts, connectConfig);
    } else {
      adapter = await interactiveConnect(connectConfig);
    }

    await startTui(adapter, { pageSize: effectivePageSize, ascii: ascii || ['dumb', 'linux'].includes(process.env.TERM), keyBindings });
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
      case '--page-size':             opts.pageSize = parseInt(next()); break;
      case '--timeout':               opts.timeout = parseInt(next()); break;
      case '--ascii':                 opts.ascii = true; break;
      case '--ssl':                   opts.ssl = true; break;
      case '--ssl-reject-unauthorized': opts.sslRejectUnauthorized = args[++i] !== 'false'; break;
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
  if (uri.startsWith('cockroach')) return 'cockroachdb';
  if (uri.startsWith('redshift')) return 'redshift';
  if (uri.startsWith('crate')) return 'cratedb';
  if (uri.startsWith('clickhouse')) return 'clickhouse';
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

async function connectWithUri(uri, extra = {}) {
  return connectWithSpinner(detectType(uri), { uri, ...extra });
}

async function connectWithOpts(opts, extra = {}) {
  return connectWithSpinner(opts.type || 'postgres', {
    host: opts.host,
    port: opts.port,
    user: opts.user,
    password: opts.password,
    database: opts.database,
    ...extra,
  });
}

// ── Interactive connection flow ─────────────────────────────

async function interactiveConnect(connectConfig = {}) {
  const saved = loadConnections();
  const choices = [{ name: '⚡ New connection', value: 'new' }];
  if (saved.length > 0) {
    choices.push({ name: '📁 Saved connections', value: 'saved' });
  }

  const action = await select({ message: 'What would you like to do?', choices });

  if (action === 'saved') return connectFromSaved(saved, connectConfig);
  return connectNew(connectConfig);
}

async function connectNew(connectConfig = {}) {
  const type = await select({
    message: 'Database type',
    choices: [
      { name: 'PostgreSQL', value: 'postgres' },
      { name: 'MySQL', value: 'mysql' },
      { name: 'MariaDB', value: 'mariadb' },
      { name: 'CockroachDB', value: 'cockroachdb' },
      { name: 'Redshift', value: 'redshift' },
      { name: 'YugabyteDB', value: 'yugabytedb' },
      { name: 'TimescaleDB', value: 'timescaledb' },
      { name: 'TiDB', value: 'tidb' },
      { name: 'PlanetScale', value: 'planetscale' },
      { name: 'Supabase', value: 'supabase' },
      { name: 'Neon', value: 'neon' },
      { name: 'Greenplum', value: 'greenplum' },
      { name: 'Citus', value: 'citus' },
      { name: 'CrateDB', value: 'cratedb' },
      { name: 'QuestDB', value: 'questdb' },
      { name: 'Materialize', value: 'materialize' },
      { name: 'ClickHouse', value: 'clickhouse' },
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
    return connectWithSpinner(type, { uri, ...connectConfig });
  }

  const host = await input({ message: 'Host', default: 'localhost' });
  const pgLike = ['postgres', 'cockroachdb', 'redshift', 'yugabytedb', 'timescaledb', 'supabase', 'neon', 'greenplum', 'citus', 'cratedb', 'questdb', 'materialize'].includes(type);
  const defaultPort = pgLike ? '5432' : '3306';
  const port = await input({ message: 'Port', default: defaultPort });
  const defaultUser = pgLike ? 'postgres' : 'root';
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
    ...connectConfig,
  });
}

async function connectFromSaved(saved, connectConfig = {}) {
  const name = await select({
    message: 'Select connection',
    choices: saved.map(s => ({
      name: `${s.name} ${chalk.dim(`(${s.type}://${s.host || '?'}:${s.port || '?'}/${s.database || '?'})`)}`,
      value: s.name,
    })),
  });

  const conn = saved.find(s => s.name === name);
  if (conn.uri) {
    return connectWithSpinner(conn.type || detectType(conn.uri), { uri: conn.uri, ...connectConfig });
  }
  return connectWithSpinner(conn.type || 'postgres', { ...conn, ...connectConfig });
}

// ── Usage ───────────────────────────────────────────────────

function printUsage() {
  console.log(`
${chalk.bold('sqltree')} — A minimal CLI database client for PostgreSQL & MySQL

${chalk.bold('Usage:')}
  sqltree [options]

${chalk.bold('Connection:')}
  --uri,  -u <uri>     Connection URI
  --type, -t <type>    Database type ${chalk.dim('(postgres | mysql | mariadb | ...)')}
  --host, -H <host>    Hostname ${chalk.dim('(default: localhost)')}
  --port, -p <port>    Port ${chalk.dim('(default: 5432 / 3306)')}
  --user, -U <user>    Username
  --password, -W <pw>  Password
  --database, -d <db>  Database name
  --ssl                Enable SSL
  --ssl-reject-unauthorized <bool>  Reject unauthorized certs ${chalk.dim('(default: true)')}
  --timeout <ms>       Connection timeout in ms ${chalk.dim('(default: 10000)')}

${chalk.bold('Display:')}
  --page-size <n>      Rows per page in table browse ${chalk.dim('(default: 25)')}
  --ascii              Use ASCII characters instead of emoji icons

${chalk.bold('General:')}
  --help               Show this help
  --version, -v        Show version

${chalk.bold('Environment:')}
  DATABASE_URL         Fallback connection URI when no args given

${chalk.bold('Examples:')}
  sqltree --uri postgresql://user:pass@localhost:5432/mydb
  sqltree -t mysql -H 127.0.0.1 -U root -d test
  DATABASE_URL=postgres://... sqltree
  sqltree --ascii --page-size 50
  sqltree                  ${chalk.dim('# interactive mode')}
`);
}
