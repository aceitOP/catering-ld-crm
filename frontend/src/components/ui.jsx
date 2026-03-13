// ── Shared UI components ─────────────────────────────────────

import { X, Loader2 } from 'lucide-react';

// Stavové badge – zakázky
const STAV_STYLES = {
  nova_poptavka:      'bg-stone-100 text-stone-600',
  rozpracovano:       'bg-amber-50 text-amber-700',
  nabidka_pripravena: 'bg-blue-50 text-blue-700',
  nabidka_odeslana:   'bg-purple-50 text-purple-700',
  ceka_na_vyjadreni:  'bg-orange-50 text-orange-700',
  potvrzeno:          'bg-green-50 text-green-700',
  ve_priprave:        'bg-cyan-50 text-cyan-700',
  realizovano:        'bg-teal-50 text-teal-700',
  uzavreno:           'bg-stone-100 text-stone-500',
  stornovano:         'bg-red-50 text-red-600',
  // nabídky
  koncept:            'bg-amber-50 text-amber-700',
  odeslano:           'bg-purple-50 text-purple-700',
  prijato:            'bg-green-50 text-green-700',
  zamitnuto:          'bg-red-50 text-red-600',
  expirovano:         'bg-stone-100 text-stone-500',
};

const STAV_LABELS = {
  nova_poptavka:      'Nová poptávka',
  rozpracovano:       'Rozpracováno',
  nabidka_pripravena: 'Nabídka připravena',
  nabidka_odeslana:   'Nabídka odeslána',
  ceka_na_vyjadreni:  'Čeká na vyjádření',
  potvrzeno:          'Potvrzeno',
  ve_priprave:        'Ve přípravě',
  realizovano:        'Realizováno',
  uzavreno:           'Uzavřeno',
  stornovano:         'Stornováno',
  koncept:            'Koncept',
  odeslano:           'Odesláno',
  prijato:            'Přijato',
  zamitnuto:          'Zamítnuto',
  expirovano:         'Expirováno',
};

const TYP_LABELS = {
  svatba:        'Svatba',
  soukroma_akce: 'Soukromá akce',
  firemni_akce:  'Firemní akce',
  zavoz:         'Závoz',
  bistro:        'Bistro',
};

const TYP_STYLES = {
  svatba:        'bg-blue-50 text-blue-700',
  soukroma_akce: 'bg-orange-50 text-orange-700',
  firemni_akce:  'bg-green-50 text-green-700',
  zavoz:         'bg-purple-50 text-purple-700',
  bistro:        'bg-stone-100 text-stone-600',
};

const KLIENT_TYP = {
  soukromy: { label: 'Soukromý', cls: 'bg-blue-50 text-blue-700' },
  firemni:  { label: 'Firemní',  cls: 'bg-green-50 text-green-700' },
  vip:      { label: '⭐ VIP',    cls: 'bg-amber-50 text-amber-700' },
};

export function StavBadge({ stav }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STAV_STYLES[stav] || 'bg-stone-100 text-stone-500'}`}>
      {STAV_LABELS[stav] || stav}
    </span>
  );
}

export function TypBadge({ typ }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYP_STYLES[typ] || 'bg-stone-100 text-stone-500'}`}>
      {TYP_LABELS[typ] || typ}
    </span>
  );
}

export function KlientTypBadge({ typ }) {
  const t = KLIENT_TYP[typ] || { label: typ, cls: 'bg-stone-100 text-stone-500' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.cls}`}>
      {t.label}
    </span>
  );
}

// Tlačítko
export function Btn({ children, variant = 'default', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center gap-1.5 font-medium rounded-md transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    default: 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50',
    primary: 'bg-stone-900 border border-stone-900 text-white hover:bg-stone-800',
    danger:  'bg-red-600 border border-red-600 text-white hover:bg-red-700',
    ghost:   'text-stone-600 hover:bg-stone-100 border border-transparent',
  };
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-sm',
  };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

// Modal
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-xl w-full ${width} max-h-[90vh] flex flex-col border border-stone-200`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
        {footer && (
          <div className="px-5 py-3.5 border-t border-stone-100 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Page header
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-stone-100">
      <div>
        <h1 className="text-base font-semibold text-stone-900">{title}</h1>
        {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// Stat karta
export function StatCard({ label, value, sub, color }) {
  const colorMap = { green: 'text-green-700', blue: 'text-blue-700', red: 'text-red-600', amber: 'text-amber-700' };
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-4">
      <div className="text-xs text-stone-500 mb-1">{label}</div>
      <div className={`text-xl font-semibold ${colorMap[color] || 'text-stone-900'}`}>{value}</div>
      {sub && <div className="text-xs text-stone-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// Prázdný stav
export function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon size={32} className="text-stone-300 mb-3" />}
      <div className="text-sm font-medium text-stone-500">{title}</div>
      {desc && <div className="text-xs text-stone-400 mt-1 max-w-xs">{desc}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Spinner
export function Spinner({ size = 16 }) {
  return <Loader2 size={size} className="animate-spin text-stone-400" />;
}

// Formátovací helpers
export function formatCena(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n);
}

export function formatDatum(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export { STAV_LABELS, TYP_LABELS, TYP_STYLES, KLIENT_TYP };
