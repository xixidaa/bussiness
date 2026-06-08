import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const clientVitePath = path.resolve(rootDir, '../client/node_modules/vite/package.json');

if (existsSync(clientVitePath)) {
  process.exit(0);
}

const result = spawnSync('npm', ['install', '--prefix', 'client'], {
  stdio: 'inherit',
  shell: true
});

process.exit(result.status ?? 1);
