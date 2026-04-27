'use strict';

const crypto = require('crypto');
const { query, withTransaction } = require('./db');

const MAGIC_LINK_TTL_MINUTES = parseInt(process.env.CLIENT_MAGIC_LINK_TTL_MINUTES || '30', 10);
const CLIENT_SESSION_TTL_HOURS = parseInt(process.env.CLIENT_PORTAL_SESSION_TTL_HOURS || '72', 10);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function resolveClientPortalScope(email) {
  const emailNorm = normalizeEmail(email);
  if (!emailNorm) {
    return { email: '', clients: [], clientIds: [], zakazky: [], zakazkaIds: [] };
  }

  const clientsResult = await query(
    `
      SELECT id, jmeno, prijmeni, firma, email, telefon
      FROM klienti
      WHERE LOWER(email) = $1
      ORDER BY firma NULLS LAST, prijmeni NULLS LAST, jmeno NULLS LAST
    `,
    [emailNorm]
  );

  const zakazkyResult = await query(
    `
      SELECT DISTINCT
        z.id,
        z.cislo,
        z.nazev,
        z.typ,
        z.stav,
        z.datum_akce,
        z.cas_zacatek,
        z.cas_konec,
        z.misto,
        z.pocet_hostu,
        z.cena_celkem,
        z.created_at,
        z.updated_at,
        k.id AS klient_id,
        k.firma AS klient_firma,
        k.jmeno AS klient_jmeno,
        k.prijmeni AS klient_prijmeni,
        v.name AS venue_name
      FROM zakazky z
      JOIN klienti k ON k.id = z.klient_id
      LEFT JOIN venues v ON v.id = z.venue_id
      WHERE LOWER(k.email) = $1
      ORDER BY z.datum_akce DESC NULLS LAST, z.created_at DESC
    `,
    [emailNorm]
  );

  return {
    email: emailNorm,
    clients: clientsResult.rows,
    clientIds: clientsResult.rows.map((row) => row.id),
    zakazky: zakazkyResult.rows,
    zakazkaIds: zakazkyResult.rows.map((row) => row.id),
  };
}

function hasClientPortalAccess(scope) {
  return Boolean(scope?.clients?.length || scope?.zakazky?.length);
}

async function createClientMagicLink(email, meta = {}) {
  const emailNorm = normalizeEmail(email);
  if (!emailNorm) return null;

  const scope = await resolveClientPortalScope(emailNorm);
  if (!hasClientPortalAccess(scope)) return null;

  const token = generateOpaqueToken(32);
  const tokenHash = hashToken(token);

  await query(
    `
      INSERT INTO client_magic_links (email, token_hash, expires_at, requested_ip, requested_ua)
      VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval, $4, $5)
    `,
    [
      emailNorm,
      tokenHash,
      String(MAGIC_LINK_TTL_MINUTES),
      meta.ip || null,
      meta.userAgent || null,
    ]
  );

  return { token, email: emailNorm, scope };
}

async function consumeClientMagicLink(token, meta = {}) {
  const tokenHash = hashToken(token);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `
        SELECT id, email
        FROM client_magic_links
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
        FOR UPDATE
      `,
      [tokenHash]
    );

    const link = rows[0];
    if (!link) {
      const error = new Error('Magic link je neplatný nebo už expiroval.');
      error.status = 400;
      throw error;
    }

    await client.query(
      'UPDATE client_magic_links SET used_at = NOW() WHERE id = $1',
      [link.id]
    );

    const sessionToken = generateOpaqueToken(40);
    const sessionHash = hashToken(sessionToken);
    await client.query(
      `
        INSERT INTO client_portal_sessions (
          email, token_hash, source_link_id, expires_at, created_ip, created_ua, last_used_at
        )
        VALUES ($1, $2, $3, NOW() + ($4 || ' hours')::interval, $5, $6, NOW())
      `,
      [
        link.email,
        sessionHash,
        link.id,
        String(CLIENT_SESSION_TTL_HOURS),
        meta.ip || null,
        meta.userAgent || null,
      ]
    );

    return {
      token: sessionToken,
      email: link.email,
      expires_in_hours: CLIENT_SESSION_TTL_HOURS,
    };
  });
}

