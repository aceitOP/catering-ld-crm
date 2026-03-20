import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { publicProposalApi } from '../api';

const EU_ALERGENY_ICONS = {
  1:'🌾',2:'🦐',3:'🥚',4:'🐟',5:'🥜',
  6:'🫘',7:'🥛',8:'🌰',9:'🌿',10:'🌼',
  11:'🌱',12:'🍷',13:'🌾',14:'🦑',
};

function czk2(n) {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n || 0);
}

function datum2(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ClientProposalPage() {
  const { token } = useParams();
  const qc = useQueryClient();

  const [confirmModal, setConfirmModal] = useState(false);
  const [confirmForm, setConfirmForm] = useState({ signed_by: '', souhlas: false });
  const [noteOpen, setNoteOpen] = useState({});
  const [notes, setNotes] = useState({});
  const [confirmed, setConfirmed] = useState(null);

  const { data: raw, isLoading, error } = useQuery({
    queryKey: ['pub-proposal', token],
    queryFn: () => publicProposalApi.get(token),
    staleTime: 0,
    retry: false,
  });

  const proposal = raw?.data;

  const selectMut = useMutation({
    mutationFn: ({ polozka_id, je_vybrana }) =>
      publicProposalApi.select(token, { polozka_id, je_vybrana }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pub-proposal', token] }),
    onError: (err) => {
      const msg = err?.response?.data?.error;
      if (msg) alert(msg);
    },
  });

  const noteMut = useMutation({
    mutationFn: ({ polozka_id, poznamka }) =>
      publicProposalApi.note(token, { polozka_id, poznamka }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pub-proposal', token] }),
  });

  const confirmMut = useMutation({
    mutationFn: (d) => publicProposalApi.confirm(token, d),
    onSuccess: (res) => {
      setConfirmed(res.data);
      setConfirmModal(false);
    },
  });

  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-purple-50 flex items-center justify-center">
      <div className="text-stone-400 text-sm">Načítám nabídku…</div>
    </div>
  );

  if (error || !proposal) return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-purple-50 flex items-center justify-center">
      <div className="text-center max-w-sm mx-auto px-6">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="text-lg font-semibold text-stone-800 mb-2">Odkaz nenalezen</h1>
        <p className="text-sm text-stone-500">Tento odkaz neexistuje nebo vypršela jeho platnost.</p>
      </div>
    </div>
  );

  const locked = proposal.locked;
  const isSigned = proposal.status === 'signed';
  const selectedItems = (proposal.sekce || []).flatMap(s => (s.polozky || []).filter(p => p.je_vybrana));
  const totalPerPerson = selectedItems.reduce((sum, p) => sum + parseFloat(p.cena_os || 0), 0);
  const totalPrice = totalPerPerson * (proposal.guest_count || 1);

  if (confirmed || isSigned) {
    const signedBy = confirmed?.signed_by || proposal.signed_by;
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-700 to-emerald-600 p-8 text-center">
            <div className="text-5xl mb-3">✅</div>
            <h1 className="text-xl font-bold text-white">Výběr potvrzen!</h1>
            {signedBy && <p className="text-green-200 text-sm mt-1">Potvrdil(a): {signedBy}</p>}
          </div>
          <div className="p-6">
            <p className="text-stone-700 text-sm text-center mb-4">
              Váš výběr menu byl závazně potvrzen. Na email jsme zaslali souhrn Vašeho výběru.
            </p>
            {selectedItems.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Potvrzený výběr</div>
                {selectedItems.map(item => (
                  <div key={item.id} className="flex justify-between text-sm py-1.5 border-b border-stone-50 last:border-0">
                    <span className="text-stone-700">{item.nazev}</span>
                    <span className="text-stone-500 text-xs">{czk2(item.cena_os)} / os.</span>
                  </div>
                ))}
                <div className="pt-3 flex justify-between text-sm font-semibold">
                  <span className="text-stone-700">Celková cena ({proposal.guest_count} hostů)</span>
                  <span className="text-purple-700">{czk2(totalPrice)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="bg-stone-50 px-6 py-4 text-center">
            <p className="text-xs text-stone-400">Catering LD · info@catering-ld.cz</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="bg-gradient-to-r from-[#2d1b69] to-[#5b21b6] text-white px-6 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-purple-300 text-xs mb-1">🍽️ Výběr menu</div>
          <h1 className="text-lg font-bold">{proposal.nazev || 'Výběr menu'}</h1>
          {proposal.zakazka_nazev && (
            <p className="text-purple-200 text-sm mt-0.5">{proposal.zakazka_nazev}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-3 text-xs text-purple-200">
            {proposal.datum_akce && <span>📅 {datum2(proposal.datum_akce)}</span>}
            {proposal.misto && <span>📍 {proposal.misto}</span>}
            <span>👥 {proposal.guest_count} hostů</span>
          </div>
        </div>
      </div>

      {locked && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="max-w-2xl mx-auto text-sm text-amber-800 font-medium flex items-center gap-2">
            🔒 {isSigned ? 'Výběr byl závazně potvrzen.' : 'Výběr menu je uzamčen a nelze upravovat.'}
          </div>
        </div>
      )}

      {proposal.uvodni_text && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-white rounded-xl border border-purple-100 p-4 text-sm text-stone-700 leading-relaxed border-l-4 border-l-purple-400">
            {proposal.uvodni_text}
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-5 pb-40">
        {(proposal.sekce || []).map(sekce => {
          const selected = (sekce.polozky || []).filter(p => p.je_vybrana);
          const isMulti = sekce.typ === 'multi';
          const atMax = isMulti && selected.length >= sekce.max_vyberu;

          return (
            <div key={sekce.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-stone-100 bg-stone-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-stone-800">{sekce.nazev}</h2>
                    {sekce.popis && <p className="text-xs text-stone-500 mt-0.5">{sekce.popis}</p>}
                  </div>
                  <div className="flex-shrink-0 flex gap-1.5">
                    {isMulti ? (
                      <span className="inline-flex items-center bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                        Vyberte {sekce.min_vyberu}–{sekce.max_vyberu}
                      </span>
                    ) : (
                      <span className="inline-flex items-center bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full">
                        Vyberte 1
                      </span>
                    )}
                    {sekce.povinne && (
                      <span className="inline-flex items-center bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full">Povinné</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-stone-50">
                {(sekce.polozky || []).map(item => {
                  const isSelected = item.je_vybrana;
                  const canSelect = !locked && (!atMax || isSelected);
                  const noteIsOpen = noteOpen[item.id];
                  const currentNote = notes[item.id] ?? item.poznamka_klienta ?? '';

                  return (
                    <div key={item.id} className={`transition-colors ${isSelected ? 'bg-purple-50' : 'bg-white'}`}>
                      <div
                        onClick={() => {
                          if (!canSelect && !isSelected) return;
                          if (locked) return;
                          selectMut.mutate({ polozka_id: item.id, je_vybrana: !isSelected });
                        }}
                        className={`flex gap-3 p-4 ${!locked ? 'cursor-pointer' : 'cursor-default'}`}>

                        <div className="flex-shrink-0">
                          {item.obrazek_url ? (
                            <img src={item.obrazek_url} alt={item.nazev}
                              className="w-16 h-16 rounded-xl object-cover"/>
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-stone-100 flex items-center justify-center text-2xl">🍽️</div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-semibold text-stone-800 leading-snug">{item.nazev}</div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-sm font-bold text-purple-700">{czk2(item.cena_os)}</div>
                              <div className="text-xs text-stone-400">/ os.</div>
                            </div>
                          </div>
                          {item.popis && <p className="text-xs text-stone-500 mt-1 leading-relaxed">{item.popis}</p>}
                          {item.alergeny_nazvy?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {item.alergeny_nazvy.map((name, i) => (
                                <span key={i} className="inline-flex items-center gap-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-1.5 py-0.5 rounded-md">
                                  {EU_ALERGENY_ICONS[item.alergeny?.[i]] || '⚠'} {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex-shrink-0 flex items-center">
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'bg-purple-600 border-purple-600' :
                            canSelect ? 'border-stone-300 hover:border-purple-400' : 'border-stone-200 opacity-40'
                          }`}>
                            {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                          </div>
                        </div>
                      </div>

                      {isSelected && !locked && (
                        <div className="px-4 pb-3 -mt-1">
                          <button
                            onClick={() => setNoteOpen(n => ({ ...n, [item.id]: !n[item.id] }))}
                            className="text-xs text-stone-400 hover:text-purple-600 flex items-center gap-1 transition-colors">
                            {noteIsOpen ? '▾' : '▸'} {currentNote ? '📝 ' + currentNote.slice(0, 40) + (currentNote.length > 40 ? '…' : '') : 'Přidat speciální požadavek'}
                          </button>
                          {noteIsOpen && (
                            <div className="mt-2 flex gap-2">
                              <textarea
                                className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-purple-400"
                                rows={2}
                                placeholder="Alergie, bezlepková verze, jiná úprava…"
                                value={currentNote}
                                onChange={e => setNotes(n => ({ ...n, [item.id]: e.target.value }))}
                              />
                              <button
                                onClick={() => {
                                  noteMut.mutate({ polozka_id: item.id, poznamka: notes[item.id] ?? '' });
                                  setNoteOpen(n => ({ ...n, [item.id]: false }));
                                }}
                                className="flex-shrink-0 bg-purple-600 text-white text-xs px-3 py-1 rounded-lg hover:bg-purple-700 transition-colors self-start">
                                Uložit
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {isSelected && locked && item.poznamka_klienta && (
                        <div className="px-4 pb-3 -mt-1">
                          <span className="text-xs text-orange-600">⚠ {item.poznamka_klienta}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {proposal.expires_at && !isSigned && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            ⏰ Výběr musí být dokončen do: <strong>{datum2(proposal.expires_at)}</strong>
          </div>
        )}
      </div>

      {!locked && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-xl px-4 py-3 z-50">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-stone-500">Cena / os.</div>
              <div className="text-base font-bold text-stone-800">{czk2(totalPerPerson)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-stone-400">{proposal.guest_count} hostů</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-stone-500">Celková cena</div>
              <div className="text-base font-bold text-purple-700">{czk2(totalPrice)}</div>
            </div>
            <button
              onClick={() => setConfirmModal(true)}
              disabled={selectedItems.length === 0}
              className="flex-shrink-0 bg-gradient-to-r from-[#2d1b69] to-[#5b21b6] text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity">
              Potvrdit výběr
            </button>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6">
              <h2 className="text-base font-bold text-stone-800 mb-1">Závazné potvrzení výběru</h2>
              <p className="text-sm text-stone-500 mb-4">Po potvrzení již nebude možné výběr měnit.</p>
              <div className="bg-stone-50 rounded-xl p-3 mb-4 text-sm space-y-1">
                {selectedItems.map(item => (
                  <div key={item.id} className="flex justify-between">
                    <span className="text-stone-700">{item.nazev}</span>
                    <span className="text-stone-500 text-xs">{czk2(item.cena_os)} / os.</span>
                  </div>
                ))}
                <div className="border-t border-stone-200 pt-2 mt-2 flex justify-between font-semibold">
                  <span>Celkem ({proposal.guest_count} hostů)</span>
                  <span className="text-purple-700">{czk2(totalPrice)}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Vaše jméno a příjmení *</label>
                  <input
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400"
                    placeholder="Jana Nováková"
                    value={confirmForm.signed_by}
                    onChange={e => setConfirmForm(f => ({ ...f, signed_by: e.target.value }))}
                    autoFocus
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmForm.souhlas}
                    onChange={e => setConfirmForm(f => ({ ...f, souhlas: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 accent-purple-600"
                  />
                  <span className="text-xs text-stone-600 leading-relaxed">
                    Souhlasím s výběrem menu a beru na vědomí, že tento výběr je závazný a nelze jej po potvrzení měnit.
                  </span>
                </label>
                {confirmMut.error && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {confirmMut.error?.response?.data?.error || 'Chyba při potvrzení'}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button
                onClick={() => setConfirmModal(false)}
                className="flex-1 border border-stone-200 text-stone-600 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors">
                Zrušit
              </button>
              <button
                onClick={() => confirmMut.mutate(confirmForm)}
                disabled={!confirmForm.signed_by.trim() || !confirmForm.souhlas || confirmMut.isPending}
                className="flex-1 bg-gradient-to-r from-[#2d1b69] to-[#5b21b6] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity">
                {confirmMut.isPending ? 'Potvrzuji…' : 'Závazně potvrdit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClientProposalPage;
