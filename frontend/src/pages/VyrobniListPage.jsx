import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { productionApi } from '../api';
import { formatDatum } from '../components/ui';
import { ArrowLeft, Printer, ChefHat, AlertTriangle, Package, Users, Truck, Zap } from 'lucide-react';

const TYP_LABEL_VL = {
  svatba:        'Svatba',
  soukroma_akce: 'Soukromá akce',
  firemni_akce:  'Firemní akce',
  zavoz:         'Závoz',
  bistro:        'Bistro',
};

const KAT_COLOR = {
  jidlo:    'bg-amber-100 text-amber-800',
  napoje:   'bg-blue-100 text-blue-800',
  vybaveni: 'bg-stone-100 text-stone-700',
  pronajem: 'bg-purple-100 text-purple-700',
  doprava:  'bg-green-100 text-green-700',
  personal: 'bg-rose-100 text-rose-700',
  externi:  'bg-orange-100 text-orange-700',
};

function SectionHeader({ icon: Icon, title, count, color = 'text-stone-700' }) {
  return (
    <div className={`flex items-center gap-2 mb-3 pb-2 border-b border-stone-200 ${color}`}>
      <Icon size={16} />
      <h3 className="font-semibold text-sm">{title}</h3>
      {count != null && (
        <span className="ml-auto text-xs bg-stone-100 text-stone-600 rounded-full px-2 py-0.5">{count} položek</span>
      )}
    </div>
  );
}

