// Changelog - Catering LD CRM
// Typy změn: 'new' | 'improvement' | 'fix' | 'security'

export const APP_VERSION = '3.7.1';

export const CHANGELOG = [
  {
    version: '3.7.1',
    date: '2026-04-24',
    changes: [
      { type: 'new', text: 'Branding: přepínání mezi 4 barevnými šablonami aplikace (Ocean, Forest, Terracotta, Graphite).' },
      { type: 'improvement', text: 'Branding se propisuje přes CSS proměnné do tlačítek, badge, gradientů i focus stavů napříč aplikací.' },
    ],
  },
  {
    version: '3.7.0',
    date: '2026-04-24',
    changes: [
      { type: 'new', text: 'Venue Logistics Twin: samostatná venue entita, logistické sekce, observations, snapshoty a venue brief na zakázce.' },
      { type: 'new', text: 'Dodací list: nový tiskový dokument přímo z detailu zakázky s klientem, místem, logistikou, položkami a podpisy.' },
      { type: 'improvement', text: 'Komando e-mail: lze odeslat přiřazenému personálu i na libovolné e-mailové adresy v jednom kroku.' },
      { type: 'improvement', text: 'Dokumenty a přílohy: maximální velikost souboru sjednocena na 15 MB.' },
      { type: 'fix', text: 'Opravy diakritiky v Nastavení, changelogu, akcích zakázky a e-mailových textech.' },
    ],
  },
  {
    version: '3.6.0',
    date: '2026-03-20',
    changes: [
      { type: 'new', text: 'Dokumenty: složkový systém a přesouvání souborů mezi složkami.' },
      { type: 'improvement', text: 'E-mail: SMTP nastavení přesunuto do UI v Nastavení.' },
      { type: 'fix', text: 'Dashboard: oprava widgetu Nové poptávky.' },
    ],
  },
  {
    version: '3.5.0',
    date: '2026-03-19',
    changes: [
      { type: 'new', text: 'Tmavý režim s volbou Světlý / Auto / Tmavý v levém panelu.' },
      { type: 'improvement', text: 'Automatická aktivace tmavého režimu podle denní doby.' },
    ],
  },
  {
    version: '3.4.0',
    date: '2026-03-19',
    changes: [
      { type: 'new', text: 'E-mail modul s IMAP čtením pošty přímo v CRM.' },
      { type: 'new', text: 'Odpověď, přeposlání, mazání, práce se složkami a vytvoření zakázky z e-mailu.' },
    ],
  },
];
