const express = require('express');
const { query } = require('../db');
const { auth, requireCapability } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard-summary', auth, async (_req, res, next) => {
  try {
    const { rows: [summary] } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE z.stav = 'nova_poptavka' AND z.archivovano = false)::int AS nove_poptavky,
        COUNT(*) FILTER (WHERE z.stav IN ('nabidka_pripravena','nabidka_odeslana','ceka_na_vyjadreni') AND z.archivovano = false)::int AS ceka_na_akci,
        COUNT(*) FILTER (
          WHERE z.stav = 'potvrzeno'
            AND z.archivovano = false
            AND z.datum_akce >= date_trunc('year', CURRENT_DATE)::date
            AND z.datum_akce <= (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year - 1 day')::date
        )::int AS potvrzeno_letos,
        COALESCE(SUM(
          CASE
            WHEN z.archivovano = false
             AND z.stav IN ('potvrzeno','ve_priprave','realizovano','uzavreno')
             AND z.datum_akce >= date_trunc('month', CURRENT_DATE)::date
             AND z.datum_akce <= (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date
            THEN z.cena_celkem
            ELSE 0
          END
        ), 0) AS obrat_mesic
      FROM zakazky z
    `);

    res.json(summary);
  } catch (err) { next(err); }
});

router.get('/owner-summary', auth, requireCapability('owner_dashboard.view'), async (_req, res, next) => {
  try {
    const [pipelineRes, cashflowRes, profitabilityRes, staffRes, notifRes] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE archivovano = false) AS total,
          COUNT(*) FILTER (WHERE stav = 'nova_poptavka' AND archivovano = false) AS nove_poptavky,
          COUNT(*) FILTER (WHERE stav IN ('nabidka_pripravena','nabidka_odeslana','ceka_na_vyjadreni') AND archivovano = false) AS otevrene_nabidky,
          COUNT(*) FILTER (WHERE stav IN ('potvrzeno','ve_priprave') AND archivovano = false) AS potvrzene_a_priprava,
          COUNT(*) FILTER (
            WHERE archivovano = false
              AND datum_akce >= CURRENT_DATE
              AND datum_akce <= CURRENT_DATE + INTERVAL '30 days'
          ) AS akce_30_dni
        FROM zakazky
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE stav IN ('vystavena','odeslana')) AS unpaid_count,
          COALESCE(SUM(CASE WHEN stav IN ('vystavena','odeslana') THEN cena_celkem ELSE 0 END), 0) AS unpaid_total,
          COUNT(*) FILTER (
            WHERE stav IN ('vystavena','odeslana')
              AND datum_splatnosti < CURRENT_DATE
          ) AS overdue_count,
          COALESCE(SUM(
            CASE
              WHEN stav IN ('vystavena','odeslana') AND datum_splatnosti < CURRENT_DATE
              THEN cena_celkem
              ELSE 0
            END
          ), 0) AS overdue_total
        FROM faktury
      `),
      query(`
        SELECT
          COALESCE(SUM(cena_celkem), 0) AS obrat,
          COALESCE(SUM(cena_naklady), 0) AS naklady,
          COUNT(*) FILTER (
            WHERE cena_celkem IS NOT NULL
              AND cena_celkem > 0
              AND cena_naklady IS NOT NULL
              AND ((cena_celkem - cena_naklady) / NULLIF(cena_celkem, 0)) < 0.25
              AND archivovano = false
          ) AS low_margin_count
        FROM zakazky
        WHERE stav NOT IN ('stornovano')
      `),
      query(`
        SELECT
          COUNT(DISTINCT zp.personal_id) FILTER (
            WHERE z.datum_akce >= CURRENT_DATE
              AND z.datum_akce <= CURRENT_DATE + INTERVAL '30 days'
          ) AS assigned_staff_30_days,
          COUNT(*) FILTER (
            WHERE z.stav IN ('potvrzeno','ve_priprave')
              AND z.archivovano = false
              AND z.datum_akce >= CURRENT_DATE
              AND z.datum_akce <= CURRENT_DATE + INTERVAL '30 days'
              AND NOT EXISTS (
                SELECT 1 FROM zakazky_personal zp2 WHERE zp2.zakazka_id = z.id
              )
          ) AS unstaffed_events
        FROM zakazky z
        LEFT JOIN zakazky_personal zp ON zp.zakazka_id = z.id
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE procitana = false) AS unread_notifications,
          COUNT(*) FILTER (
            WHERE procitana = false
              AND created_at >= NOW() - INTERVAL '7 days'
          ) AS unread_last_week
        FROM notifikace
      `),
    ]);

    const profitability = profitabilityRes.rows[0] || {};
    const obrat = Number(profitability.obrat || 0);
    const naklady = Number(profitability.naklady || 0);
    const marze = obrat > 0 ? ((obrat - naklady) / obrat) * 100 : 0;

    res.json({
      pipeline: pipelineRes.rows[0],
      cashflow: cashflowRes.rows[0],
      profitability: {
        ...profitability,
        marze_procent: Number(marze.toFixed(1)),
      },
      staff: staffRes.rows[0],
      notifications: notifRes.rows[0],
    });
  } catch (err) { next(err); }
});

router.get('/', auth, async (req, res, next) => {
  try {
    const { od, do: doo } = req.query;
    const where = []; const params = []; let p = 1;
    if (od)  { where.push(`z.datum_akce >= $${p++}`); params.push(od); }
    if (doo) { where.push(`z.datum_akce <= $${p++}`); params.push(doo); }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows: [souhrn] } = await query(`
      SELECT COUNT(*) AS total_zakazek,
        COUNT(CASE WHEN z.stav IN ('realizovano','uzavreno') THEN 1 END) AS realizovano,
        COALESCE(SUM(CASE WHEN z.stav NOT IN ('stornovano') THEN z.cena_celkem END), 0) AS obrat,
        COALESCE(SUM(CASE WHEN z.stav NOT IN ('stornovano') THEN z.cena_naklady END), 0) AS naklady
      FROM zakazky z ${wc}`, params);

    const { rows: podle_typu } = await query(`
      SELECT z.typ, COUNT(*) AS pocet, COALESCE(SUM(z.cena_celkem),0) AS obrat
      FROM zakazky z ${wc} GROUP BY z.typ ORDER BY obrat DESC`, params);

    const whereReal = where.length
      ? wc + ` AND z.stav IN ('realizovano','uzavreno')`
      : `WHERE z.stav IN ('realizovano','uzavreno')`;

    const { rows: zakazky } = await query(`
      SELECT z.id, z.cislo, z.nazev, z.typ, z.stav, z.datum_akce,
             z.cena_celkem, z.cena_naklady,
             k.jmeno AS klient_jmeno, k.prijmeni AS klient_prijmeni, k.firma AS klient_firma
      FROM zakazky z
      LEFT JOIN klienti k ON k.id = z.klient_id
      ${whereReal} ORDER BY z.datum_akce DESC`, params);

    res.json({ souhrn, podle_typu, zakazky });
  } catch (err) { next(err); }
});

module.exports = router;
