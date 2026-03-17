// ── Consumption Engine ────────────────────────────────────────
// Calculates ingredient/inventory requirements from event type,
// guest count, and kalkulace_polozky using dynamic multipliers.

/**
 * Koeficienty spotřeby dle typu akce.
 * food     – koeficient jídla
 * napoje   – koeficient nápojů
 * vybaveni – koeficient vybavení
 * buffer   – rezervní koeficient (ztráty, přídavky, …)
 */
const EVENT_MULTIPLIERS = {
  svatba: {
    food:     1.15, // +15 % – slavnostní vícechod. menu, hosté jedí víc
    napoje:   1.30, // +30 % – přípitky, open bar
    vybaveni: 1.10, // +10 % – dekorace navíc
    buffer:   1.05,
  },
  firemni_akce: {
    food:     1.00, // baseline
    napoje:   0.85, // méně alkoholu
    vybaveni: 1.05,
    buffer:   1.05,
  },
  soukroma_akce: {
    food:     1.05,
    napoje:   1.10,
    vybaveni: 1.00,
    buffer:   1.05,
  },
  zavoz: {
    food:     1.00,
    napoje:   0.50, // minimum nápojů
    vybaveni: 0.20, // téměř žádné vybavení
    buffer:   1.08, // +8 % – ztráty při transportu
  },
  bistro: {
    food:     1.00,
    napoje:   1.00,
    vybaveni: 0.30,
    buffer:   1.03,
  },
};

const CATEGORY_TO_MUL = {
  jidlo:    'food',
  napoje:   'napoje',
  vybaveni: 'vybaveni',
  pronajem: 'vybaveni',
  personal: null, // nepřepočítává se
  doprava:  null,
  externi:  null,
};

/**
 * Vrátí zaokrouhlené množství nahoru po aplikaci koeficientů.
 * @param {number} baseQty
 * @param {number} multiplier  – koeficient kategorie
 * @param {number} buffer      – rezervní koeficient
 * @returns {number}
 */
function calculateRequirement(baseQty, multiplier, buffer) {
  return Math.ceil(baseQty * multiplier * buffer);
}

/**
 * Hlavní funkce spotřeby.
 * @param {object} zakazka           – řádek z DB tabulky zakazky
 * @param {Array}  kalkulaceItems    – řádky z kalkulace_polozky
 * @returns {object}  strukturovaný výsledek
 */
function calculateSpotrebu(zakazka, kalkulaceItems) {
  const typ = zakazka.typ || 'soukroma_akce';
  const mul = EVENT_MULTIPLIERS[typ] || EVENT_MULTIPLIERS.soukroma_akce;

  const polozky = [];
  let totalWeightKg = 0;
  let equipmentSets = 0;
  let totalNakupBase   = 0;
  let totalNakupAdjusted = 0;

  for (const pol of kalkulaceItems) {
    const mulKey   = CATEGORY_TO_MUL[pol.kategorie];
    const baseQty  = parseFloat(pol.mnozstvi)   || 0;
    const nakupCena = parseFloat(pol.cena_nakup) || 0;

    let adjustedQty;
    if (mulKey) {
      adjustedQty = calculateRequirement(baseQty, mul[mulKey], mul.buffer);
    } else {
      adjustedQty = baseQty; // personal, doprava, externi zůstávají
    }

    const totalBase     = baseQty     * nakupCena;
    const totalAdjusted = adjustedQty * nakupCena;

    polozky.push({
      id:                pol.id,
      nazev:             pol.nazev,
      kategorie:         pol.kategorie,
      jednotka:          pol.jednotka,
      base_mnozstvi:     baseQty,
      adjusted_mnozstvi: adjustedQty,
      rozdil:            adjustedQty - baseQty,
      cena_nakup:        nakupCena,
      total_nakup_base:      totalBase,
      total_nakup_adjusted:  totalAdjusted,
    });

    totalNakupBase     += totalBase;
    totalNakupAdjusted += totalAdjusted;

    // Odhad hmotnosti pro jídlo (1 porce/os. ≈ 300 g)
    if (pol.kategorie === 'jidlo' &&
        (pol.jednotka === 'os.' || pol.jednotka === 'ks')) {
      totalWeightKg += adjustedQty * 0.3;
    }

    if (pol.kategorie === 'vybaveni') {
      equipmentSets = Math.max(equipmentSets, adjustedQty);
    }
  }

  return {
    zakazka_id:          zakazka.id,
    typ,
    pocet_hostu:         zakazka.pocet_hostu || 0,
    multipliers:         mul,
    polozky,
    total_weight_kg:     Math.round(totalWeightKg * 10) / 10,
    equipment_sets:      equipmentSets,
    total_nakup_base:    Math.round(totalNakupBase     * 100) / 100,
    total_nakup_adjusted:Math.round(totalNakupAdjusted * 100) / 100,
    extra_naklady:       Math.round((totalNakupAdjusted - totalNakupBase) * 100) / 100,
  };
}

module.exports = { calculateSpotrebu, EVENT_MULTIPLIERS, calculateRequirement };
