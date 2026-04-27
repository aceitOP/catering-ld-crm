'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const backendSrc = path.join(repoRoot, 'backend/src');
const frontendRoot = path.join(repoRoot, 'frontend');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...(options.env || {}) },
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function getJsFiles(dir) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...getJsFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) result.push(fullPath);
  }
  return result;
}

function runBackendSyntaxChecks() {
  const files = getJsFiles(backendSrc);
  for (const file of files) {
    run(process.execPath, ['--check', file]);
  }
}

function main() {
  console.log('== Backend syntax ==');
  runBackendSyntaxChecks();

  console.log('\n== Frontend build ==');
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: frontendRoot });

  console.log('\n== Smoke tests ==');
  run(process.execPath, ['backend/scripts/system-test.js'], { cwd: repoRoot });
  run(process.execPath, ['backend/scripts/security-test.js'], { cwd: repoRoot });
  run(process.execPath, ['backend/scripts/regression-test.js'], { cwd: repoRoot });

  console.log('\nRelease check passed');
}

main();
