// Changelog – Catering LD CRM
// Typy změn: 'new' | 'improvement' | 'fix' | 'security'

export const APP_VERSION = '1.6.0';

export const CHANGELOG = [
  {
    version: '1.6.0',
    date: '2026-03-16',
    changes: [
      { type: 'new',         text: 'Dashboard – mini timeline nejbližšího dne s akcemi (Gantt s časovými bary)' },
      { type: 'improvement', text: 'Kalendář Timeline – přepracován: Den = vertikální denní plánovač, Týden = Gantt se všemi 7 dny' },
      { type: 'improvement', text: 'Kalendář Timeline – zobrazuje všechny dny týdne vč. prázdných, víkendy odlišeny pozadím' },
      { type: 'fix',         text: 'Ctrl+F5 (hard reload) již nezpůsobuje chybu 404 na podstránkách' },
      { type: 'security',    text: 'Heslo povinné při vytváření uživatele (min. 8 znaků), odstraněno výchozí heslo' },
      { type: 'security',    text: 'Opravena validace stavu nabídky – zamítnuty neplatné hodnoty' },
      { type: 'security',    text: 'Paginace v modulu Klienti – omezení maximálního limitu záznamu' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-03-16',
    changes: [
      { type: 'new',         text: 'Notifikační centrum – bell ikona s slide-out panelem, polling každých 30 s' },
      { type: 'new',         text: 'Webhook pro nové poptávky z webu (POST /api/notifikace/poptavka)' },
      { type: 'new',         text: 'Nastavení – záložka „Změna hesla" pro přihlášeného uživatele' },
      { type: 'new',         text: 'Patička – info o verzi + modal s historií změn' },
      { type: 'improvement', text: 'Vymazat cache – opraveno (neznámá chyba 404 odstraněna)' },
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
