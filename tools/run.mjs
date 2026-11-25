#!/usr/bin/env node
// Cross-platform task runner (Windows/macOS/Linux) so the project needs no Makefile or shell scripts.
//   node tools/run.mjs setup | dev | start | lint | test | test-coverage
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');
const win = process.platform === 'win32';
const venvPython = path.join(backend, '.venv', win ? 'Scripts/python.exe' : 'bin/python');
const envFile = path.join(root, '.env');
const npm = win ? 'npm.cmd' : 'npm';

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: win && cmd === npm, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const needVenv = () => {
  if (!fs.existsSync(venvPython)) { console.error('No backend/.venv yet. Run: npm run setup'); process.exit(1); }
};
const py = (args, opts = {}) => { needVenv(); run(venvPython, args, { cwd: backend, ...opts }); };
const uvicorn = ['-m', 'uvicorn', 'app.main:app', ...(fs.existsSync(envFile) ? ['--env-file', envFile] : [])];

const tasks = {
  setup() {
    const sysPython = process.env.PYTHON || (win ? 'python' : 'python3');
    if (!fs.existsSync(venvPython)) run(sysPython, ['-m', 'venv', '.venv'], { cwd: backend });
    py(['-m', 'pip', 'install', '-q', '-r', 'requirements-dev.txt']);
    run(npm, ['--prefix', 'frontend', 'install', '--no-audit', '--no-fund']);
    if (!fs.existsSync(envFile)) console.log('\nNext: copy .env.example to .env and set DATABASE_URL.');
  },
  dev() { // API on :8000 (reload) + `ng serve` on :4200 proxying /api -> :8000. Open http://localhost:4200
    needVenv();
    const kids = [
      spawn(venvPython, [...uvicorn, '--reload', '--port', '8000'], { cwd: backend, stdio: 'inherit' }),
      spawn(npm, ['--prefix', 'frontend', 'start'], { stdio: 'inherit', shell: win }),
    ];
    const stop = () => kids.forEach((k) => k.kill());
    process.on('SIGINT', () => { stop(); process.exit(0); });
    kids.forEach((k) => k.on('exit', (code) => { stop(); process.exit(code ?? 0); }));
  },
  start() { // production-like: serves the built frontend (run `npm run build` first)
    py([...uvicorn, '--host', '0.0.0.0', '--port', process.env.PORT || '8000']);
  },
  lint() {
    py(['-m', 'ruff', 'check', '.']);
  },
  test() {
    py(['-m', 'pytest', '--no-cov']);
    run(npm, ['--prefix', 'frontend', 'test']);
  },
  'test-coverage'() {
    py(['-m', 'pytest']); // thresholds from backend/pyproject.toml
    run(npm, ['--prefix', 'frontend', 'run', 'test:coverage']); // thresholds from frontend/angular.json
  },
};

const task = tasks[process.argv[2]];
if (!task) { console.error(`Usage: node tools/run.mjs <${Object.keys(tasks).join('|')}>`); process.exit(2); }
task();
