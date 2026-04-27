require('dotenv').config();

// Fail fast if critical env vars are missing
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('❌  JWT_SECRET není nastaven nebo je příliš krátký (min. 32 znaků). Server se nespustí.');
  process.exit(1);
}

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');
const fs      = require('fs');
const { initDb } = require('./initDb');
const { startBackupScheduler } = require('./backupScheduler');
const { startNotificationRuleScheduler } = require('./notificationRules');
const { startVoucherExpirationScheduler } = require('./voucherScheduler');
const { logAppError } = require('./errorLog');
const { requireAppModule } = require('./moduleAccess');
const { getBuildInfo } = require('./buildInfo');
const { getInitState } = require('./initState');
const { query } = require('./db');
const {
  initSentry,
  registerSentryProcessHandlers,
  captureBackendException,
  isSentryEnabled,
} = require('./sentry');

initSentry();
registerSentryProcessHandlers();
const app = express();

// ── Middleware ───────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use((req, _res, next) => {
  req.monitoring = { sentryEnabled: isSentryEnabled() };
  next();
});

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/client-auth', require('./routes/clientAuth'));
app.use('/api/client-portal', require('./routes/clientPortal'));
app.use('/api/klienti',    require('./routes/klienti'));
app.use('/api/zakazky',    require('./routes/zakazky'));
app.use('/api/venues',     require('./routes/venues'));
app.use('/api/nabidky',    require('./routes/nabidky'));
app.use('/api/kalkulace',  require('./routes/kalkulace'));
app.use('/api/personal',   requireAppModule('personal'), require('./routes/personal'));
app.use('/api/dokumenty',  requireAppModule('dokumenty'), require('./routes/dokumenty'));
app.use('/api/cenik',      requireAppModule('cenik'), require('./routes/cenik'));
app.use('/api/ingredients', requireAppModule('cenik'), require('./routes/ingredients'));
app.use('/api/recipes', requireAppModule('cenik'), require('./routes/recipes'));
app.use('/api/vouchers', require('./routes/vouchers'));
app.use('/api/uzivatele',  require('./routes/uzivatele'));
app.use('/api/nastaveni',  require('./routes/nastaveni'));
app.use('/api/kalendar',   requireAppModule('kalendar'), require('./routes/kalendar'));
app.use('/api/reporty',    requireAppModule('reporty'), require('./routes/reporty'));
app.use('/api/notifikace', require('./routes/notifikace'));
app.use('/api/notification-rules', require('./routes/notificationRules'));
app.use('/api/tally',           require('./routes/tally'));
app.use('/api/google-calendar', requireAppModule('kalendar'), require('./routes/google'));
app.use('/api/faktury',         requireAppModule('faktury'), require('./routes/faktury'));
app.use('/api/production',      require('./routes/production'));
app.use('/api/proposals',       require('./routes/proposals'));
app.use('/api/pub/proposals',   require('./routes/publicProposals'));
app.use('/api/archiv',          requireAppModule('archiv'), require('./routes/archiv'));
app.use('/api/sablony',         requireAppModule('sablony'), require('./routes/sablony'));
app.use('/api/followup',        require('./routes/followup'));
app.use('/api/kapacity',        requireAppModule('kalendar'), require('./routes/kapacity'));
app.use('/api/email',           requireAppModule('email'), require('./routes/email'));
app.use('/api/error-log',       requireAppModule('error_log'), require('./routes/errorLog'));
app.use('/api/backup',          require('./routes/backup'));
app.use('/api/login-log',       require('./routes/loginLog'));

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const build = getBuildInfo();
  const init = getInitState();
  let db = { ready: false };

  try {
    await query('SELECT 1');
    db = { ready: true };
  } catch (err) {
    db = { ready: false, error: err.message };
  }

  const ready = Boolean(init.ready) && Boolean(db.ready);
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    version: build.frontend_app_version,
    backend_version: build.backend_version,
    frontend_version: build.frontend_app_version,
    environment: build.node_env,
    render_service: build.render_service,
    render_git_commit: build.render_git_commit,
    monitoring: {
      sentry_enabled: isSentryEnabled(),
    },
    init,
    db,
    ready,
  });
});

// ── Frontend SPA (production) ─────────────────────────────────
const frontendDist  = path.join(__dirname, '../../frontend/dist');
const indexHtml     = path.join(frontendDist, 'index.html');
const indexHtmlExists = fs.existsSync(indexHtml); // cache at startup
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (indexHtmlExists) {
    res.sendFile(indexHtml);
  } else {
    next();
  }
});

// ── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint nenalezen' });
});

// ── Error handler ────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  if (status >= 500) {
    captureBackendException(err, _req, { status });
    logAppError(err, _req);
  }
  res.status(status).json({
    error: err.message || 'Interní chyba serveru',
  });
});

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

initDb().then(() => {
  startBackupScheduler();
  startNotificationRuleScheduler();
  startVoucherExpirationScheduler();
  app.listen(PORT, () => {
    const build = getBuildInfo();
    console.log(`✅  Catering LD API běží na portu ${PORT}`);
    console.log(`   Prostředí: ${process.env.NODE_ENV || 'development'} · verze ${build.frontend_app_version}`);
  });
}).catch((err) => {
  console.error('❌  Chyba při startu serveru:', err.message);
  process.exit(1);
});
