import { useState, useRef, useCallback } from 'react';
import { Upload, X, AlertCircle, CheckCircle2, ChevronDown, FileText, Loader2 } from 'lucide-react';
import { klientiApi, personalApi } from '../api';
import toast from 'react-hot-toast';

// ── CSV parser (handles ; and , separators, quoted fields, BOM) ────────────────
function parseCsv(text) {
  // Odstraň UTF-8 BOM
  const raw = text.replace(/^\uFEFF/, '');
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  // Detekuj oddělovač: ; nebo ,
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';

  const parseRow = (line) => {
    const fields = [];
    let cur = '';
    let inQ  = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  };

  const headers = parseRow(lines[0]);
  const rows    = lines.slice(1).map(l => {
    const vals = parseRow(l);
    return headers.reduce((obj, h, i) => { obj[h] = vals[i] ?? ''; return obj; }, {});
  });
  return { headers, rows };
}

// ── Definice polí pro každý typ importu ───────────────────────────────────────
const KLIENTI_FIELDS = [
  { key: 'jmeno',    label: 'Jméno',     required: true,
    aliases: ['jmeno','jméno','first name','first','křestní jméno','name'] },
  { key: 'prijmeni', label: 'Příjmení',
    aliases: ['prijmeni','příjmení','last name','surname','last'] },
  { key: 'firma',    label: 'Firma',
    aliases: ['firma','company','společnost','organization','org'] },
  { key: 'typ',      label: 'Typ (soukromy/firma)',
    aliases: ['typ','type','kategorie'] },
  { key: 'email',    label: 'E-mail',
    aliases: ['email','e-mail','mail'] },
  { key: 'telefon',  label: 'Telefon',
    aliases: ['telefon','phone','tel','mobile','mobil','tel.'] },
  { key: 'adresa',   label: 'Adresa',
    aliases: ['adresa','address','ulice'] },
  { key: 'ico',      label: 'IČO',
    aliases: ['ico','ičo','ic','ič'] },
  { key: 'dic',      label: 'DIČ',
    aliases: ['dic','dič'] },
  { key: 'poznamka', label: 'Poznámka',
    aliases: ['poznamka','poznámka','note','notes','pozn'] },
];

const PERSONAL_FIELDS = [
  { key: 'jmeno',    label: 'Jméno',     required: true,
    aliases: ['jmeno','jméno','first name','first','name'] },
  { key: 'prijmeni', label: 'Příjmení',  required: true,
    aliases: ['prijmeni','příjmení','last name','surname','last'] },
  { key: 'typ',      label: 'Typ (interni/externi)',
    aliases: ['typ','type','kategorie'] },
  { key: 'role',     label: 'Role / pozice',
    aliases: ['role','pozice','position','job','funkce'] },
  { key: 'email',    label: 'E-mail',
    aliases: ['email','e-mail','mail'] },
  { key: 'telefon',  label: 'Telefon',
    aliases: ['telefon','phone','tel','mobile','mobil','tel.'] },
  { key: 'poznamka', label: 'Poznámka',
    aliases: ['poznamka','poznámka','note','notes'] },
];

// ── Automatické mapování sloupců ───────────────────────────────────────────────
function autoMap(headers, fields) {
  const mapping = {}; // field.key → csvHeader | ''
  for (const f of fields) {
    const match = headers.find(h =>
      f.aliases.some(a => a.toLowerCase() === h.toLowerCase().trim())
    );
    mapping[f.key] = match || '';
  }
  return mapping;
}

// ── Transformace řádku CSV → objekt pole ───────────────────────────────────────
function applyMapping(csvRow, mapping) {
  const obj = {};
  for (const [key, header] of Object.entries(mapping)) {
    if (header) obj[key] = (csvRow[header] || '').trim();
  }
  return obj;
}

