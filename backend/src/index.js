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
const { logAppError } = require('./errorLog');
const { requireAppModule } = require('./moduleAccess');

const app = express();

// ── Middleware ───────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/klienti',    require('./routes/klienti'));
app.use('/api/zakazky',    require('./routes/zakazky'));
app.use('/api/nabidky',    require('./routes/nabidky'));
app.use('/api/kalkulace',  require('./routes/kalkulace'));
app.use('/api/personal',   requireAppModule('personal'), require('./routes/personal'));
app.use('/api/dokumenty',  requireAppModule('dokumenty'), require('./routes/dokumenty'));
app.use('/api/cenik',      requireAppModule('cenik'), require('./routes/cenik'));
app.use('/api/uzivatele',  require('./routes/uzivatele'));
app.use('/api/nastaveni',  require('./routes/nastaveni'));
app.use('/api/kalendar',   requireAppModule('kalendar'), require('./routes/kalendar'));
app.use('/api/reporty',    requireAppModule('reporty'), require('./routes/reporty'));
app.use('/api/notifikace', require('./routes/notifikace'));
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
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() });
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
  app.listen(PORT, () => {
    console.log(`✅  Catering LD API běží na portu ${PORT}`);
    console.log(`   Prostředí: ${process.env.NODE_ENV || 'development'}`);
  });
}).catch((err) => {
  console.error('❌  Chyba při startu serveru:', err.message);
  process.exit(1);
});
