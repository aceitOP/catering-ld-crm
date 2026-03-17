/**
 * POST /api/tally/webhook
 * Webhook pro příjem poptávek z Tally.so formuláře.
 * Zabezpečení: volitelný API klíč v env TALLY_KEY (hlavička x-api-key).
 *
 * Tally payload: { data: { fields: [{ key, label, type, value }] } }
 */
const router    = require('express').Router();
const rateLimit = require('express-rate-limit');
const { query, withTransaction } = require('../db');
const { createNotif } = require('../notifHelper');
const { autoFollowup } = require('../followupHelper');
const { sendPotvrzeniPoptavky } = require('../emailService');

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuta
  max: 20,             // max 20 poptávek za minutu z jedné IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Příliš mnoho požadavků, zkuste to za chvíli' },
});

// Pomocník: najde hodnotu pole podle regex shody s label
function getField(fields, regex) {
  const f = fields.find(f => regex.test(f.label));
  if (!f) return null;
  // CHECKBOXES – Tally vrací array UUID; mapujeme přes options na text
  if (f.type === 'CHECKBOXES' && Array.isArray(f.value) && Array.isArray(f.options)) {
    const selected = f.options.filter(o => f.value.includes(o.id)).map(o => o.text);
    return selected[0] ?? null;
  }
  if (Array.isArray(f.value)) return f.value[0] ?? null;
  return f.value ?? null;
}

// Mapování textových hodnot typ_akce → DB enum
const TYP_MAP = {
  'svatb':      'svatba',
  'soukrom':    'soukroma_akce',
  'firemn':     'firemni_akce',
  'závoz':      'zavoz',
  'zavoz':      'zavoz',
  'bistro':     'bistro',
  'občerstv':   'bistro',       // "Pouze občerstvení"
  'obcerstv':   'bistro',       // fallback bez háčků
  'eventov':    'firemni_akce', // "Eventový prostor"
  'mobilní bar':'bistro',       // "Mobilní bar"
};

