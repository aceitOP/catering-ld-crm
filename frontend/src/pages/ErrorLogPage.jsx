import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { errorLogApi } from '../api';

function formatDateTime(value) {
  if (!value) return 'â€”';
  return new Date(value).toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ErrorLogPage() {
  const qc = useQueryClient();
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['error-log', unresolvedOnly],
    queryFn: () => errorLogApi.list({ unresolved: unresolvedOnly, limit: 100 }),
    select: (res) => res.data,
    refetchInterval: 30_000,
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, resolved }) => errorLogApi.setResolved(id, resolved),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['error-log'] });
      toast.success('Stav zĂˇznamu byl upraven');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'ZmÄ›na stavu se nezdaĹ™ila'),
  });

  const deleteResolvedMut = useMutation({
    mutationFn: errorLogApi.deleteResolved,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['error-log'] });
      toast.success(`SmazĂˇno vyĹ™eĹˇenĂ˝ch zĂˇznamĹŻ: ${res.data.deleted ?? 0}`);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'MazĂˇnĂ­ se nezdaĹ™ilo'),
  });

  const logs = data?.data || [];
  const stats = data?.stats || { total: 0, unresolved: 0 };

  const summary = useMemo(() => ([
    {
      label: 'NevyĹ™eĹˇenĂ©',
      value: stats.unresolved ?? 0,
      icon: AlertTriangle,
      tone: 'bg-red-50 text-red-700 border-red-100',
    },
    {
      label: 'Celkem',
      value: stats.total ?? 0,
      icon: ShieldAlert,
      tone: 'bg-stone-50 text-stone-700 border-stone-200',
    },
  ]), [stats]);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Error log</h1>
          <p className="text-sm text-stone-500 mt-1">
            Prehled systemovych chyb a uzivatelskych hlaseni v CRM. Pristup ma pouze super admin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setUnresolvedOnly((v) => !v)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              unresolvedOnly
                ? 'bg-red-100 text-red-700'
                : 'bg-stone-100 text-stone-700'
            }`}
          >
            {unresolvedOnly ? 'Jen nevyĹ™eĹˇenĂ©' : 'VĹˇechny zĂˇznamy'}
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
              Obnovit
            </span>
          </button>
          <button
            type="button"
            onClick={() => deleteResolvedMut.mutate()}
            disabled={deleteResolvedMut.isPending}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            Smazat vyĹ™eĹˇenĂ©
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summary.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`rounded-2xl border p-4 ${tone}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium opacity-80">{label}</div>
                <div className="text-3xl font-bold mt-2">{value}</div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-white/70 flex items-center justify-center">
                <Icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-card border border-stone-200/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-stone-800">Zaznamy chyb a hlaseni</h2>
            <p className="text-xs text-stone-400 mt-1">Poslednich az 100 zaznamu podle casu vzniku.</p>
          </div>
          <div className="text-xs text-stone-400">
            Auto-refresh 30 s
          </div>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-sm text-stone-400">NaÄŤĂ­tĂˇm error logâ€¦</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-stone-400">Ĺ˝ĂˇdnĂ© zĂˇznamy k zobrazenĂ­.</div>
        ) : (
          <div className="divide-y divide-stone-100">
            {logs.map((log) => {
              const expanded = expandedId === log.id;
              return (
                <div key={log.id} className="p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          log.resolved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {log.resolved ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                          {log.resolved ? 'VyĹ™eĹˇeno' : 'OtevĹ™enĂ©'}
                        </span>
                        {log.source === 'user_report' ? (
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-sky-100 text-sky-700">
                            Hlaseni uzivatele
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-stone-100 text-stone-700">
                            HTTP {log.status_code}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-stone-100 text-stone-600">
                          <Clock3 size={12} />
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>

                      <div className="text-sm font-semibold text-stone-900 break-words">
                        {log.error_message}
                      </div>
                      <div className="text-xs text-stone-500 mt-1 break-all">
                        {log.path || 'Bez URL'}{log.user_email ? ` Â· ${log.user_email}` : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : log.id)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors"
                      >
                        {expanded ? 'SkrĂ˝t detail' : 'Zobrazit detail'}
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveMut.mutate({ id: log.id, resolved: !log.resolved })}
                        disabled={resolveMut.isPending}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                          log.resolved
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        }`}
                      >
                        {log.resolved ? 'Znovu otevĹ™Ă­t' : 'OznaÄŤit vyĹ™eĹˇenĂ©'}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl bg-stone-50 p-4 border border-stone-200/60">
                        <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Kontext</div>
                        <div className="space-y-2 text-sm text-stone-700 break-words">
                          <div><span className="font-semibold">Zdroj:</span> {log.source || 'â€”'}</div>
                          <div><span className="font-semibold">IP:</span> {log.ip_address || 'â€”'}</div>
                          <div><span className="font-semibold">User-Agent:</span> {log.user_agent || 'â€”'}</div>
                          <div><span className="font-semibold">VyĹ™eĹˇil:</span> {log.resolved_by_email || 'â€”'}</div>
                          <div><span className="font-semibold">VyĹ™eĹˇeno:</span> {formatDateTime(log.resolved_at)}</div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-stone-900 p-4 text-stone-100 border border-stone-800 overflow-hidden">
                        <div className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">Stack / Meta</div>
                        <pre className="text-xs leading-5 whitespace-pre-wrap break-words overflow-auto max-h-72">
                          {[
                            log.stack_trace,
                            log.meta ? `\n--- meta ---\n${JSON.stringify(log.meta, null, 2)}` : null,
                          ].filter(Boolean).join('\n') || 'Bez detailu'}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
