import chalk from 'chalk';

// ── Tree node types ─────────────────────────────────────────

export const NodeType = {
  SERVER: 'server',
  DATABASE: 'database',
  SCHEMA_GROUP: 'schema_group',
  SCHEMA: 'schema',
  TABLE_GROUP: 'table_group',
  TABLE: 'table',
  ROLE_GROUP: 'role_group',
  ROLE: 'role',
};

// ── Tree Node ───────────────────────────────────────────────

export class TreeNode {
  constructor(label, type, data = {}) {
    this.label = label;
    this.type = type;
    this.data = data;
    this.children = [];
    this.expanded = false;
    this.loaded = false;
    this.parent = null;
  }

  addChild(node) {
    node.parent = this;
    this.children.push(node);
    return node;
  }

  get depth() {
    let d = 0;
    let p = this.parent;
    while (p) { d++; p = p.parent; }
    return d;
  }

  get isLeaf() {
    return this.type === NodeType.TABLE || this.type === NodeType.ROLE;
  }
}

// ── Tree Model ──────────────────────────────────────────────

export class TreeModel {
  constructor(adapter, opts = {}) {
    this.adapter = adapter;
    this.root = null;
    this.flatList = [];   // visible nodes flattened for navigation
    this.cursor = 0;
    this.connInfo = adapter.connectionInfo;
    this.ascii = !!opts.ascii;
    this.lastError = null;
  }

  async init() {
    const info = this.connInfo;
    this.root = new TreeNode(
      `${info.user}@${info.host}:${info.port}`,
      NodeType.SERVER,
    );
    this.root.expanded = true;
    this.root.loaded = true;

    // Load databases
    try {
      const dbResult = await this.adapter.getDatabases();
      const dbs = dbResult.rows.map(r => r.name || r.Database || Object.values(r)[0]);
      for (const db of dbs) {
        const node = new TreeNode(db, NodeType.DATABASE, { database: db });
        // Auto-expand the connected database
        if (db === info.database) {
          node.expanded = true;
        }
        this.root.addChild(node);
      }
    } catch {
      // Couldn't load databases — add at least the current one
      const node = new TreeNode(info.database, NodeType.DATABASE, { database: info.database });
      node.expanded = true;
      this.root.addChild(node);
    }

    // Load children for the connected database
    const currentDbNode = this.root.children.find(c => c.data.database === info.database);
    if (currentDbNode) {
      await this._loadDbChildren(currentDbNode);
    }

    this._rebuildFlat();
    // Place cursor on the connected database
    const idx = this.flatList.indexOf(currentDbNode);
    if (idx >= 0) this.cursor = idx;
  }

  async _loadDbChildren(dbNode) {
    if (dbNode.loaded) return;
    dbNode.loaded = true;
    dbNode.children = [];

    const isPostgres = this.connInfo.type === 'postgres';
    const isCurrent = dbNode.data.database === this.connInfo.database;

    if (!isCurrent) {
      // We need to switch connection to load this DB
      // For now, just mark as needing switch
      dbNode.data.needsSwitch = true;
    }

    if (isCurrent || dbNode.data.switched) {
      if (isPostgres) {
        // Schemas group
        const schemaGroup = dbNode.addChild(
          new TreeNode('Schemas', NodeType.SCHEMA_GROUP)
        );

        try {
          const sResult = await this.adapter.getSchemas();
          const schemas = sResult.rows.map(r => r.name || Object.values(r)[0]);
          for (const s of schemas) {
            const sNode = schemaGroup.addChild(
              new TreeNode(s, NodeType.SCHEMA, { schema: s })
            );
            if (s === 'public') {
              schemaGroup.expanded = true;
              sNode.expanded = true;
              // Load tables for public schema
              await this._loadTablesForSchema(sNode, s);
            }
          }
          schemaGroup.loaded = true;
        } catch (err) { this.lastError = err.message; }
      } else {
        // MySQL — tables directly under DB (as a group)
        const tableGroup = dbNode.addChild(
          new TreeNode('Tables', NodeType.TABLE_GROUP)
        );
        tableGroup.expanded = true;

        try {
          const tResult = await this.adapter.getTables();
          const tables = tResult.rows.map(r => r.name || Object.values(r)[0]);
          for (const t of tables) {
            tableGroup.addChild(new TreeNode(t, NodeType.TABLE, { table: t }));
          }
          tableGroup.loaded = true;
        } catch (err) { this.lastError = err.message; }
      }

      // Roles & Users
      const roleGroup = dbNode.addChild(
        new TreeNode('Users & Roles', NodeType.ROLE_GROUP)
      );
      try {
        const uResult = await this.adapter.getUsers();
        const users = uResult.rows.map(r => r.User || r.user || Object.values(r)[0]);
        for (const u of users) {
          roleGroup.addChild(new TreeNode(u, NodeType.ROLE, { role: u }));
        }
        roleGroup.loaded = true;
      } catch (err) { this.lastError = err.message; }
    }
  }

