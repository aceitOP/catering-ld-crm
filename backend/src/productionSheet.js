// ── Production Sheet Generator ────────────────────────────────
// Transforms a kalkulace into a kitchen production worksheet.
//
// Sections:
//   A – Mise en place  (all food & beverage items with adjusted qty)
//   B – Kompletace     (dishes with per-guest portions)
//   C – Alergeny       (keyword-based allergen detection)
//   D – Personál       (staff assigned to event)
//   E – Logistika      (transport & external items)

const { calculateSpotrebu } = require('./consumptionEngine');

// ── Allergen keyword map (Czech) ──────────────────────────────
const ALERGEN_MAP = {
  'Lepek (pšenice)':  ['mouka', 'pšenice', 'žito', 'ječmen', 'chléb', 'rohlík', 'bageta',
                        'croissant', 'pasta', 'těstoviny', 'krupice', 'strouhanka'],
  'Korýši':            ['krevety', 'garnáti', 'krab', 'humr', 'langusta', 'rak'],
  'Vejce':             ['vejce', 'majonéza', 'tatarská', 'hollandaise', 'vaječn'],
  'Ryby':              ['ryba', 'losos', 'tuňák', 'treska', 'candát', 'pstruh', 'kapr',
                        'filé', 'ančovičky', 'sardinka'],
  'Arašídy':           ['arašíd', 'peanut', 'burský oříšek'],
  'Sója':              ['sója', 'tofu', 'edamame', 'sójov'],
  'Mléko / Laktóza':   ['smetana', 'máslo', 'sýr', 'mléko', 'jogurt', 'tvaroh', 'šlehačk',
                        'parmazán', 'mozzarella', 'ricotta', 'bešamel'],
  'Ořechy':            ['mandle', 'vlašský', 'lískový', 'pistácie', 'kešu', 'pekan',
                        'para ořech', 'makadamia'],
  'Celer':             ['celer'],
  'Hořčice':           ['hořčice', 'mustard'],
  'Sezam':             ['sezam', 'tahini'],
  'Oxid siřičitý':     ['víno', 'sušené', 'ocet', 'hrozn'],
  'Vlčí bob (lupin)':  ['lupin', 'vlčí bob'],
  'Měkkýši':           ['škeble', 'ústřice', 'slávky', 'hřebenatka', 'chobotnice', 'oliheň'],
};

function detectAlergeny(items) {
  const detected = {}; // alergen → Set of dish names

  for (const pol of items) {
    if (pol.kategorie !== 'jidlo' && pol.kategorie !== 'napoje') continue;
    const nazevLower = pol.nazev.toLowerCase();

    for (const [alergen, keywords] of Object.entries(ALERGEN_MAP)) {
      if (keywords.some(kw => nazevLower.includes(kw))) {
        if (!detected[alergen]) detected[alergen] = new Set();
        detected[alergen].add(pol.nazev);
      }
    }
  }

  return Object.entries(detected).map(([alergen, jidlaSet]) => ({
    alergen,
    jidla: [...jidlaSet],
  }));
}

/**
 * Generates a structured production sheet for kitchen & warehouse staff.
 *
 * @param {object} zakazka   – row from zakazky table (with klient_* joins if available)
 * @param {object} kalkulace – kalkulace row + polozky array
 * @param {object|null} ingredientSummary – agregovane suroviny a recepturove karty
 * @returns {object} production sheet
 */