export function VyrobniListPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['vyrobni-list', id],
    queryFn: () => productionApi.sheetV2(id),
  });

  const sheet = data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-stone-400 text-sm">Generuji výrobní list…</div>
      </div>
    );
  }

  if (error || !sheet) {
    return (
      <div className="p-6">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 mb-4 transition-colors">
          <ArrowLeft size={12} /> Zpět
        </button>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-800 text-sm">
          <strong>Nelze vygenerovat výrobní list.</strong><br/>
          {error?.response?.data?.error || 'K zakázce není přiřazena žádná kalkulace. Nejprve vytvořte kalkulaci v editoru nabídky.'}
        </div>
      </div>
    );
  }

  const mul = sheet.spotreba?.multipliers || {};
  const mulPct = (v) => v != null ? `${Math.round(v * 100)} %` : '—';

  return (
    <div>
      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-6 py-4 print:hidden">
        <button onClick={() => navigate(`/zakazky/${id}`)}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 mb-3 transition-colors">
          <ArrowLeft size={12} /> {sheet.cislo}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ChefHat size={18} className="text-stone-600" />
              <h1 className="text-base font-semibold text-stone-900">Výrobní list</h1>
              <span className="text-xs bg-stone-100 text-stone-600 rounded-full px-2.5 py-0.5">
                {TYP_LABEL_VL[sheet.typ] || sheet.typ}
              </span>
            </div>
            <div className="text-xs text-stone-400 mt-0.5">
              {sheet.nazev} · {formatDatum(sheet.datum_akce)}
              {sheet.cas_zacatek && ` · ${sheet.cas_zacatek}`}
              {sheet.misto && ` · ${sheet.misto}`}
            </div>
          </div>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors">
            <Printer size={14} /> Tisknout
          </button>
        </div>
      </div>

      {/* Print title */}
      <div className="hidden print:block px-6 pt-4 pb-2 border-b border-stone-300">
        <div className="text-lg font-bold">Výrobní list – {sheet.cislo}</div>
        <div className="text-sm text-stone-600">
          {sheet.nazev} · {formatDatum(sheet.datum_akce)}
          {sheet.cas_zacatek && ` · ${sheet.cas_zacatek}–${sheet.cas_konec || ''}`}
          {sheet.misto && ` · ${sheet.misto}`}
          {sheet.klient && ` · ${sheet.klient}`}
        </div>
        <div className="text-xs text-stone-400 mt-0.5">
          Vygenerováno: {new Date(sheet.generated_at).toLocaleString('cs-CZ')} · Hostů: {sheet.pocet_hostu}
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-5xl">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Počet hostů',    value: sheet.pocet_hostu },
            { label: 'Odhad hmotnost', value: `${sheet.shrnuti?.total_weight_kg ?? 0} kg` },
            { label: 'Alergeny',       value: `${sheet.shrnuti?.pocet_alergen_skupin ?? 0} skupin` },
            { label: 'Typ akce',       value: TYP_LABEL_VL[sheet.typ] || sheet.typ },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-stone-200 p-3.5">
              <div className="text-xs text-stone-500 mb-0.5">{c.label}</div>
              <div className="text-base font-semibold text-stone-800">{c.value}</div>
            </div>
          ))}
        </div>

        {/* Multiplier info */}
        {sheet.typ && (
          <div className="bg-stone-50 rounded-xl border border-stone-200 p-4">
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Zap size={12} /> Koeficienty spotřeby pro {TYP_LABEL_VL[sheet.typ]}
            </div>
            <div className="grid grid-cols-4 gap-3 text-sm">
              {[
                { label: 'Jídlo',    val: mul.food },
                { label: 'Nápoje',   val: mul.napoje },
                { label: 'Vybavení', val: mul.vybaveni },
                { label: 'Rezerva',  val: mul.buffer },
              ].map(m => (
                <div key={m.label} className="text-center">
                  <div className="text-xs text-stone-500">{m.label}</div>
                  <div className={`font-semibold text-sm mt-0.5 ${m.val > 1 ? 'text-amber-700' : m.val < 1 ? 'text-blue-700' : 'text-stone-700'}`}>
                    {mulPct(m.val)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section A: Mise en place */}
        {sheet.sekce_a?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={Package} title="A – Mise en place (objednávky & příprava)" count={sheet.sekce_a.length} color="text-amber-700" />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-100">
                  <th className="text-left pb-2 font-medium">Položka</th>
                  <th className="text-left pb-2 font-medium">Kategorie</th>
                  <th className="text-right pb-2 font-medium">Množství</th>
                  <th className="text-right pb-2 font-medium">Jednotka</th>
                  <th className="text-right pb-2 font-medium">/ host</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {sheet.sekce_a.map((p, i) => (
                  <tr key={i} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2 pr-4 font-medium text-stone-800">{p.nazev}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${KAT_COLOR[p.kategorie] || 'bg-stone-100 text-stone-600'}`}>
                        {p.kategorie}
                      </span>
                    </td>
                    <td className="py-2 text-right font-semibold text-stone-900">{p.mnozstvi}</td>
                    <td className="py-2 pl-1.5 text-right text-stone-500">{p.jednotka}</td>
                    <td className="py-2 pl-4 text-right text-stone-400 text-xs">
                      {p.na_hosta != null ? p.na_hosta : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Section B: Kompletace */}
        {sheet.sekce_b?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={ChefHat} title="B – Kompletace (přehled pokrmů)" count={sheet.sekce_b.length} color="text-stone-700" />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-100">
                  <th className="text-left pb-2 font-medium w-8">#</th>
                  <th className="text-left pb-2 font-medium">Pokrm / položka</th>
                  <th className="text-right pb-2 font-medium">Počet porcí</th>
                  <th className="text-right pb-2 font-medium">Jednotka</th>
                  <th className="text-right pb-2 font-medium print:w-32">Hotovo v</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {sheet.sekce_b.map((p) => (
                  <tr key={p.poradi} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2 text-stone-400 text-xs">{p.poradi}</td>
                    <td className="py-2 pr-4 font-medium text-stone-800">{p.nazev}</td>
                    <td className="py-2 text-right font-semibold text-stone-900">{p.porce}</td>
                    <td className="py-2 pl-1.5 text-right text-stone-500">{p.jednotka}</td>
                    <td className="py-2 pl-4 text-right">
                      <span className="inline-block w-20 border-b border-stone-300 text-xs text-stone-300">____</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Section C: Allergens */}
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <SectionHeader icon={AlertTriangle} title="C – Alergeny & diety" color="text-red-700" />
          {sheet.sekce_c_alergeny?.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sheet.sekce_c_alergeny.map((a) => (
                <div key={a.alergen} className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <div className="text-xs font-semibold text-red-700 mb-1">{a.alergen}</div>
                  <div className="text-xs text-red-600">{a.jidla.join(', ')}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400">Na základě názvů položek nebyly detekovány žádné alergeny. Ručně ověřte ingredience.</p>
          )}
          <p className="text-xs text-stone-400 mt-3">
            * Detekce alergenů je automatická a orientační. Vždy ověřte složení u dodavatelů.
          </p>
        </div>

        {/* Section D: Personnel */}
        {sheet.sekce_d_personal?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={Users} title="D – Personál (dle kalkulace)" count={sheet.sekce_d_personal.length} color="text-rose-700" />
            <div className="divide-y divide-stone-50">
              {sheet.sekce_d_personal.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-stone-800">{p.nazev}</span>
                  <span className="text-stone-600 font-medium">{p.mnozstvi} {p.jednotka}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section E: Logistics */}
        {sheet.sekce_e_logistika?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={Truck} title="E – Logistika & vybavení" count={sheet.sekce_e_logistika.length} color="text-green-700" />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-100">
                  <th className="text-left pb-2 font-medium">Položka</th>
                  <th className="text-left pb-2 font-medium">Typ</th>
                  <th className="text-right pb-2 font-medium">Množství</th>
                  <th className="text-right pb-2 font-medium">Jednotka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {sheet.sekce_e_logistika.map((p, i) => (
                  <tr key={i} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2 pr-4 font-medium text-stone-800">{p.nazev}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${KAT_COLOR[p.kategorie] || 'bg-stone-100 text-stone-600'}`}>
                        {p.kategorie}
                      </span>
                    </td>
                    <td className="py-2 text-right font-semibold text-stone-900">{p.mnozstvi}</td>
                    <td className="py-2 pl-1.5 text-right text-stone-500">{p.jednotka}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sheet.sekce_f_suroviny?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={Package} title="F – Agregovaný nákup surovin" count={sheet.sekce_f_suroviny.length} color="text-amber-700" />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-100">
                  <th className="text-left pb-2 font-medium">Surovina</th>
                  <th className="text-right pb-2 font-medium">Čisté množství</th>
                  <th className="text-right pb-2 font-medium">Nákupní množství</th>
                  <th className="text-right pb-2 font-medium">Náklad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {sheet.sekce_f_suroviny.map((row) => (
                  <tr key={`${row.ingredient_id}-${row.jednotka}`} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2 pr-4 font-medium text-stone-800">{row.ingredient_name}</td>
                    <td className="py-2 text-right text-stone-600">{row.mnozstvi} {row.jednotka}</td>
                    <td className="py-2 text-right text-stone-600">{row.nakupni_mnozstvi} {row.jednotka}</td>
                    <td className="py-2 text-right font-semibold text-stone-900">{Number(row.total_cost || 0).toLocaleString('cs-CZ')} Kč</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sheet.sekce_g_komponenty?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={ChefHat} title="G – Komponenty k přípravě" count={sheet.sekce_g_komponenty.length} color="text-stone-700" />
            <div className="space-y-2">
              {sheet.sekce_g_komponenty.map((row) => (
                <div key={`${row.recipe_id}-${row.jednotka}`} className="rounded-xl border border-stone-200 px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-stone-800">{row.recipe_name}</div>
                    <div className="text-xs text-stone-400">{row.mnozstvi} {row.jednotka}</div>
                  </div>
                  <div className="text-sm font-semibold text-stone-700">{Number(row.scaled_cost || 0).toLocaleString('cs-CZ')} Kč</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {sheet.sekce_h_receptury?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={ChefHat} title="H – Recepturové karty v zakázce" count={sheet.sekce_h_receptury.length} color="text-blue-700" />
            <div className="space-y-3">
              {sheet.sekce_h_receptury.map((row) => (
                <div key={`${row.kalkulace_polozka_id}-${row.recipe_version_id}`} className="rounded-xl border border-stone-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-stone-800">{row.recipe_name}</div>
                      <div className="text-xs text-stone-400">verze {row.version_number} · {row.requested_quantity} {row.requested_unit}</div>
                    </div>
                    <div className="text-sm font-semibold text-stone-700">{Number(row.scaled_cost || 0).toLocaleString('cs-CZ')} Kč</div>
                  </div>
                  {row.allergens?.length > 0 && (
                    <div className="mt-2 text-xs text-stone-500">Alergeny: {row.allergens.join(', ')}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Spotřeba detail */}
        {sheet.spotreba?.polozky?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <SectionHeader icon={Zap} title="Spotřeba s koeficienty (detail)" color="text-stone-600" />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-100">
                  <th className="text-left pb-2 font-medium">Položka</th>
                  <th className="text-right pb-2 font-medium">Základ</th>
                  <th className="text-right pb-2 font-medium">Upraveno</th>
                  <th className="text-right pb-2 font-medium">Rozdíl</th>
                  <th className="text-left pb-2 pl-3 font-medium">Kat.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {sheet.spotreba.polozky.map((p, i) => (
                  <tr key={i} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2 pr-4 text-stone-800">{p.nazev}</td>
                    <td className="py-2 text-right text-stone-500">{p.base_mnozstvi} {p.jednotka}</td>
                    <td className="py-2 text-right font-semibold text-stone-900">{p.adjusted_mnozstvi} {p.jednotka}</td>
                    <td className={`py-2 text-right text-xs font-medium ${p.rozdil > 0 ? 'text-amber-700' : 'text-stone-400'}`}>
                      {p.rozdil > 0 ? `+${p.rozdil}` : p.rozdil}
                    </td>
                    <td className="py-2 pl-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs ${KAT_COLOR[p.kategorie] || 'bg-stone-100 text-stone-600'}`}>
                        {p.kategorie}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 pt-3 border-t border-stone-100 flex justify-end gap-6 text-sm">
              <span className="text-stone-500">Základní náklady: <strong>{sheet.spotreba.total_nakup_base?.toLocaleString('cs-CZ')} Kč</strong></span>
              <span className="text-stone-500">Upravené náklady: <strong>{sheet.spotreba.total_nakup_adjusted?.toLocaleString('cs-CZ')} Kč</strong></span>
              {sheet.spotreba.extra_naklady > 0 && (
                <span className="text-amber-700">Příplatek za koeficient: <strong>+{sheet.spotreba.extra_naklady?.toLocaleString('cs-CZ')} Kč</strong></span>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default VyrobniListPage;
