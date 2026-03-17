'use strict';
const { query } = require('./db');

/**
 * Vytvoří follow-up úkol pro danou zakázku.
 * @param {number} zakazka_id
 * @param {string} typ        – klíč úkolu ('zavolat', 'email_dekujeme', 'reference', atd.)
 * @param {string} titulek    – zobrazovaný název
 * @param {number} [dniOffset=0] – za kolik dní od dneška je termin
 */
async function createFollowupTask(zakazka_id, typ, titulek, dniOffset = 0) {
  const termin = new Date();
  termin.setDate(termin.getDate() + dniOffset);
  const terminISO = termin.toISOString().slice(0, 10);

  await query(
    `INSERT INTO followup_ukoly (zakazka_id, typ, titulek, termin)
     VALUES ($1, $2, $3, $4)`,
    [zakazka_id, typ, titulek, terminISO]
  );
}

// Pravidla: které úkoly se vytvoří při přechodu do daného stavu
const FOLLOWUP_RULES = {
  nova_poptavka: [
    { typ: 'zavolat', titulek: 'Kontaktovat klienta – ověřit poptávku a nabídnout schůzku', dni: 1 },
  ],
  nabidka_odeslana: [
    { typ: 'zavolat', titulek: 'Zavolat klientovi – ověřit, zda nabídka dorazila a zda má zájem', dni: 3 },
  ],
  potvrzeno: [
    { typ: 'email', titulek: 'Odeslat klientovi potvrzení zakázky s detaily akce', dni: 1 },
  ],
  realizovano: [
    { typ: 'email_dekujeme', titulek: 'Odeslat klientovi děkovací email za spolupráci', dni: 1 },
  ],
  uzavreno: [
    { typ: 'reference',           titulek: 'Požádat klienta o referenci nebo hodnocení', dni: 7 },
    { typ: 'nabidka_spoluprace',  titulek: 'Kontaktovat klienta s nabídkou další spolupráce', dni: 30 },
  ],
};

/**
 * Automaticky vytvoří follow-up úkoly pro daný přechod stavu.
 * Fire-and-forget – chyby jsou logovány, neblokují odpověď.
 */
function autoFollowup(zakazka_id, stav) {
  const rules = FOLLOWUP_RULES[stav];
  if (!rules) return;
  for (const r of rules) {
    createFollowupTask(zakazka_id, r.typ, r.titulek, r.dni)
      .catch(err => console.warn('[followup] auto-task chyba:', err.message));
  }
}

module.exports = { createFollowupTask, autoFollowup };
