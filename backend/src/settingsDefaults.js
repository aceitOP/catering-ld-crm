const DEFAULT_SETTINGS = [
  ['app_title', 'Catering CRM', 'Titulek aplikace v prohlizeci'],
  ['app_logo_data_url', '', 'Logo aplikace jako data URL'],
  ['app_color_theme', 'ocean', 'Barevna sablona aplikace'],
  ['backup_auto_enabled', 'true', 'Automaticke denni zalohy zapnute'],
  ['backup_auto_time', '02:30', 'Cas automaticke zalohy (HH:MM)'],
  ['backup_retention_count', '14', 'Pocet uchovavanych JSON zaloh'],
  ['backup_last_run_at', '', 'Cas posledniho behu zalohy'],
  ['backup_last_status', '', 'Stav posledniho behu zalohy'],
  ['backup_last_error', '', 'Chyba posledniho behu zalohy'],
  ['modul_kalendar', 'true', 'Kalendar akci a kapacity'],
  ['modul_reporty', 'true', 'Reporty a statistiky'],
  ['modul_faktury', 'true', 'Fakturace'],
  ['modul_archiv', 'true', 'Archiv'],
  ['modul_error_log', 'true', 'Error log'],
  ['modul_email', 'true', 'E-mailovy modul'],
  ['modul_sablony', 'true', 'Sablony zakazek'],
  ['modul_cenik', 'true', 'Cenik'],
  ['modul_personal', 'true', 'Personal'],
  ['modul_dokumenty', 'true', 'Dokumenty'],
];

module.exports = { DEFAULT_SETTINGS };
