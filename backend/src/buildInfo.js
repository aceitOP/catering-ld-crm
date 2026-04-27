'use strict';

const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readFrontendVersion() {
  try {
    const changelogPath = path.join(__dirname, '../../frontend/src/data/changelog.js');
    const raw = fs.readFileSync(changelogPath, 'utf8');
    const match = raw.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function getBuildInfo() {
  const backendPkg = readJson(path.join(__dirname, '../package.json'));
  const frontendPkg = readJson(path.join(__dirname, '../../frontend/package.json'));
  const frontendAppVersion = readFrontendVersion();

  return {
    backend_version: backendPkg?.version || '0.0.0',
    frontend_package_version: frontendPkg?.version || '0.0.0',
    frontend_app_version: frontendAppVersion || frontendPkg?.version || '0.0.0',
    node_env: process.env.NODE_ENV || 'development',
    render_service: process.env.RENDER_SERVICE_NAME || null,
    render_git_commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
  };
}

module.exports = { getBuildInfo };
