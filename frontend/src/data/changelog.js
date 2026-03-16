// Changelog – Catering LD CRM
// Typy změn: 'new' | 'improvement' | 'fix' | 'security'

export const APP_VERSION = '1.5.0';

export const CHANGELOG = [
  {
    version: '1.5.0',
    date: '2026-03-16',
    changes: [
      { type: 'new',         text: 'Kalendář – Timeline view s přepínáním Měsíc / Timeline' },
      { type: 'new',         text: 'Timeline zobrazuje zakázky grouped by stav s collapsible sekcemi' },
      { type: 'improvement', text: 'Timeline – navigace po 4 týdnech, zvýraznění aktuálního týdne' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-03-15',
    changes: [
      { type: 'new',         text: 'Multiselect s bulk akcemi v Klienti, Zakázky, Nabídky, Personál, Dokumenty' },
      { type: 'new',         text: 'Export vybraných záznamů do CSV z každého modulu' },
      { type: 'security',    text: 'Rate limiting na přihlášení (ochrana před brute force)' },
      { type: 'security',    text: 'Validace MIME typů při nahrávání souborů' },
      { type: 'security',    text: 'HTML escaping uživatelských dat v e-mailových šablonách' },
      { type: 'security',    text: 'Bezpečná paginace s limitováním rozsahu parametrů' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-14',
    changes: [
      { type: 'new',         text: 'Reporty – rychlé volby datového období (Tento týden, Minulý měsíc, 3 měs., 6 měs.)' },
      { type: 'new',         text: 'CRM – tlačítka "Nová nabídka" a "Nový klient" vedle "Nová zakázka"' },
      { type: 'improvement', text: 'Dashboard – Nadcházející akce přesunuta na wider panel vlevo' },
      { type: 'improvement', text: 'Kalendář – zobrazení všech akcí v buňce (bez limitu 3 akcí)' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-03-13',
    changes: [
      { type: 'new',         text: 'Detail zakázky – úprava zakázky (edit modal se všemi poli)' },
      { type: 'new',         text: 'Detail zakázky – přidání a odebrání personálu s výběrem role a časů' },
      { type: 'new',         text: 'Detail zakázky – nahrávání dokumentů' },
      { type: 'new',         text: 'Klienti – úprava zákazníka (edit modal)' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03-12',
    changes: [
      { type: 'improvement', text: 'PDF Komando – výrazně větší text pro lepší čitelnost' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-01-01',
    changes: [
      { type: 'new', text: 'Prvotní release aplikace Catering LD CRM' },
      { type: 'new', text: 'Moduly: Dashboard, Zakázky, Klienti, Nabídky, Kalendář, Personál, Dokumenty, Ceníky, Reporty, Nastavení' },
      { type: 'new', text: 'Tvorba a správa nabídek s PDF exportem' },
      { type: 'new', text: 'Komando email pro personál' },
      { type: 'new', text: 'Přihlašování s rolemi (admin / uživatel)' },
    ],
  },
];
