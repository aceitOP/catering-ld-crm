export const MODULE_DEFINITIONS = [
  { key: 'kalendar', label: 'Kalendar', description: 'Kalendar akci, Google Calendar status a kapacity.' },
  { key: 'reporty', label: 'Reporty', description: 'Prehledy trzeb a statistiky.' },
  { key: 'faktury', label: 'Fakturace', description: 'Seznam a detail faktur.' },
  { key: 'archiv', label: 'Archiv', description: 'Archivovane zaznamy klientu, personalu a zakazek.' },
  { key: 'error_log', label: 'Error log', description: 'Prehled backendovych chyb a jejich reseni.' },
  { key: 'email', label: 'E-mail', description: 'Inbox, odesilani zprav a navazane e-mailove funkce.' },
  { key: 'sablony', label: 'Sablony', description: 'Sablony zakazek a predvyplneni nove zakazky.' },
  { key: 'cenik', label: 'Cenik', description: 'Cenikove polozky pro nabidky a faktury.' },
  { key: 'personal', label: 'Personal', description: 'Evidence personalu a prirazeni na akce.' },
  { key: 'dokumenty', label: 'Dokumenty', description: 'Soubory, prilohy a firemni dokumenty.' },
];

export const MODULE_SETTING_KEYS = Object.fromEntries(
  MODULE_DEFINITIONS.map((module) => [module.key, `modul_${module.key}`])
);

export function isModuleEnabled(modules, moduleKey) {
  return modules?.[moduleKey] !== false;
}
