'use strict';

const { query } = require('./db');

const DEFAULT_KEYS = [
  'app_title',
  'app_logo_data_url',
  'app_color_theme',
  'app_document_font_family',
  'voucher_design_style',
  'firma_nazev',
  'firma_email',
  'firma_telefon',
  'firma_web',
  'firma_adresa',
  'firma_ico',
  'firma_dic',
  'firma_iban',
  'email_podpis_html',
];

async function loadFirmaSettings(extraKeys = []) {
  const keys = [...new Set([...DEFAULT_KEYS, ...extraKeys])];
  const { rows } = await query(
    `SELECT klic, hodnota
     FROM nastaveni
     WHERE klic = ANY($1::text[])`,
    [keys]
  );

  return rows.reduce((acc, row) => {
    acc[row.klic] = row.hodnota;
    return acc;
  }, {});
}

module.exports = {
  loadFirmaSettings,
};
