import { useMemo, useState } from 'react';
import {
  Archive,
  BarChart2,
  BookCopy,
  BookOpenText,
  Briefcase,
  Building2,
  Calendar,
  ClipboardList,
  FileText,
  FolderOpen,
  Gift,
  Inbox,
  Mail,
  Receipt,
  Search,
  Settings,
  ShieldAlert,
  Tag,
  UserCheck,
  Users,
  FlaskConical,
} from 'lucide-react';
import { PageHeader } from '../components/ui';

const MODULES = [
  {
    title: 'Dashboard',
    icon: BarChart2,
    area: 'Přehled',
    summary: 'Denní pracovní plocha s rychlým přehledem zakázek, faktur, notifikací a úkolů.',
    features: [
      'Timeline dne a nadcházející akce.',
      'Pipeline zakázek podle stavů.',
      'Widgety pro faktury, poptávky, notifikace a follow-up.',
      'Rychlé akce pro vytvoření zakázky, klienta nebo nabídky.',
      'Volitelné pořadí widgetů podle práce uživatele.',
    ],
  },
  {
    title: 'Majitelský přehled',
    icon: Briefcase,
    area: 'Přehled',
    summary: 'Nadstavba pro roli majitel s čísly, která běžný admin nemusí vidět.',
    features: [
      'Souhrn tržeb a výkonu firmy.',
      'Přehled důležitých metrik pro řízení provozu.',
      'Oddělená oprávnění přes capability owner dashboard.',
    ],
  },
  {
    title: 'Poptávky',
    icon: Inbox,
    area: 'Catering',
    summary: 'Zachycení nových poptávek a jejich převod do obchodního procesu.',
    features: [
      'Evidence nových poptávek ze zdrojů i ručního zadání.',
      'Rychlé navázání na klienta a zakázku.',
      'Notifikace nových poptávek v menu.',
    ],
  },
  {
    title: 'Nabídky',
    icon: FileText,
    area: 'Catering',
    summary: 'Tvorba a správa cenových nabídek pro klienty.',
    features: [
      'Editor nabídky s položkami a výpočty.',
      'PDF výstup a e-mailové odeslání.',
      'Klientský veřejný odkaz na nabídku.',
      'Interaktivní výběr menu pro klienta.',
    ],
  },
  {
    title: 'Zakázky',
    icon: ClipboardList,
    area: 'Catering',
    summary: 'Centrální evidence akcí od poptávky po realizaci a archiv.',
    features: [
      'Detail akce, klient, termín, místo, počty hostů a stav.',
      'Výrobní list, komando, dokumenty, faktury a nabídky.',
      'Přiřazení personálu včetně dostupnosti a absencí.',
      'Debrief prostoru a provozní poznámky po akci.',
      'Archivace a obnova zakázek.',
    ],
  },
  {
    title: 'Kalendář a kapacity',
    icon: Calendar,
    area: 'Catering',
    summary: 'Kalendář akcí a provozní vytíženost v čase.',
    features: [
      'Přehled akcí v kalendářním zobrazení.',
      'Denní kapacitní limity a barevná indikace vytížení.',
      'Google Calendar integrace pro firemní sdílený kalendář.',
    ],
  },
  {
    title: 'Fakturace',
    icon: Receipt,
    area: 'Catering',
    summary: 'Vystavení a sledování faktur k zakázkám.',
    features: [
      'Seznam a detail faktur.',
      'PDF faktura a e-mailové odeslání.',
      'Stavy faktur a přehled platebních informací.',
      'Položky z ceníku a ruční položky.',
    ],
  },
  {
    title: 'Klienti',
    icon: Users,
    area: 'Správa',
    summary: 'CRM databáze kontaktů a firem.',
    features: [
      'Evidence soukromých i firemních klientů.',
      'Kontaktní údaje, zdroj, poznámky a VIP/pravidelní klienti.',
      'Import klientů a archivace.',
      'Napojení na zakázky, nabídky a komunikaci.',
    ],
  },
  {
    title: 'Personál',
    icon: UserCheck,
    area: 'Správa',
    summary: 'Správa interních lidí, externistů a jejich přiřazení na akce.',
    features: [
      'Evidence osob, rolí, kontaktů a aktivity.',
      'Přiřazení personálu k zakázkám.',
      'Absence a dovolené pro kontrolu dostupnosti.',
      'Archivace osob bez ztráty historie.',
    ],
  },
  {
    title: 'Prostory',
    icon: Building2,
    area: 'Správa',
    summary: 'Databáze míst a provozních pravidel pro catering.',
    features: [
      'Kontakty na místo, přístupová pravidla a loading zóny.',
      'Servisní prostory, trasy, parkování a restrikce.',
      'Opakující se problémy a debrief po akci.',
      'Návrh promítnutí zkušeností zpět do master dat prostoru.',
    ],
  },
  {
    title: 'Gastro',
    icon: FlaskConical,
    area: 'Gastro',
    summary: 'Suroviny, receptury a podklady pro kuchyňské kalkulace.',
    features: [
      'Evidence surovin, cen, výtěžnosti, odpadu a alergenů.',
      'Receptury a jejich verze.',
      'Kalkulace nákladů a food cost.',
      'Tisk receptury nebo pracovního postupu pro provoz.',
    ],
  },
  {
    title: 'Ceníky',
    icon: Tag,
    area: 'Data',
    summary: 'Ceníkové položky pro nabídky, faktury a kalkulace.',
    features: [
      'Kategorie položek jako jídlo, nápoje, personál, doprava nebo pronájem.',
      'Nákupní a prodejní ceny, jednotky a DPH.',
      'Použití v nabídkách a fakturách.',
    ],
  },
  {
    title: 'Dokumenty',
    icon: FolderOpen,
    area: 'Data',
    summary: 'Správa příloh, složek a souborů k provozu i zakázkám.',
    features: [
      'Upload a download dokumentů.',
      'Složky a organizace firemních souborů.',
      'Vazby dokumentů na zakázky a klientský portál.',
    ],
  },
  {
    title: 'E-mail',
    icon: Mail,
    area: 'Komunikace',
    summary: 'Inbox a odesílání e-mailů přímo z CRM.',
    features: [
      'IMAP připojení pro čtení a správu pošty.',
      'SMTP nastavení pro odesílání zpráv.',
      'Propojení e-mailu se zakázkou.',
      'Šablony odpovědí, potvrzení a děkovacích e-mailů.',
    ],
  },
  {
    title: 'Poukazy',
    icon: Gift,
    area: 'Prodej',
    summary: 'Dárkové poukazy, jejich vzhled, tisk, e-mail a veřejný shop.',
    features: [
      'Ruční tvorba poukazů v administraci.',
      'Jednotná šablona pro tisk, PDF a e-mail.',
      'Per-voucher vzhled: šablona, barva, patička a obrázek.',
      'QR ověření poukazu bez CDN.',
      'Automatická expirace poukazů cronem.',
      'Veřejný voucher shop s bankovním převodem, VS a SPAYD QR platbou.',
      'Admin přehled objednávek, ruční potvrzení platby a plánované odeslání.',
    ],
  },
  {
    title: 'Reporty',
    icon: BarChart2,
    area: 'Data',
    summary: 'Přehledy výkonu, tržeb a obchodních statistik.',
    features: [
      'Dashboard summary a reportovací pohledy.',
      'Přehled zakázek a faktur podle období.',
      'Podklady pro majitelské rozhodování.',
    ],
  },
  {
    title: 'Archiv',
    icon: Archive,
    area: 'Data',
    summary: 'Oddělený pohled na archivované záznamy.',
    features: [
      'Archivované zakázky, klienti a personál.',
      'Možnost obnovit záznam zpět do aktivní evidence.',
      'Udržení historie bez zahlcení běžných seznamů.',
    ],
  },
  {
    title: 'Šablony',
    icon: BookCopy,
    area: 'Catering',
    summary: 'Opakovatelné předlohy pro zakázky a nabídky.',
    features: [
      'Šablony typických akcí.',
      'Předvyplnění nové zakázky.',
      'Úspora času u opakovaných formátů cateringu.',
    ],
  },
  {
    title: 'Klientský portál',
    icon: BookOpenText,
    area: 'Externí přístup',
    summary: 'Bezpečný veřejný přístup pro klienta k jeho zakázkám a dokumentům.',
    features: [
      'Magic link přihlášení bez hesla.',
      'Přehled klientových zakázek.',
      'Dokumenty, faktury a nabídky dostupné mimo administraci.',
    ],
  },
  {
    title: 'Nastavení',
    icon: Settings,
    area: 'Administrace',
    summary: 'Konfigurace firmy, uživatelů, modulů, integrací a systémových pravidel.',
    features: [
      'Profil firmy, logo, barvy, písmo a branding výstupů.',
      'Uživatelé, role admin/majitel/super admin a oprávnění.',
      'Zapínání a vypínání modulů.',
      'SMTP, IMAP, Google Calendar, zálohy a notifikační pravidla.',
      'Nastavení veřejného shopu poukazů.',
    ],
  },
  {
    title: 'Error log a bezpečnost',
    icon: ShieldAlert,
    area: 'Administrace',
    summary: 'Technický dohled nad chybami, přihlášením a provozem aplikace.',
    features: [
      'Backend error log s metadaty requestu.',
      'Sentry integrace podle konfigurace.',
      'Login log a přehled neúspěšných přihlášení.',
      'Health check a inicializační stav databáze.',
    ],
  },
];

const AREAS = ['Vše', ...Array.from(new Set(MODULES.map((module) => module.area)))];

export default function FunctionsPage() {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('Vše');

  const filteredModules = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return MODULES.filter((module) => {
      const matchesArea = area === 'Vše' || module.area === area;
      if (!matchesArea) return false;
      if (!needle) return true;
      const haystack = [
        module.title,
        module.area,
        module.summary,
        ...module.features,
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [area, query]);

  return (
    <div>
      <PageHeader
        title="Funkce CRM"
        subtitle="Přehled modulů, workflow a hlavních možností aplikace."
      />

      <div className="px-8 pb-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              className="w-full rounded-xl border border-stone-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400"
              placeholder="Hledat funkci, modul nebo workflow..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {AREAS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setArea(item)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  area === item
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-8 pb-8 xl:grid-cols-2">
        {filteredModules.map((module) => {
          const Icon = module.icon;
          return (
            <section key={module.title} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <Icon size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-stone-900">{module.title}</h2>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">
                      {module.area}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-stone-500">{module.summary}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2">
                {module.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm leading-6 text-stone-700">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
