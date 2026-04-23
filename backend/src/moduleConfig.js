const MODULE_DEFINITIONS = [
  { key: 'kalendar', label: 'Kalendar', settingKey: 'modul_kalendar', enabledByDefault: true },
  { key: 'reporty', label: 'Reporty', settingKey: 'modul_reporty', enabledByDefault: true },
  { key: 'faktury', label: 'Fakturace', settingKey: 'modul_faktury', enabledByDefault: true },
  { key: 'archiv', label: 'Archiv', settingKey: 'modul_archiv', enabledByDefault: true },
  { key: 'error_log', label: 'Error log', settingKey: 'modul_error_log', enabledByDefault: true },
  { key: 'email', label: 'E-mail', settingKey: 'modul_email', enabledByDefault: true },
  { key: 'sablony', label: 'Sablony', settingKey: 'modul_sablony', enabledByDefault: true },
  { key: 'cenik', label: 'Cenik', settingKey: 'modul_cenik', enabledByDefault: true },
  { key: 'personal', label: 'Personal', settingKey: 'modul_personal', enabledByDefault: true },
  { key: 'dokumenty', label: 'Dokumenty', settingKey: 'modul_dokumenty', enabledByDefault: true },
];

const MODULE_MAP = Object.fromEntries(MODULE_DEFINITIONS.map((module) => [module.key, module]));
const MODULE_SETTING_KEYS = new Set(MODULE_DEFINITIONS.map((module) => module.settingKey));

function parseSettingBoolean(value, fallback = true) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function buildModuleStateFromSettings(settings = {}) {
  return MODULE_DEFINITIONS.reduce((acc, module) => {
    acc[module.key] = parseSettingBoolean(settings[module.settingKey], module.enabledByDefault);
    return acc;
  }, {});
}

function isModuleSettingKey(key) {
  return MODULE_SETTING_KEYS.has(key);
}

module.exports = {
  MODULE_DEFINITIONS,
  MODULE_MAP,
  parseSettingBoolean,
  buildModuleStateFromSettings,
  isModuleSettingKey,
};
