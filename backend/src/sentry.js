'use strict';

const Sentry = require('@sentry/node');
const { getBuildInfo } = require('./buildInfo');

let initialized = false;
let processHandlersRegistered = false;

function getSentryConfig() {
  const dsn = process.env.SENTRY_DSN || '';
  const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0);
  const build = getBuildInfo();

  return {
    enabled: Boolean(dsn),
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || build.node_env,
    release: `${build.frontend_app_version}+backend.${build.backend_version}`,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0,
  };
}

function initSentry() {
  const config = getSentryConfig();
  if (!config.enabled || initialized) {
    return config;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate,
    sendDefaultPii: false,
  });

  initialized = true;
  return config;
}

function registerSentryProcessHandlers() {
  const config = getSentryConfig();
  if (!config.enabled || processHandlersRegistered) {
    return;
  }

  process.on('unhandledRejection', (reason) => {
    captureBackendException(reason instanceof Error ? reason : new Error(String(reason)), null, {
      source: 'unhandledRejection',
    });
  });

  process.on('uncaughtException', (error) => {
    captureBackendException(error, null, { source: 'uncaughtException' });
  });

  processHandlersRegistered = true;
}

function captureBackendException(error, req, extra = {}) {
  const config = getSentryConfig();
  if (!config.enabled) return null;

  return Sentry.withScope((scope) => {
    if (req) {
      scope.setContext('request', {
        method: req.method,
        url: req.originalUrl || req.url,
        query: req.query,
        params: req.params,
      });
      scope.setUser(req.user ? {
        id: String(req.user.id),
        email: req.user.email || undefined,
        role: req.user.role || undefined,
      } : null);
      scope.setTag('http.method', req.method);
      scope.setTag('http.path', req.route?.path || req.path || req.originalUrl || 'unknown');
    }

    Object.entries(extra || {}).forEach(([key, value]) => {
      if (value !== undefined) scope.setExtra(key, value);
    });

    return Sentry.captureException(error);
  });
}

function isSentryEnabled() {
  return getSentryConfig().enabled;
}

module.exports = {
  initSentry,
  registerSentryProcessHandlers,
  captureBackendException,
  isSentryEnabled,
  getSentryConfig,
};
