import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const server = spawn(process.execPath, [path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'), '--host', '127.0.0.1'], { stdio: 'inherit' });
let desktop;
const close = () => { desktop?.kill(); server.kill(); };
process.on('SIGINT', close);
process.on('SIGTERM', close);
for (let attempt = 0; attempt < 60; attempt++) {
  try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch { /* vite is starting */ }
  await new Promise(resolve => setTimeout(resolve, 250));
}
desktop = spawn(require('electron'), ['.', '--dev'], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } });
desktop.on('exit', () => { server.kill(); });
