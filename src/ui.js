import chalk from 'chalk';

// ── Banner ──────────────────────────────────────────────────

export function printBanner(version = '0.0.0') {
  const ver = `v${version}`;
  const title = `   🌳 sqltree ${ver}`;
  const padding = Math.max(0, 38 - title.length + 2);
  console.log('');
  console.log(chalk.cyan.bold('  ╔══════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('   🌳 sqltree ') + chalk.dim(ver) + ' '.repeat(padding) + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ║') + chalk.dim('   PostgreSQL · MySQL · CLI Client   ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════╝'));
  console.log('');
}

// ── Export ───────────────────────────────────────────────────

export function exportCsv(result) {
  const columns = result.columns || Object.keys(result.rows[0]);
  const lines = [columns.join(',')];

  for (const row of result.rows) {
    lines.push(columns.map(c => {
      const val = row[c];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(','));
  }

  return lines.join('\n');
}

export function exportSql(result, tableName = 'data') {
  const columns = result.columns || Object.keys(result.rows[0]);
  const lines = [];

  for (const row of result.rows) {
    const values = columns.map(c => {
      const val = row[c];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number' || typeof val === 'boolean') return String(val);
      return "'" + String(val).replace(/'/g, "''") + "'";
    });
    lines.push(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`);
  }

  return lines.join('\n');
}

export function exportMarkdown(result) {
  const columns = result.columns || Object.keys(result.rows[0]);
  const lines = [];

  lines.push('| ' + columns.join(' | ') + ' |');
  lines.push('| ' + columns.map(() => '---').join(' | ') + ' |');

  for (const row of result.rows) {
    const cells = columns.map(c => {
      const val = row[c];
      if (val === null || val === undefined) return '';
      return String(val).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    });
    lines.push('| ' + cells.join(' | ') + ' |');
  }

  return lines.join('\n');
}
