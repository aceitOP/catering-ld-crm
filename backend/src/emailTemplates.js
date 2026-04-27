'use strict';

const { query } = require('./db');

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('cs-CZ') : '';
}

function formatMoney(value) {
  if (value == null || value === '') return '';
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function renderTemplate(template, context = {}) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const value = context[key];
    return value == null ? '' : String(value);
  });
}

function buildZakazkaTemplateContext(zakazka = {}, firma = {}) {
  const klientJmeno = [zakazka.klient_jmeno, zakazka.klient_prijmeni].filter(Boolean).join(' ');
  return {
    cislo: zakazka.cislo || '',
    nazev: zakazka.nazev || '',
    typ: zakazka.typ || '',
    datum_akce: formatDate(zakazka.datum_akce),
    cas_zacatek: zakazka.cas_zacatek ? String(zakazka.cas_zacatek).slice(0, 5) : '',
    cas_konec: zakazka.cas_konec ? String(zakazka.cas_konec).slice(0, 5) : '',
    misto: zakazka.misto || '',
    pocet_hostu: zakazka.pocet_hostu || '',
    cena_celkem: formatMoney(zakazka.cena_celkem),
    klient_jmeno: klientJmeno || zakazka.klient_firma || '',
    klient_firma: zakazka.klient_firma || '',
    firma_nazev: firma.firma_nazev || firma.app_title || 'Catering LD',
    firma_email: firma.firma_email || '',
    firma_telefon: firma.firma_telefon || '',
  };
}

async function loadEmailTemplate({ id = null, templateKey = null, useCase = null } = {}) {
  if (id) {
    const { rows } = await query('SELECT * FROM email_sablony WHERE id = $1 LIMIT 1', [id]);
    return rows[0] || null;
  }

  if (templateKey) {
    const { rows } = await query('SELECT * FROM email_sablony WHERE template_key = $1 LIMIT 1', [templateKey]);
    return rows[0] || null;
  }

  if (useCase) {
    const { rows } = await query(
      'SELECT * FROM email_sablony WHERE use_case = $1 AND aktivni = true ORDER BY poradi, id LIMIT 1',
      [useCase]
    );
    return rows[0] || null;
  }

  return null;
}

function renderEmailTemplate(template, context = {}) {
  if (!template) return null;
  return {
    subject: renderTemplate(template.subject_template || template.predmet_prefix || '', context),
    body: renderTemplate(template.body_template || template.telo || '', context),
  };
}

module.exports = {
  buildZakazkaTemplateContext,
  loadEmailTemplate,
  renderEmailTemplate,
  renderTemplate,
};
