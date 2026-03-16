const { query } = require('./db');

/**
 * Vytvoří notifikaci. Chyby loguje, ale nevyhazuje – nesmí přerušit hlavní request.
 * @param {object} opts
 * @param {string} opts.typ      – nova_zakazka | nova_nabidka | nova_klient | nova_poptavka | termin | system
 * @param {string} opts.titulek – krátký titulek (max ~80 znaků)
 * @param {string} [opts.zprava] – delší popis
 * @param {string} [opts.odkaz]  – URL pro přesměrování (např. /zakazky/42)
 */
async function createNotif({ typ = 'system', titulek, zprava = null, odkaz = null }) {
  try {
    await query(
      'INSERT INTO notifikace (typ, titulek, zprava, odkaz) VALUES ($1,$2,$3,$4)',
      [typ, titulek, zprava, odkaz]
    );
  } catch (err) {
    console.error('[notif] Chyba při vytváření notifikace:', err.message);
  }
}

module.exports = { createNotif };