  async _loadTablesForSchema(schemaNode, schema) {
    if (schemaNode.loaded) return;

    // Check if there's already a table group
    let tableGroup = schemaNode.children.find(c => c.type === NodeType.TABLE_GROUP);
    if (!tableGroup) {
      tableGroup = schemaNode.addChild(new TreeNode('Tables', NodeType.TABLE_GROUP));
      tableGroup.expanded = true;
    }

    try {
      const tResult = await this.adapter.getTables(schema);
      const tables = tResult.rows.map(r => r.name || Object.values(r)[0]);
      for (const t of tables) {
        tableGroup.addChild(new TreeNode(t, NodeType.TABLE, { table: t, schema }));
      }
      tableGroup.loaded = true;
    } catch (err) { this.lastError = err.message; }

    schemaNode.loaded = true;
  }

  async expandNode(node) {
    if (node.isLeaf) return;

    if (node.type === NodeType.DATABASE && !node.loaded) {
      if (node.data.needsSwitch) {
        // Switch adapter connection to this database
        await this._switchDatabase(node);
      } else {
        await this._loadDbChildren(node);
      }
    }

    if (node.type === NodeType.SCHEMA && !node.loaded) {
      await this._loadTablesForSchema(node, node.data.schema);
    }

    if (node.type === NodeType.SCHEMA_GROUP && !node.loaded) {
      // Already loaded from parent
    }

    if (node.type === NodeType.TABLE_GROUP && !node.loaded) {
      // Already loaded from parent
    }

    if (node.type === NodeType.ROLE_GROUP && !node.loaded) {
      // Already loaded from parent
    }

    node.expanded = true;
    this._rebuildFlat();
  }

  collapseNode(node) {
    if (node.isLeaf || node.type === NodeType.SERVER) return;
    node.expanded = false;
    this._rebuildFlat();
    // Make sure cursor is still on a visible node
    if (this.cursor >= this.flatList.length) {
      this.cursor = this.flatList.length - 1;
    }
    // If cursor is on a child of the collapsed node, move to the node
    const cursorNode = this.flatList[this.cursor];
    if (cursorNode) {
      let p = cursorNode.parent;
      while (p) {
        if (p === node) {
          this.cursor = this.flatList.indexOf(node);
          break;
        }
        p = p.parent;
      }
    }
  }

  async _switchDatabase(dbNode) {
    // Reconnect the adapter to the new database
    const newConfig = { ...this.adapter.rawConfig };
    delete newConfig.type;
    if (newConfig.uri) {
      // Replace the database in the URI
      try {
        const url = new URL(newConfig.uri);
        url.pathname = '/' + dbNode.data.database;
        newConfig.uri = url.toString();
      } catch {
        newConfig.uri = newConfig.uri.replace(
          /\/[^/?]+/,
          '/' + dbNode.data.database
        );
      }
    } else {
      newConfig.database = dbNode.data.database;
    }

    const { createAdapter } = await import('./adapters/index.js');
    const newAdapter = createAdapter(this.connInfo.type);
    await newAdapter.connect(newConfig);

    // Swap old adapter out
    await this.adapter.disconnect();
    this.adapter = newAdapter;
    this.connInfo = newAdapter.connectionInfo;

    dbNode.data.needsSwitch = false;
    dbNode.data.switched = true;
    dbNode.loaded = false;
    await this._loadDbChildren(dbNode);
  }

  _rebuildFlat() {
    this.flatList = [];
    this._flatten(this.root);
  }

  _flatten(node) {
    if (node.type !== NodeType.SERVER) {
      this.flatList.push(node);
    }
    if (node.expanded) {
      for (const child of node.children) {
        this._flatten(child);
      }
    }
  }

  moveUp() {
    if (this.cursor > 0) this.cursor--;
  }

  moveDown() {
    if (this.cursor < this.flatList.length - 1) this.cursor++;
  }

  get selected() {
    return this.flatList[this.cursor] || null;
  }

  // ── Render tree into array of lines ─────────────────────

