'use strict';

const { getClientPortalSession, touchClientPortalSession, resolveClientPortalScope } = require('../clientPortalService');

async function clientPortalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Přístup odepřen - chybí klientský token.' });
  }

  try {
    const token = header.slice(7);
    const session = await getClientPortalSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Klientská session vypršela nebo není platná.' });
    }

    const scope = await resolveClientPortalScope(session.email);
    if (!scope.clients.length && !scope.zakazky.length) {
      return res.status(403).json({ error: 'K tomuto klientskému e-mailu nejsou navázaná žádná data.' });
    }

    await touchClientPortalSession(session.id);
    req.clientPortal = {
      sessionId: session.id,
      email: session.email,
      scope,
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  clientPortalAuth,
};