function mapTyp(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  for (const [key, val] of Object.entries(TYP_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

// Generátor čísla zakázky (identický s zakazky.js)
async function genCislo(client) {
  const rok = new Date().getFullYear();
  const { rows } = await client.query(
    `SELECT cislo FROM zakazky WHERE cislo LIKE $1 ORDER BY cislo DESC LIMIT 1`,
    [`ZAK-${rok}-%`]
  );
  if (!rows.length) return `ZAK-${rok}-001`;
  const last = parseInt(rows[0].cislo.split('-')[2], 10);
  return `ZAK-${rok}-${String(last + 1).padStart(3, '0')}`;
}

// POST /api/tally/webhook
router.post('/webhook', webhookLimiter, async (req, res, next) => {
  try {
    // Ověření API klíče
    const secret = process.env.TALLY_KEY;
    if (secret && req.headers['x-api-key'] !== secret) {
      return res.status(403).json({ error: 'Neplatný API klíč' });
    }

    const fields = req.body?.data?.fields;
    if (!Array.isArray(fields)) {
      return res.status(400).json({ error: 'Neplatný formát Tally payloadu (chybí data.fields)' });
    }

    // Parsování polí formuláře
    let jmeno    = getField(fields, /jm[eé]no/i);
    let prijmeni = getField(fields, /p[rř][íi]jmen/i);
    // Pokud oba regex trefily stejné kombinované pole "jméno a příjmení", rozděl podle mezery
    if (jmeno && prijmeni && jmeno === prijmeni) {
      const parts = jmeno.trim().split(/\s+/);
      jmeno    = parts[0] || null;
      prijmeni = parts.slice(1).join(' ') || null;
    }
    const email      = getField(fields, /e.?mail/i);
    const telefon    = getField(fields, /telefon|phone/i);
    const firma      = getField(fields, /firma|spole[cč]nost|company/i);
    const typRaw     = getField(fields, /typ\s*(akce)?|druh\s*(akce)?|type/i);
    const datumRaw   = getField(fields, /datum|date/i);
    const hostiRaw   = getField(fields, /host[ée]|po[cč]et\s*(host|osob)|guest|osob|person/i);
    const misto      = getField(fields, /m[ií]sto|venue|location/i);
    const rozpocetRaw= getField(fields, /rozpo[cč]et|budget|cena/i);
    const zprava     = getField(fields, /zpr[aá]va|vzkaz|message|pozn[aá]mka|note|p[rř]edstav|po[žz]adavk/i);

    if (!jmeno && !email) {
      return res.status(400).json({ error: 'Formulář musí obsahovat alespoň jméno nebo e-mail' });
    }

    const typ        = mapTyp(typRaw);
    const datumAkce  = datumRaw ? datumRaw.slice(0, 10) : null; // ISO date
    const pocetHostu = hostiRaw ? parseInt(hostiRaw, 10) || null : null;
    const rozpocet   = rozpocetRaw ? parseFloat(String(rozpocetRaw).replace(/[^0-9.]/g, '')) || null : null;

    await withTransaction(async (client) => {
      // 1. Najít nebo vytvořit klienta
      let klientId;
      if (email) {
        const existing = await client.query(
          'SELECT id FROM klienti WHERE email = $1 LIMIT 1', [email]
        );
        if (existing.rows.length) {
          klientId = existing.rows[0].id;
        }
      }

      if (!klientId) {
        const klientRes = await client.query(
          `INSERT INTO klienti (jmeno, prijmeni, firma, email, telefon, zdroj)
           VALUES ($1, $2, $3, $4, $5, 'tally') RETURNING id`,
          [jmeno || 'Neznámý', prijmeni || null, firma || null, email || null, telefon || null]
        );
        klientId = klientRes.rows[0].id;
      }

      // 2. Sestavit název zakázky
      const klientNazev = [jmeno, prijmeni].filter(Boolean).join(' ') || firma || email || 'Poptávka';
      const nazevAkce   = typRaw ? `${typRaw} – ${klientNazev}` : `Poptávka – ${klientNazev}`;

      // 3. Vygenerovat číslo zakázky
      const cislo = await genCislo(client);

      // 4. Vytvořit zakázku
      const zakRes = await client.query(
        `INSERT INTO zakazky
           (cislo, nazev, typ, stav, klient_id, datum_akce, misto,
            pocet_hostu, rozpocet_klienta, poznamka_klient)
         VALUES ($1,$2,$3,'nova_poptavka',$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [cislo, nazevAkce, typ, klientId, datumAkce, misto || null,
         pocetHostu, rozpocet, zprava || null]
      );
      const zakázka = zakRes.rows[0];

      // 5. Historie
      await client.query(
        `INSERT INTO zakazky_history (zakazka_id, stav_po, poznamka)
         VALUES ($1, 'nova_poptavka', 'Poptávka přijata z Tally.so formuláře')`,
        [zakázka.id]
      );

      // 6. Notifikace (fire-and-forget, mimo transakci)
      createNotif({
        typ: 'nova_poptavka',
        titulek: `Nová poptávka z Tally — ${klientNazev}`,
        zprava: [
          email    && `E-mail: ${email}`,
          telefon  && `Telefon: ${telefon}`,
          typRaw   && `Typ: ${typRaw}`,
          datumAkce && `Datum: ${datumAkce}`,
        ].filter(Boolean).join(' · ') || null,
        odkaz: `/zakazky/${zakázka.id}`,
      });

      res.status(201).json({ ok: true, zakazka_id: zakázka.id, cislo: zakázka.cislo });
    });

    // Fire-and-forget po transakci: auto-followup task + potvrzovací email
    // (zakázka.id musí být dostupné – viz zakRes.rows[0].id uvnitř transakce)
    // Re-fetch id z odpovědi – provedeno asynchronně mimo withTransaction
    query('SELECT z.id, z.nazev, z.datum_akce, z.misto, z.pocet_hostu, k.email AS klient_email, k.jmeno FROM zakazky z LEFT JOIN klienti k ON k.id = z.klient_id WHERE z.cislo = $1', [])
      .catch(() => {}); // fallback – skutečný kód níže

    // Použijeme email + jmeno z parsovaných polí formuláře
    if (email) {
      query('SELECT * FROM nastaveni WHERE 1=1 LIMIT 1').then(async (nr) => {
        const firma = nr.rows.reduce((acc, r) => { acc[r.klic] = r.hodnota; return acc; }, {});
        // Najdi nově vytvořenou zakázku podle klienta a emailu
        const zr = await query('SELECT z.* FROM zakazky z JOIN klienti k ON k.id = z.klient_id WHERE k.email = $1 AND z.stav = \'nova_poptavka\' ORDER BY z.created_at DESC LIMIT 1', [email]);
        if (!zr.rows[0]) return;
        const zakázkaRow = zr.rows[0];
        // Auto-followup task
        autoFollowup(zakázkaRow.id, 'nova_poptavka');
        // Potvrzovací email klientovi
        sendPotvrzeniPoptavky({ to: email, jmeno, zakazka: zakázkaRow, firma })
          .catch(err => console.warn('[tally] potvrzení poptávky email chyba:', err.message));
      }).catch(err => console.warn('[tally] auto-followup chyba:', err.message));
    }
  } catch (err) { next(err); }
});

module.exports = router;
