require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');

const app = express();

// ── Middleware ───────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Statické soubory (nahrané dokumenty)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/klienti',    require('./routes/klienti'));
app.use('/api/zakazky',    require('./routes/zakazky'));
app.use('/api/nabidky',    require('./routes/nabidky'));
app.use('/api/kalkulace',  require('./routes/kalkulace'));
app.use('/api/personal',   require('./routes/personal'));
app.use('/api/dokumenty',  require('./routes/dokumenty'));
app.use('/api/cenik',      require('./routes/cenik'));
app.use('/api/uzivatele',  require('./routes/uzivatele'));
app.use('/api/nastaveni',  require('./routes/nastaveni'));
app.use('/api/kalendar',   require('./routes/kalendar'));

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() });
});

// ── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint nenalezen' });
});

// ── Error handler ────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Interní chyba serveru',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅  Catering LD API běží na portu ${PORT}`);
  console.log(`   Prostředí: ${process.env.NODE_ENV || 'development'}`);
});
