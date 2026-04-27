import * as Sentry from '@sentry/react';
import { APP_VERSION } from './data/changelog';

let initialized = false;

function parseSampleRate(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getFrontendSentryConfig() {
  const dsn = import.meta.env.VITE_SENTRY_DSN || '';

  return {
    enabled: Boolean(dsn),
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'development',
    release: `frontend@${APP_VERSION}`,
    tracesSampleRate: parseSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0),
  };
}

export function initFrontendSentry() {
  const config = getFrontendSentryConfig();
  if (!config.enabled || initialized) {
    return config;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate,
    integrations: [Sentry.browserTracingIntegration()],
    sendDefaultPii: false,
  });

  initialized = true;
  return config;
}

export function captureFrontendException(error, context = {}) {
  const config = getFrontendSentryConfig();
  if (!config.enabled) return null;

  return Sentry.withScope((scope) => {
    Object.entries(context || {}).forEach(([key, value]) => {
      if (value !== undefined) {
        scope.setExtra(key, value);
      }
    });
    return Sentry.captureException(error);
  });
}

export function setFrontendSentryUser(user) {
  if (!getFrontendSentryConfig().enabled) return;
  Sentry.setUser(user ? {
    id: String(user.id),
    email: user.email || undefined,
    username: user.jmeno || user.name || undefined,
    role: user.role || undefined,
  } : null);
}

export function clearFrontendSentryUser() {
  if (!getFrontendSentryConfig().enabled) return;
  Sentry.setUser(null);
}

export function isFrontendSentryEnabled() {
  return getFrontendSentryConfig().enabled;
}