function generateProductionSheet(zakazka, kalkulace, ingredientSummary = null) {
  const items      = kalkulace.polozky || [];
  const pocetHostu = zakazka.pocet_hostu || kalkulace.pocet_hostu || 1;

  // ── Consumption with event-type multipliers ───────────────
  const spotreba = calculateSpotrebu(zakazka, items);

  // Build a map of adjusted quantities for quick lookup
  const adjMap = {};
  for (const p of spotreba.polozky) adjMap[p.id] = p.adjusted_mnozstvi;

  // ── Section A: Mise en place ──────────────────────────────
  // All food & beverage items: what needs to be prepped / ordered
  const sekce_a = items
    .filter(p => p.kategorie === 'jidlo' || p.kategorie === 'napoje')
    .map(p => {
      const adj = adjMap[p.id] ?? parseFloat(p.mnozstvi) ?? 0;
      return {
        nazev:     p.nazev,
        kategorie: p.kategorie,
        mnozstvi:  adj,
        jednotka:  p.jednotka,
        na_hosta:  pocetHostu > 0
                   ? Math.round((adj / pocetHostu) * 100) / 100
                   : null,
      };
    });

  // ── Section B: Kompletace (dish completion list) ──────────
  // Only food items: shows production quantities
  const sekce_b = items
    .filter(p => p.kategorie === 'jidlo')
    .map((p, i) => {
      const adj = adjMap[p.id] ?? parseFloat(p.mnozstvi) ?? 0;
      return {
        poradi:    i + 1,
        nazev:     p.nazev,
        porce:     adj,
        jednotka:  p.jednotka,
        // ready_time can be filled manually on the printed sheet
      };
    });

  // ── Section C: Allergen summary ───────────────────────────
  const sekce_c_alergeny = detectAlergeny(items);

  // ── Section D: Personnel ─────────────────────────────────
  const sekce_d_personal = items
    .filter(p => p.kategorie === 'personal')
    .map(p => ({
      nazev:    p.nazev,
      mnozstvi: parseFloat(p.mnozstvi) || 0,
      jednotka: p.jednotka,
    }));

  // ── Section E: Logistics ──────────────────────────────────
  const sekce_e_logistika = [
    ...items.filter(p => p.kategorie === 'doprava'),
    ...items.filter(p => p.kategorie === 'vybaveni' || p.kategorie === 'pronajem'),
    ...items.filter(p => p.kategorie === 'externi'),
  ].map(p => ({
    nazev:     p.nazev,
    kategorie: p.kategorie,
    mnozstvi:  adjMap[p.id] ?? parseFloat(p.mnozstvi) ?? 0,
    jednotka:  p.jednotka,
  }));

  // ── Shrnutí ───────────────────────────────────────────────
  const shrnuti = {
    total_jidlo:   sekce_b.reduce((s, p) => s + p.porce, 0),
    total_napoje:  sekce_a.filter(p => p.kategorie === 'napoje')
                          .reduce((s, p) => s + p.mnozstvi, 0),
    total_weight_kg:      spotreba.total_weight_kg,
    total_nakup_adjusted: spotreba.total_nakup_adjusted,
    extra_naklady:        spotreba.extra_naklady,
    pocet_alergen_skupin: sekce_c_alergeny.length,
    recepturove_radky: ingredientSummary?.summary?.total_recipe_rows || 0,
    agregovane_suroviny: ingredientSummary?.summary?.total_ingredients || 0,
  };

  return {
    // Metadata
    zakazka_id:      zakazka.id,
    cislo:           zakazka.cislo,
    nazev:           zakazka.nazev,
    typ:             zakazka.typ,
    datum_akce:      zakazka.datum_akce,
    cas_zacatek:     zakazka.cas_zacatek,
    cas_konec:       zakazka.cas_konec,
    misto:           zakazka.misto,
    pocet_hostu:     pocetHostu,
    klient:          zakazka.klient_firma ||
                     [zakazka.klient_jmeno, zakazka.klient_prijmeni].filter(Boolean).join(' ') ||
                     null,
    kalkulace_id:    kalkulace.id,
    kalkulace_nazev: kalkulace.nazev,
    generated_at:    new Date().toISOString(),
    // Sections
    sekce_a,
    sekce_b,
    sekce_c_alergeny,
    sekce_d_personal,
    sekce_e_logistika,
    sekce_f_suroviny: ingredientSummary?.ingredients || [],
    sekce_g_komponenty: ingredientSummary?.components || [],
    sekce_h_receptury: ingredientSummary?.recipe_cards || [],
    // Summary
    shrnuti,
    ingredient_summary: ingredientSummary,
    // Full consumption data (for detail view)
    spotreba,
  };
}

module.exports = { generateProductionSheet };