  renderLines(width) {
    const lines = [];
    this._renderNode(this.root, lines, '', true, width);
    return lines;
  }

  _renderNode(node, lines, prefix, isRoot, width) {
    if (isRoot) {
      // Render children of root directly
      const children = node.expanded ? node.children : [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const isLast = i === children.length - 1;
        this._renderChild(child, lines, '', isLast, width);
      }
      return;
    }
  }

  _renderChild(node, lines, prefix, isLast, width) {
    const branch = isLast ? '└─ ' : '├─ ';
    const isCursor = this.flatList[this.cursor] === node;

    let icon = '';
    if (this.ascii) {
      switch (node.type) {
        case NodeType.DATABASE:     icon = node.expanded ? '[+]' : '[-]'; break;
        case NodeType.SCHEMA_GROUP: icon = node.expanded ? 'v' : '>'; break;
        case NodeType.SCHEMA:       icon = node.expanded ? 'v' : '>'; break;
        case NodeType.TABLE_GROUP:  icon = node.expanded ? 'v' : '>'; break;
        case NodeType.TABLE:        icon = '#'; break;
        case NodeType.ROLE_GROUP:   icon = node.expanded ? 'v' : '>'; break;
        case NodeType.ROLE:         icon = '@'; break;
      }
    } else {
      switch (node.type) {
        case NodeType.DATABASE:     icon = node.expanded ? '📂' : '📁'; break;
        case NodeType.SCHEMA_GROUP: icon = node.expanded ? '▾' : '▸'; break;
        case NodeType.SCHEMA:       icon = node.expanded ? '▾' : '▸'; break;
        case NodeType.TABLE_GROUP:  icon = node.expanded ? '▾' : '▸'; break;
        case NodeType.TABLE:        icon = '⊞'; break;
        case NodeType.ROLE_GROUP:   icon = node.expanded ? '▾' : '▸'; break;
        case NodeType.ROLE:         icon = '👤'; break;
      }
    }

    let label = node.label;
    const isCurrent = node.type === NodeType.DATABASE && node.data.database === this.connInfo.database;

    if (isCurrent) label += ' ◀';

    // Build the line
    let line = `${prefix}${branch}${icon} ${label}`;

    if (isCursor) {
      line = chalk.bgCyan.black(padEnd(line, width));
    } else if (node.type === NodeType.TABLE) {
      line = `${chalk.dim(prefix + branch)}${icon} ${chalk.yellow(label)}`;
    } else if (node.type === NodeType.ROLE) {
      line = `${chalk.dim(prefix + branch)}${icon} ${chalk.magenta(label)}`;
    } else if (isCurrent) {
      line = `${chalk.dim(prefix + branch)}${icon} ${chalk.white.bold(node.label)} ${chalk.cyan('◀')}`;
    } else if (node.type === NodeType.DATABASE) {
      line = `${chalk.dim(prefix + branch)}${icon} ${chalk.white(label)}`;
    } else {
      line = `${chalk.dim(prefix + branch)}${chalk.cyan(icon)} ${chalk.bold.cyan(label)}`;
    }

    if (isCursor) {
      // Override styling for cursor
      const rawLabel = `${prefix}${branch}${icon} ${node.type === NodeType.DATABASE && isCurrent ? node.label + ' ◀' : label}`;
      line = chalk.bgCyan.black(padEnd(rawLabel, width));
    }

    lines.push(line);

    // Recurse into children if expanded
    if (node.expanded) {
      const childPrefix = prefix + (isLast ? '   ' : '│  ');
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const childIsLast = i === node.children.length - 1;
        this._renderChild(child, lines, childPrefix, childIsLast, width);
      }
    }
  }
}

// ── Helpers (pure functions) ─────────────────────────────────

export const visualWidth = (str) =>
  [...String(str).replace(/\x1b\[[0-9;]*m/g, '')].reduce((width, ch) => {
    const code = ch.codePointAt(0);
    const isWide =
      code > 0xFFFF ||
      (code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0xA4CF) ||
      (code >= 0xAC00 && code <= 0xD7AF) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFE10 && code <= 0xFE6F) ||
      (code >= 0xFF01 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6) ||
      (code >= 0x20000 && code <= 0x2FA1F);
    return width + (isWide ? 2 : 1);
  }, 0);

const padEnd = (str, len) => {
  const currentWidth = visualWidth(str);
  return currentWidth >= len ? str : str + ' '.repeat(len - currentWidth);
};
