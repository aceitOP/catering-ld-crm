'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  createClientMagicLink,
  consumeClientMagicLink,
  MAGIC_LINK_TTL_MINUTES,
  CLIENT_SESSION_TTL_HOURS,
} = require('../clientPortalService');
const { loadFirmaSettings } = require('../firmaSettings');
const { sendClientPortalMagicLink } = require('../emailService');

const router = express.Router();

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Příliš mnoho žádostí o klientský odkaz. Zkuste to prosím později.' },
});

const consumeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Příliš mnoho pokusů o přihlášení přes magic link. Zkuste to prosím později.' },
});

function getIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
}

router.post('/request-link', requestLimiter, async (req, res, next) => {
  try {
    const email = req.body?.email;
    if (!String(email || '').trim()) {
      return res.status(400).json({ error: 'E-mail je povinný.' });
    }

    const link = await createClientMagicLink(email, {
      ip: getIp(req),
      userAgent: req.headers['user-agent'] || null,
    });

    if (link) {
      const firma = await loadFirmaSettings();
      const frontendBaseUrl = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:5173';
      const magicUrl = new URL('/portal/auth', frontendBaseUrl);
      magicUrl.searchParams.set('token', link.token);
      await sendClientPortalMagicLink({
        to: link.email,
        magicUrl: magicUrl.toString(),
        firma,
        expiresInMinutes: MAGIC_LINK_TTL_MINUTES,
      });
    }

    res.json({
      message: 'Pokud je tento e-mail navázaný na klientská data, poslali jsme přihlašovací odkaz.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/consume-link', consumeLimiter, async (req, res, next) => {
  try {
    const token = req.body?.token;
    if (!String(token || '').trim()) {
      return res.status(400).json({ error: 'Token magic linku je povinný.' });
    }

    const session = await consumeClientMagicLink(token, {
      ip: getIp(req),
      userAgent: req.headers['user-agent'] || null,
    });

    res.json({
      token: session.token,
      email: session.email,
      expires_in_hours: CLIENT_SESSION_TTL_HOURS,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