async function getClientPortalSession(sessionToken) {
  const tokenHash = hashToken(sessionToken);
  const { rows } = await query(
    `
      SELECT id, email, expires_at, revoked_at
      FROM client_portal_sessions
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash]
  );
  return rows[0] || null;
}

async function touchClientPortalSession(sessionId) {
  await query(
    'UPDATE client_portal_sessions SET last_used_at = NOW() WHERE id = $1',
    [sessionId]
  );
}

async function loadClientPortalDashboard(email) {
  const scope = await resolveClientPortalScope(email);
  if (!hasClientPortalAccess(scope)) {
    return {
      scope,
      proposals: [],
      dokumenty: [],
      faktury: [],
      timeline: [],
    };
  }

  const proposalsResult = await query(
    `
      SELECT
        p.id,
        p.token,
        p.nazev,
        p.status,
        p.total_price,
        p.expires_at,
        p.created_at,
        z.id AS zakazka_id,
        z.cislo AS zakazka_cislo,
        z.nazev AS zakazka_nazev
      FROM proposals p
      JOIN zakazky z ON z.id = p.zakazka_id
      JOIN klienti k ON k.id = z.klient_id
      WHERE LOWER(k.email) = $1
      ORDER BY p.created_at DESC
    `,
    [scope.email]
  );

  const dokumentyResult = await query(
    `
      SELECT
        d.id,
        d.nazev,
        d.kategorie,
        d.created_at,
        d.zakazka_id,
        d.klient_id,
        z.cislo AS zakazka_cislo,
        z.nazev AS zakazka_nazev
      FROM dokumenty d
      LEFT JOIN zakazky z ON z.id = d.zakazka_id
      WHERE d.klient_id = ANY($1::int[])
         OR d.zakazka_id = ANY($2::int[])
      ORDER BY d.created_at DESC
    `,
    [scope.clientIds, scope.zakazkaIds]
  );

  const fakturyResult = await query(
    `
      SELECT
        f.id,
        f.cislo,
        f.stav,
        f.datum_vystaveni,
        f.datum_splatnosti,
        f.datum_zaplaceni,
        f.cena_celkem,
        f.klient_id,
        f.zakazka_id,
        z.cislo AS zakazka_cislo,
        z.nazev AS zakazka_nazev
      FROM faktury f
      LEFT JOIN zakazky z ON z.id = f.zakazka_id
      WHERE f.klient_id = ANY($1::int[])
         OR f.zakazka_id = ANY($2::int[])
      ORDER BY f.created_at DESC
    `,
    [scope.clientIds, scope.zakazkaIds]
  );

  const timeline = scope.zakazky
    .map((zakazka) => ({
      id: zakazka.id,
      cislo: zakazka.cislo,
      nazev: zakazka.nazev,
      datum_akce: zakazka.datum_akce,
      stav: zakazka.stav,
      typ: zakazka.typ,
      venue_name: zakazka.venue_name,
    }))
    .sort((a, b) => {
      const ad = a.datum_akce ? new Date(a.datum_akce).getTime() : 0;
      const bd = b.datum_akce ? new Date(b.datum_akce).getTime() : 0;
      return bd - ad;
    });

  return {
    scope,
    proposals: proposalsResult.rows.map((row) => ({
      ...row,
      url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/nabidka/${row.token}`,
    })),
    dokumenty: dokumentyResult.rows,
    faktury: fakturyResult.rows,
    timeline,
  };
}

async function assertClientPortalZakazkaAccess(email, zakazkaId) {
  const { rows } = await query(
    `
      SELECT z.id
      FROM zakazky z
      JOIN klienti k ON k.id = z.klient_id
      WHERE z.id = $1
        AND LOWER(k.email) = $2
      LIMIT 1
    `,
    [zakazkaId, normalizeEmail(email)]
  );

  if (!rows[0]) {
    const error = new Error('Zakázka v klientském portálu nebyla nalezena.');
    error.status = 404;
    throw error;
  }
}

async function loadClientPortalZakazka(email, zakazkaId) {
  await assertClientPortalZakazkaAccess(email, zakazkaId);

  const { rows } = await query(
    `
      SELECT
        z.*,
        k.jmeno AS klient_jmeno,
        k.prijmeni AS klient_prijmeni,
        k.firma AS klient_firma,
        k.email AS klient_email,
        k.telefon AS klient_telefon,
        v.name AS venue_name,
        v.address_line_1 AS venue_address_line_1,
        v.address_line_2 AS venue_address_line_2,
        v.city AS venue_city
      FROM zakazky z
      JOIN klienti k ON k.id = z.klient_id
      LEFT JOIN venues v ON v.id = z.venue_id
      WHERE z.id = $1
      LIMIT 1
    `,
    [zakazkaId]
  );

  const zakazka = rows[0];
  const [dokumenty, faktury, proposals] = await Promise.all([
    query(
      `
        SELECT id, nazev, kategorie, created_at
        FROM dokumenty
        WHERE zakazka_id = $1
        ORDER BY created_at DESC
      `,
      [zakazkaId]
    ),
    query(
      `
        SELECT id, cislo, stav, datum_vystaveni, datum_splatnosti, datum_zaplaceni, cena_celkem
        FROM faktury
        WHERE zakazka_id = $1
        ORDER BY created_at DESC
      `,
      [zakazkaId]
    ),
    query(
      `
        SELECT id, token, nazev, status, total_price, expires_at, created_at
        FROM proposals
        WHERE zakazka_id = $1
        ORDER BY created_at DESC
      `,
      [zakazkaId]
    ),
  ]);

  return {
    ...zakazka,
    dokumenty: dokumenty.rows,
    faktury: faktury.rows,
    proposals: proposals.rows.map((row) => ({
      ...row,
      url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/nabidka/${row.token}`,
    })),
  };
}

module.exports = {
  MAGIC_LINK_TTL_MINUTES,
  CLIENT_SESSION_TTL_HOURS,
  normalizeEmail,
  hashToken,
  createClientMagicLink,
  consumeClientMagicLink,
  getClientPortalSession,
  touchClientPortalSession,
  resolveClientPortalScope,
  loadClientPortalDashboard,
  loadClientPortalZakazka,
  assertClientPortalZakazkaAccess,
};
