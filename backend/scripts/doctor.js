'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const backendDir = path.join(repoRoot, 'backend');
const frontendDir = path.join(repoRoot, 'frontend');
const backendEnvPath = path.join(backendDir, '.env');
const backendEnvExamplePath = path.join(backendDir, '.env.example');

function printSection(title) {
  console.log(`\n== ${title} ==`);
}

function printCheck(ok, label, detail) {
  const prefix = ok ? '[OK]' : '[FAIL]';
  console.log(`${prefix} ${label}${detail ? ` - ${detail}` : ''}`);
}

function runCommand(command, args) {
  try {
    return spawnSync(command, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
  } catch (error) {
    return { error };
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return acc;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    acc[key] = value;
    return acc;
  }, {});
}

async function checkHttp(url, expectedContentType) {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type') || '';
    return {
      ok: response.ok && (!expectedContentType || contentType.includes(expectedContentType)),
      status: response.status,
      contentType,
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function main() {
  let hasFailures = false;

  printSection('Docker');
  const docker = runCommand('docker', ['--version']);
  const dockerOk = !docker.error && docker.status === 0;
  printCheck(dockerOk, 'docker CLI', dockerOk ? docker.stdout.trim() : (docker.error?.message || docker.stderr || 'Docker neni dostupny'));
  if (!dockerOk) hasFailures = true;

  const compose = runCommand('docker', ['compose', 'version']);
  const composeOk = !compose.error && compose.status === 0;
  printCheck(composeOk, 'docker compose', composeOk ? compose.stdout.trim() : (compose.error?.message || compose.stderr || 'docker compose neni dostupny'));
  if (!composeOk) hasFailures = true;

  printSection('Repo files');
  const envExists = fs.existsSync(backendEnvPath);
  printCheck(envExists, 'backend/.env', envExists ? 'lokalni backend konfigurace existuje' : 'chybi, vytvorte kopii z backend/.env.example');
  if (!envExists) hasFailures = true;

  const envExampleExists = fs.existsSync(backendEnvExamplePath);
  printCheck(envExampleExists, 'backend/.env.example', envExampleExists ? 'nalezeno' : 'chybi');
  if (!envExampleExists) hasFailures = true;

  const frontendNodeModules = fs.existsSync(path.join(frontendDir, 'node_modules'));
  const backendNodeModules = fs.existsSync(path.join(backendDir, 'node_modules'));
  printCheck(frontendNodeModules, 'frontend/node_modules', frontendNodeModules ? 'nalezeno' : 'chybi');
  printCheck(backendNodeModules, 'backend/node_modules', backendNodeModules ? 'nalezeno' : 'chybi');

  printSection('Env sanity');
  const env = loadEnvFile(backendEnvPath);
  const jwt = env.JWT_SECRET || '';
  printCheck(jwt.length >= 32, 'JWT_SECRET', jwt ? `delka ${jwt.length}` : 'nenastaveno');
  if (envExists && jwt.length < 32) hasFailures = true;

  const frontendUrl = env.FRONTEND_URL || 'http://localhost:5173';
  const dbUrl = env.DATABASE_URL || '';
  printCheck(Boolean(frontendUrl), 'FRONTEND_URL', frontendUrl);
  printCheck(Boolean(dbUrl), 'DATABASE_URL', dbUrl || 'nenastaveno');
  if (envExists && !dbUrl) hasFailures = true;

  printSection('Local tooling');
  const viteExists = fs.existsSync(path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'));
  const frontendEslintExists = fs.existsSync(path.join(frontendDir, 'node_modules', 'eslint', 'bin', 'eslint.js'));
  const backendEslintExists = fs.existsSync(path.join(backendDir, 'node_modules', 'eslint', 'bin', 'eslint.js'));
  printCheck(viteExists, 'frontend vite binary', viteExists ? 'nalezeno' : 'chybi');
  printCheck(frontendEslintExists, 'frontend eslint binary', frontendEslintExists ? 'nalezeno' : 'chybi');
  printCheck(backendEslintExists, 'backend eslint binary', backendEslintExists ? 'nalezeno' : 'chybi');

  printSection('Running services');
  const health = await checkHttp(process.env.DOCTOR_API_URL || 'http://localhost:4000/api/health', 'application/json');
  printCheck(health.ok, 'backend /api/health', health.ok ? `HTTP ${health.status}` : (health.error || `HTTP ${health.status}`));

  const frontend = await checkHttp(process.env.DOCTOR_FRONTEND_URL || 'http://localhost/', 'text/html');
  printCheck(frontend.ok, 'frontend root', frontend.ok ? `HTTP ${frontend.status}` : (frontend.error || `HTTP ${frontend.status}`));

  console.log('');
  if (hasFailures) {
    console.log('Doctor finished with blockers. Fix the FAIL items before running Docker smoke audit.');
    process.exit(1);
  }

  console.log('Doctor finished without environment blockers.');
}

main().catch((error) => {
  console.error('Doctor failed unexpectedly:', error);
  process.exit(1);
});
