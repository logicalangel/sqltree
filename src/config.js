import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.sqltree');
const CONFIG_FILE = join(CONFIG_DIR, 'connections.json');
const SETTINGS_FILE = join(CONFIG_DIR, 'config.json');

// ── Settings ────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  pageSize: 25,
  ascii: false,
  timeout: 10000,
  ssl: false,
  keyBindings: {},
};

export function loadSettings() {
  try {
    if (!existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS };
    const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      keyBindings: { ...DEFAULT_SETTINGS.keyBindings, ...(raw.keyBindings || {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

export function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}

// ── Connections ─────────────────────────────────────────────

export function loadConnections() {
  try {
    if (!existsSync(CONFIG_FILE)) return [];
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export function saveConnection(name, config) {
  const connections = loadConnections();
  const existing = connections.findIndex(c => c.name === name);
  const entry = { name, ...config };

  if (existing >= 0) {
    connections[existing] = entry;
  } else {
    connections.push(entry);
  }

  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(connections, null, 2), { mode: 0o600 });
}

export function deleteConnection(name) {
  const connections = loadConnections().filter(c => c.name !== name);
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(connections, null, 2), { mode: 0o600 });
}
