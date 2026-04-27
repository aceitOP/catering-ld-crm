export const MODULE_DEFINITIONS = [
  { key: 'kalendar', label: 'Kalendář', description: 'Kalendář akcí, Google Calendar status a kapacity.' },
  { key: 'reporty', label: 'Reporty', description: 'Přehledy tržeb a statistiky.' },
  { key: 'faktury', label: 'Fakturace', description: 'Seznam a detail faktur.' },
  { key: 'archiv', label: 'Archiv', description: 'Archivované záznamy klientů, personálu a zakázek.' },
  { key: 'error_log', label: 'Error log', description: 'Přehled backendových chyb a jejich řešení.' },
  { key: 'email', label: 'E-mail', description: 'Inbox, odesílání zpráv a navázané e-mailové funkce.' },
  { key: 'sablony', label: 'Šablony', description: 'Šablony zakázek a předvyplnění nové zakázky.' },
  { key: 'cenik', label: 'Ceník', description: 'Ceníkové položky pro nabídky a faktury.' },
  { key: 'pro', label: 'Pro', description: 'Suroviny a receptury pro kuchyni a kalkulace.' },
  { key: 'vouchers', label: 'Poukazy', description: 'Dárkové poukazy, jejich vzhled a odesílání.' },
  { key: 'venues', label: 'Prostory', description: 'Evidence prostorů, kontaktů a provozních poznámek.' },
  { key: 'personal', label: 'Personál', description: 'Evidence personálu a přiřazení na akce.' },
  { key: 'dokumenty', label: 'Dokumenty', description: 'Soubory, přílohy a firemní dokumenty.' },
];

export const MODULE_SETTING_KEYS = Object.fromEntries(
  MODULE_DEFINITIONS.map((module) => [module.key, `modul_${module.key}`])
);

export function isModuleEnabled(modules, moduleKey) {
  return modules?.[moduleKey] !== false;
}
