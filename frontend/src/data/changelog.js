// Changelog – Catering LD CRM
// Typy změn: 'new' | 'improvement' | 'fix' | 'security'

export const APP_VERSION = '2.3.1';

export const CHANGELOG = [
  {
    version: '2.3.1',
    date: '2026-03-17',
    changes: [
      { type: 'fix',         text: 'Personál – opraven crash modulu (filterRole/filterTyp použity před deklarací)' },
      { type: 'fix',         text: 'Faktura – opraveno načtení klienta při „Vystavit fakturu" ze zakázky (broken queryFn)' },
      { type: 'fix',         text: 'Faktura – opraveno hledání klientů (odběratel autocomplete nyní funguje)' },
      { type: 'new',         text: 'Klienti – tlačítko „Doplnit z ARES" vedle IČO v obou formulářích (vyplní firmu, DIČ, adresu)' },
      { type: 'improvement', text: 'Nová zakázka – přidán slider pro nastavení počtu hostů (+ ruční zadání zůstává)' },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-03-17',
    changes: [
      { type: 'new',         text: 'Výrobní list – nová stránka dostupná z detailu zakázky (tlačítko „Výrobní list")' },
      { type: 'new',         text: 'Consumption Engine – automatický výpočet množství surovin dle typu akce (svatba, firemní, závoz…)' },
      { type: 'new',         text: 'Výrobní list – sekce A: Mise en place (objednávky & příprava) s upraveným množstvím' },
      { type: 'new',         text: 'Výrobní list – sekce B: Kompletace pokrmů (seznam jídel s počtem porcí + políčko „hotovo v")' },
      { type: 'new',         text: 'Výrobní list – sekce C: Automatická detekce alergenů z názvů položek (14 skupin alergenů)' },
      { type: 'new',         text: 'Výrobní list – sekce D & E: Personál a logistika/vybavení z kalkulace' },
      { type: 'new',         text: 'Výrobní list – detail spotřeby s koeficienty (základní vs. upravené množství)' },
      { type: 'improvement', text: 'Výrobní list – tiskové CSS (print:hidden / print:block), přímo tisknutelný z prohlížeče' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-03-17',
    changes: [
      { type: 'new',         text: 'Dashboard – přetažitelné widgety (drag & drop), pořadí se ukládá do prohlížeče' },
      { type: 'new',         text: 'Dashboard – nový widget Fakturace (nezaplacené, po splatnosti)' },
      { type: 'new',         text: 'Dashboard – nový widget Nové poptávky se seznamem posledních záznamu' },
      { type: 'improvement', text: 'Dashboard – tlačítko „Upravit rozvržení" pro aktivaci přetahování' },
      { type: 'improvement', text: 'Boční menu – sekce „Obchod" přejmenována na „Catering"' },
      { type: 'fix',         text: 'Kalendář – opraveno zobrazení akcí v měsíčním pohledu (datum_akce porovnání)' },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-03-17',
    changes: [
      { type: 'new', text: 'Víceúrovňové boční menu – Obchod, Správa, Data s rozbalovacími sekcemi' },
      { type: 'new', text: 'Dashboard – tlačítka „Nová nabídka" a „Nový klient" vedle „Nová zakázka"' },
      { type: 'improvement', text: 'Kalendář měsíc – dny s akcemi výrazně zvýrazněny (barevný pruh, tmavé číslo, počet akcí)' },
      { type: 'improvement', text: 'Timeline den – překrývající se akce se zobrazují vedle sebe ve sloupcích (podpora 6+ akcí)' },
      { type: 'improvement', text: 'Timeline týden – překrývající se Gantt bary se řadí do řádků, dynamická výška dne' },
      { type: 'fix', text: 'Fakturace – opravena chyba při vytváření nové faktury (crash stránky)' },
      { type: 'fix', text: 'Fakturace – vyhledávání v ceníku nyní funguje při vystavení faktury' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-03-16',
    changes: [
      { type: 'improvement', text: 'Kompletní redesign UI – moderní vzhled s fialovým barevným schématem' },
      { type: 'improvement', text: 'Nový sidebar – světlý, prostornější, s gradientovými ikonami' },
      { type: 'improvement', text: 'Dashboard – přepracované statistické karty s ikonami a stíny' },
      { type: 'improvement', text: 'Zakulacené prvky (rounded-2xl/3xl), měkké stíny, moderní typografie Inter' },
      { type: 'improvement', text: 'Přepracované tabulky, modaly, filtry, badges a tlačítka' },
      { type: 'improvement', text: 'Nová přihlašovací stránka s gradientovým logem' },
    ],
  },
  {
    version: '1.9.1',
    date: '2026-03-16',
    changes: [
      { type: 'fix', text: 'Dashboard – opraveno přetékání textu notifikací mimo box' },
      { type: 'improvement', text: 'Personál – filtry podle typu (Interní/Externí) a role (Číšník, Kuchař, …)' },
      { type: 'fix', text: 'Opravena chyba 404 při obnovení stránky (F5) – SPA routing' },
    ],
  },
  {
    version: '1.9.0',
    date: '2026-03-16',
    changes: [
      { type: 'new', text: 'Fakturace – nový modul pro vydávání faktur (seznam, detail, vystavení, PDF tisk)' },
      { type: 'new', text: 'Fakturace – workflow stavů: Vystavena → Odeslána → Zaplacena | Storno' },
      { type: 'new', text: 'Fakturace – PDF export faktury s hlavičkou dodavatele/odběratele a položkami' },
      { type: 'new', text: 'Fakturace – položky s DPH sazbou (0 %, 12 %, 21 %), vyhledávání z ceníku' },
      { type: 'new', text: 'Zakázky – tlačítko „Vystavit fakturu" v detailu zakázky' },
      { type: 'improvement', text: 'Přehledové statistiky: objem Vystaveno / Odesláno / Zaplaceno na hlavní stránce Fakturace' },
    ],
  },
  {
    version: '1.8.1',
    date: '2026-03-16',
    changes: [
      { type: 'fix', text: 'Poptávky – opravena chyba „formatCena is not defined" při zobrazení rozpočtu klienta' },
      { type: 'fix', text: 'Tally integrace – ověřena kompletní funkčnost: webhook → nova_poptavka → notifikace → badge v menu' },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-03-16',
    changes: [
      { type: 'improvement', text: 'Poptávky – tlačítko „Převést na zakázku" přesměruje přímo na detail zakázky' },
      { type: 'new',         text: 'Google Kalendář – integrace přes Service Account, potvrzené zakázky se automaticky propisují do sdíleného firemního kalendáře' },
      { type: 'new',         text: 'Google Kalendář – stornované zakázky se automaticky odstraní z Google Kalendáře' },
      { type: 'new',         text: 'Kalendář – Google Calendar eventy zobrazeny v měsíčním i timeline pohledu (modrou barvou)' },
      { type: 'new',         text: 'Nastavení – nová záložka „Google Kalendář" s návodem a nastavením Calendar ID' },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-03-16',
    changes: [
      { type: 'new',         text: 'Modul Poptávky – seznam nových poptávek s akcemi Přijmout / Stornovat / Detail' },
      { type: 'new',         text: 'Sidebar – oranžový počítadlo badge na Poptávky při nových záznamech' },
      { type: 'new',         text: 'Tally.so integrace – poptávky z webového formuláře se automaticky ukládají jako zakázka (stav: Nová poptávka)' },
      { type: 'new',         text: 'Nastavení – záložka „Integrace" s návodem a webhookem URL pro Tally.so' },
    ],
  },
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
