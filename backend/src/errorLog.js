const { query } = require('./db');

const SENSITIVE_KEYS = new Set([
  'heslo',
  'nove_heslo',
  'stare_heslo',
  'hesloZnovu',
  'password',
  'token',
  'authorization',
  'smtp_pass',
  'email_imap_pass',
]);

function truncate(value, max = 4000) {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalizeStack(err) {
  if (!err?.stack) return null;
  return truncate(err.stack, 12000);
}

function sanitizeValue(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, innerValue]) => [
      key,
      SENSITIVE_KEYS.has(String(key).toLowerCase())
        ? '[redacted]'
        : sanitizeValue(innerValue, depth + 1),
    ])
  );
}

async function logAppError(err, req) {
  try {
    const statusCode = err?.status || err?.statusCode || 500;
    const payload = {
      method: req?.method || null,
      path: req?.originalUrl || req?.url || null,
      statusCode,
      message: truncate(err?.message || 'Neznama chyba'),
      stack: normalizeStack(err),
      source: req ? 'http' : 'system',
      userId: req?.user?.id || null,
      ipAddress: req?.ip || null,
      userAgent: truncate(req?.get?.('user-agent'), 1000),
      meta: req ? {
        params: sanitizeValue(req.params),
        query: sanitizeValue(req.query),
        body: sanitizeValue(req.body),
      } : null,
    };

    await query(
      `INSERT INTO error_logs (
        source, method, path, status_code, error_message, stack_trace,
        user_id, ip_address, user_agent, meta
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        payload.source,
        payload.method,
        payload.path,
        payload.statusCode,
        payload.message,
        payload.stack,
        payload.userId,
        payload.ipAddress,
        payload.userAgent,
        payload.meta ? JSON.stringify(payload.meta) : null,
      ]
    );
  } catch (logErr) {
    console.error('[error-log] Nepodarilo se ulozit chybu:', logErr.message);
  }
}

async function logUserReport(payload = {}) {
  try {
    await query(
      `INSERT INTO error_logs (
        source, method, path, status_code, error_message, stack_trace,
        user_id, ip_address, user_agent, meta
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        'user_report',
        'REPORT',
        payload.path || null,
        0,
        truncate(payload.message || 'Uzivatel nahlasil chybu', 1000),
        null,
        payload.userId || null,
        payload.ipAddress || null,
        truncate(payload.userAgent, 1000),
        payload.meta ? JSON.stringify(sanitizeValue(payload.meta)) : null,
      ]
    );
  } catch (logErr) {
    console.error('[error-log] Nepodarilo se ulozit hlaseni uzivatele:', logErr.message);
  }
}

module.exports = { logAppError, logUserReport };
