#!/usr/bin/env node
/**
 * Copies ../twilic/runtimes/javascript/wasm/pkg into explorer/wasm/pkg so TypeScript + Vite can resolve
 * `import "*.wasm"` from inside this workspace (runs before `tsc -b` during `bun run build`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const explorerDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.resolve(explorerDir, '..', 'twilic', 'runtimes', 'javascript', 'wasm', 'pkg');
const dest = path.join(explorerDir, 'wasm', 'pkg');

if (!fs.existsSync(source)) {
  console.error(`[sync-twilic-wasm] Missing ${source}`);
  console.error(`  Build WASM in twilic/runtimes/javascript first: bun run build:wasm`);
  process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });
fs.cpSync(source, dest, { recursive: true });