// ── Hlavní komponenta ──────────────────────────────────────────────────────────
export function ImportModal({ type, onClose, onDone }) {
  const isKlienti = type === 'klienti';
  const fields    = isKlienti ? KLIENTI_FIELDS : PERSONAL_FIELDS;
  const apiCall   = isKlienti ? klientiApi.import : personalApi.import;
  const title     = isKlienti ? 'Import klientů' : 'Import zaměstnanců';

  const fileRef  = useRef(null);
  const [step,    setStep]    = useState('upload');   // upload | map | preview | result
  const [headers, setHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver,setDragOver]= useState(false);

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.match(/\.(csv|txt)$/i))
      return toast.error('Vyberte CSV soubor');
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers: h, rows: r } = parseCsv(e.target.result);
      if (h.length === 0) return toast.error('Soubor je prázdný nebo nelze přečíst');
      setHeaders(h);
      setCsvRows(r);
      setMapping(autoMap(h, fields));
      setStep('map');
    };
    reader.readAsText(file, 'UTF-8');
  }, [fields]);

  const mappedRows = csvRows.map(r => applyMapping(r, mapping));
  const validRows  = mappedRows.filter(r => {
    if (isKlienti) return r.jmeno || r.firma;
    return r.jmeno;
  });

  const doImport = async () => {
    setLoading(true);
    try {
      const res = await apiCall(validRows);
      setResult(res.data);
      setStep('result');
      onDone?.();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Import selhal');
    }
    setLoading(false);
  };

  const EMPTY_COL = '— ignorovat —';

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-brand-600"/>
            <span className="font-semibold text-stone-800 text-sm">{title}</span>
          </div>
          <div className="flex items-center gap-4">
            {/* Steps */}
            <div className="flex items-center gap-1.5 text-xs">
              {[['upload','1. Soubor'],['map','2. Mapování'],['preview','3. Náhled'],['result','4. Výsledek']].map(([s, l]) => (
                <span key={s} className={`px-2 py-0.5 rounded-full ${step === s ? 'bg-stone-800 text-white font-medium' : 'text-stone-400'}`}>{l}</span>
              ))}
            </div>
            <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 rounded-lg"><X size={16}/></button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Krok 1: Upload ── */}
          {step === 'upload' && (
            <div className="p-8">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-brand-400 bg-brand-50' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'}`}
              >
                <Upload size={32} className="mx-auto text-stone-300 mb-3"/>
                <div className="text-sm font-semibold text-stone-700">Přetáhněte CSV soubor sem</div>
                <div className="text-xs text-stone-400 mt-1">nebo klikněte pro výběr</div>
                <div className="text-xs text-stone-400 mt-3">Podporované formáty: CSV (oddělovač ; nebo ,) · Kódování: UTF-8</div>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                onChange={e => handleFile(e.target.files?.[0])}/>

              {/* Vzorový CSV */}
              <div className="mt-5 bg-stone-50 rounded-xl border border-stone-200 p-4">
                <div className="text-xs font-semibold text-stone-600 mb-2">Vzorový formát CSV</div>
                <pre className="text-xs text-stone-500 overflow-x-auto">
{isKlienti
  ? 'jmeno;prijmeni;firma;email;telefon;adresa;ico;dic\nJan;Novák;Novák s.r.o.;jan@novak.cz;+420123456789;Masarykova 1 Praha;;'
  : 'jmeno;prijmeni;role;typ;email;telefon\nJana;Horáková;Číšník;interni;jana@catering.cz;+420777000111'}
                </pre>
                <div className="text-xs text-stone-400 mt-2">
                  {isKlienti
                    ? 'Duplicity jsou přeskočeny podle e-mailu. Záznamy bez jména ani firmy jsou přeskočeny.'
                    : 'Duplicity jsou přeskočeny podle e-mailu. Záznamy bez jména jsou přeskočeny.'}
                </div>
              </div>
            </div>
          )}

          {/* ── Krok 2: Mapování sloupců ── */}
          {step === 'map' && (
            <div className="p-6 space-y-4">
              <div className="text-xs text-stone-500">
                Přiřaďte sloupce z CSV k polím. Automaticky bylo detekováno <strong>{Object.values(mapping).filter(Boolean).length}</strong> z {fields.length} polí.
              </div>
              <div className="grid grid-cols-2 gap-3">
                {fields.map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-medium text-stone-700 block mb-1">
                      {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <div className="relative">
                      <select
                        className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none appearance-none pr-7 ${mapping[f.key] ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-stone-200 text-stone-500'}`}
                        value={mapping[f.key] || ''}
                        onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                      >
                        <option value="">{EMPTY_COL}</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <ChevronDown size={12} className="absolute right-2 top-2.5 text-stone-400 pointer-events-none"/>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-stone-400 bg-stone-50 rounded-lg px-3 py-2">
                Soubor obsahuje <strong>{csvRows.length}</strong> řádků dat.
                Po mapování bude připraveno k importu: <strong>{validRows.length}</strong> záznamů.
              </div>
            </div>
          )}

          {/* ── Krok 3: Náhled ── */}
          {step === 'preview' && (
            <div className="p-6 space-y-3">
              <div className="text-xs text-stone-500">
                Náhled prvních 5 záznamů z <strong>{validRows.length}</strong> připravených k importu.
              </div>
              <div className="overflow-x-auto rounded-xl border border-stone-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200">
                      {fields.filter(f => mapping[f.key]).map(f => (
                        <th key={f.key} className="px-3 py-2 text-left font-semibold text-stone-600 whitespace-nowrap">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {validRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-stone-50">
                        {fields.filter(f => mapping[f.key]).map(f => (
                          <td key={f.key} className="px-3 py-2 text-stone-700 max-w-[150px] truncate">
                            {row[f.key] || <span className="text-stone-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validRows.length > 5 && (
                <div className="text-xs text-stone-400">… a {validRows.length - 5} dalších záznamů</div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                ⚠️ Import nelze vrátit zpět. Záznamy s duplicitním e-mailem budou přeskočeny.
              </div>
            </div>
          )}

          {/* ── Krok 4: Výsledek ── */}
          {step === 'result' && result && (
            <div className="p-8 space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="text-2xl font-bold text-emerald-700">{result.imported}</div>
                  <div className="text-xs text-emerald-600 mt-1">Importováno</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="text-2xl font-bold text-amber-700">{result.skipped}</div>
                  <div className="text-xs text-amber-600 mt-1">Přeskočeno (duplicity)</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="text-2xl font-bold text-red-700">{result.errors?.length || 0}</div>
                  <div className="text-xs text-red-600 mt-1">Chyby</div>
                </div>
              </div>

              {result.errors?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1 max-h-40 overflow-y-auto">
                  <div className="text-xs font-semibold text-red-700 mb-2">Chybné záznamy:</div>
                  {result.errors.map((e, i) => (
                    <div key={i} className="text-xs text-red-600">Řádek {e.row}: {e.reason}</div>
                  ))}
                </div>
              )}

              {result.imported > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 size={16}/>
                  Import byl úspěšně dokončen
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-stone-100 flex-shrink-0">
          <button onClick={onClose} className="text-sm text-stone-400 hover:text-stone-600 px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors">
            {step === 'result' ? 'Zavřít' : 'Zrušit'}
          </button>
          <div className="flex gap-2">
            {step === 'map' && (
              <button onClick={() => setStep('upload')}
                className="text-sm px-4 py-2 border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 transition-colors">
                Zpět
              </button>
            )}
            {step === 'preview' && (
              <button onClick={() => setStep('map')}
                className="text-sm px-4 py-2 border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 transition-colors">
                Zpět
              </button>
            )}
            {step === 'map' && (
              <button
                onClick={() => setStep('preview')}
                disabled={validRows.length === 0}
                className="text-sm px-4 py-2 bg-stone-800 text-white rounded-xl hover:bg-stone-700 disabled:opacity-40 transition-colors">
                Náhled ({validRows.length})
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={doImport}
                disabled={loading || validRows.length === 0}
                className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-40 transition-colors font-semibold">
                {loading ? <><Loader2 size={14} className="animate-spin"/>Importuji…</> : <>Spustit import ({validRows.length})</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImportModal;
