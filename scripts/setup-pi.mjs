#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const piDir = join(rootDir, 'pi');
const desktopDir = join(rootDir, 'desktop');

const { values } = parseArgs({
  options: {
    pull: { type: 'boolean', default: false },
    'pack-only': { type: 'boolean', default: false },
    offline: { type: 'boolean', default: false },
  },
});

function run(cmd, args, cwd) {
  console.log(`\n> [${cwd}] ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

if (!existsSync(join(piDir, 'package.json'))) {
  console.error('pi/ submodule is not initialized. Run: git submodule update --init --recursive');
  process.exit(1);
}

if (values.pull) {
  run('git', ['-C', piDir, 'pull', '--ff-only'], rootDir);
}

if (!values['pack-only']) {
  run('npm', ['install', '--ignore-scripts'], piDir);
}

const packArgs = ['run', 'pack:packages', '--', '--out', '.artifacts/pi-packages', '--force'];
if (values.offline) {
  packArgs.push('--offline-model-data');
}
run('npm', packArgs, piDir);

run(
  'node',
  [
    join(piDir, 'scripts', 'use-local-packages.mjs'),
    '--manifest',
    join(piDir, '.artifacts', 'pi-packages', 'manifest.json'),
    '--consumer',
    desktopDir,
    '--package',
    '@earendil-works/pi-coding-agent',
    '--package',
    '@earendil-works/pi-ai',
    '--package',
    '@earendil-works/pi-agent-core',
  ],
  rootDir,
);

run('npm', ['install'], desktopDir);

// Ensure Electron & esbuild postinstall artifacts exist (handles npm allowScripts)
const electronInstall = join(desktopDir, 'node_modules', 'electron', 'install.js');
const electronPathTxt = join(desktopDir, 'node_modules', 'electron', 'path.txt');
if (existsSync(electronInstall) && !existsSync(electronPathTxt)) {
  run('node', [electronInstall], desktopDir);
  if (!existsSync(electronPathTxt) && process.platform === 'darwin') {
    const darwinBin = join(
      desktopDir,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron',
    );
    if (existsSync(darwinBin)) {
      writeFileSync(electronPathTxt, 'Electron.app/Contents/MacOS/Electron', 'utf-8');
    }
  }
}

const esbuildInstall = join(desktopDir, 'node_modules', 'esbuild', 'install.js');
if (existsSync(esbuildInstall)) {
  run('node', [esbuildInstall], desktopDir);
}

run('npm', ['run', 'build'], desktopDir);
console.log('\nShannon Desktop is ready. Start with: npm start (or npm run dev)');
