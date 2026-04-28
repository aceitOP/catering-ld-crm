import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  ChevronRight,
  Gift,
  Mail,
  Printer,
  Search,
  Send,
  ShoppingBag,
  X,
} from 'lucide-react';
import { voucherShopApi } from '../api';
import { Spinner } from '../components/ui';

const EMPTY_FORM = {
  amount: '',
  custom_amount: '',
  selected_offer_id: '',
  offer_title: '',
  offer_description: '',
  buyer_name: '',
  buyer_email: '',
  billing_name: '',
  billing_company: '',
  billing_ico: '',
  billing_dic: '',
  billing_address: '',
  billing_email: '',
  recipient_choice: 'buyer',
  recipient_name: '',
  recipient_email: '',
  fulfillment_note: '',
  delivery_mode: 'immediate',
  delivery_scheduled_at: '',
  terms_accepted: false,
};

const TONES = [
  { bg: '#f5f0eb', ink: '#16110d', key: 'cream' },
  { bg: '#cabeb8', ink: '#16110d', key: 'taupe' },
  { bg: '#16110d', ink: '#f5f0eb', key: 'ink' },
  { bg: '#2c3a26', ink: '#f5f0eb', key: 'olive' },
  { bg: '#8a3a1c', ink: '#f5f0eb', key: 'rust' },
];

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('cs-CZ')} Kč`;
}

function minDateTimeLocal() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function getOfferTone(index) {
  return TONES[index % TONES.length];
}

function amountShort(value) {
  const number = Number(value || 0);
  if (!number) return '?';
  return new Intl.NumberFormat('cs-CZ').format(number).replace(/\u00A0/g, ' ');
}

function getPreviewClasses(style) {
  if (style === 'premium') return { frame: 'ld-preview-premium', label: 'Premium' };
  if (style === 'minimal') return { frame: 'ld-preview-minimal', label: 'Minimal' };
  if (style === 'festive') return { frame: 'ld-preview-festive', label: 'Slavnostní' };
  return { frame: 'ld-preview-classic', label: 'Klasický' };
}

function renderHeroTitle(title, highlight) {
  const safeTitle = String(title || 'Darujte chuť, ne věci.');
  const safeHighlight = String(highlight || '').trim();
  if (!safeHighlight || !safeTitle.includes(safeHighlight)) return safeTitle;
  const [before, after] = safeTitle.split(safeHighlight);
  return (
    <>
      {before}<span className="ld-serif-italic">{safeHighlight}</span>{after}
    </>
  );
}

export default function VoucherShopPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('Vše');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const configQuery = useQuery({
    queryKey: ['voucher-shop-config'],
    queryFn: voucherShopApi.config,
    select: (res) => res.data,
  });

  const createMut = useMutation({
    mutationFn: voucherShopApi.createOrder,
    onSuccess: (res) => {
      toast.success('Objednávka poukazu byla vytvořena.');
      navigate(`/shop/objednavka/${res.data.public_token}`);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Objednávku se nepodařilo vytvořit.'),
  });

  const config = configQuery.data;
  const values = useMemo(() => config?.values || [], [config?.values]);
  const minAmount = Number(config?.min_amount || 500);
  const validityMonths = Number(config?.validity_months || 12);
  const minDelivery = useMemo(() => minDateTimeLocal(), []);
  const categories = ['Vše', 'Hodnotové', 'Zážitkové'];
  const hasCustomOffers = Boolean(config?.offers?.length);
  const offers = useMemo(() => {
    const shopOffers = (config?.offers || []).map((offer, index) => ({
      ...offer,
      id: offer.id || `offer-${index}`,
      category: 'Zážitkové',
      code: `E${String(index + 1).padStart(2, '0')}`,
      tone: getOfferTone(index + 1),
      custom: false,
    }));
    const valueOffers = values.map((value, index) => ({
      id: `amount-${value}`,
      title: `Hodnotový poukaz ${formatMoney(value)}`,
      amount: value,
      description: `Univerzální poukaz v hodnotě ${formatMoney(value)}, který lze uplatnit na catering, zážitky i zakázkovou nabídku.`,
      category: 'Hodnotové',
      code: `V${String(index + 1).padStart(2, '0')}`,
      tone: getOfferTone(index),
      custom: false,
    }));
    return [
      ...valueOffers,
      {
        id: 'custom-amount',
        title: 'Vlastní částka',
        amount: minAmount,
        description: `Nastavte poukaz na přesnou částku od ${formatMoney(minAmount)}.`,
        category: 'Hodnotové',
        code: 'V00',
        tone: getOfferTone(4),
        custom: true,
      },
      ...shopOffers,
    ];
  }, [config?.offers, minAmount, values]);

  const filteredOffers = offers.filter((offer) => {
    const matchesCategory = category === 'Vše' || offer.category === category;
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle
      || offer.title.toLowerCase().includes(needle)
      || String(offer.description || '').toLowerCase().includes(needle);
    return matchesCategory && matchesQuery;
  });

  const selectedAmount = Number(form.custom_amount || form.amount || active?.amount || 0);
  const selectedTitle = form.offer_title || active?.title || 'Dárkový poukaz';
  const selectedDescription = form.fulfillment_note || form.offer_description || active?.description || '';
  const recipientName = form.recipient_choice === 'recipient' ? form.recipient_name : form.buyer_name;
  const deliveryLabel = form.delivery_mode === 'scheduled' && form.delivery_scheduled_at
    ? new Date(form.delivery_scheduled_at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Ihned po zaplacení';
  const preview = getPreviewClasses(config?.branding?.voucher_design_style);

  const openOffer = (offer) => {
    setActive(offer);
    setForm({
      ...EMPTY_FORM,
      amount: String(offer.custom ? '' : offer.amount),
      custom_amount: offer.custom ? String(Math.max(minAmount, offer.amount || minAmount)) : '',
      selected_offer_id: offer.custom || !hasCustomOffers ? '' : offer.id,
      offer_title: offer.custom ? `Dárkový poukaz ${formatMoney(minAmount)}` : offer.title,
      offer_description: offer.description || '',
    });
  };

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setCustomAmount = (value) => {
    setForm((current) => ({
      ...current,
      amount: '',
      custom_amount: value,
      selected_offer_id: '',
      offer_title: value ? `Dárkový poukaz ${formatMoney(value)}` : 'Vlastní částka',
      offer_description: '',
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    if (!selectedAmount || selectedAmount < minAmount) {
      toast.error(`Hodnota poukazu musí být alespoň ${formatMoney(minAmount)}.`);
      return;
    }
    if (!form.terms_accepted) {
      toast.error('Pro objednání je potřeba souhlasit s obchodními podmínkami.');
      return;
    }
    createMut.mutate({
      ...form,
      amount: selectedAmount,
      selected_offer_id: form.selected_offer_id || null,
      offer_title: selectedTitle,
      offer_description: form.offer_description || active?.description || '',
      billing_name: form.billing_name || form.buyer_name,
      billing_email: form.billing_email || form.buyer_email,
      delivery_scheduled_at: form.delivery_mode === 'scheduled' ? form.delivery_scheduled_at : null,
    });
  };

  if (configQuery.isLoading) {
    return <div className="min-h-screen bg-[#ede6df] flex items-center justify-center"><Spinner /></div>;
  }

  if (!config?.enabled || !config?.bank_ready) {
    return (
      <div className="min-h-screen bg-[#ede6df] flex items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-[#1a14101a] bg-[#fbf8f4] p-8 text-center shadow-sm">
          <Gift className="mx-auto text-[#4a3f37]" size={32} />
          <h1 className="mt-4 text-xl font-bold text-[#16110d]">Prodej poukazů není aktivní</h1>
          <p className="mt-2 text-sm text-[#4a3f37]">Zkuste to prosím později nebo nás kontaktujte přímo.</p>
        </div>
      </div>
    );
  }

  const page = config.page || {};
  const brandTitle = page.brand_title || config.branding?.firma_nazev || config.branding?.app_title || 'Catering LD';
  const shopLogo = page.logo_data_url || config.branding?.app_logo_data_url || '';

  return (
    <div className="ld-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..900,0..100,0..1&family=Manrope:wght@300;400;500;600;700&display=swap');
        .ld-root{--bg:#ede6df;--bg2:#f5f0eb;--paper:#fbf8f4;--ink:#16110d;--soft:#4a3f37;--taupe:#cabeb8;--taupe2:#a99a91;--line:#1a14101a;--accent:#8a3a1c;--olive:#2c3a26;background:var(--bg);color:var(--ink);min-height:100vh;font-family:Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
        .ld-serif{font-family:Fraunces,Georgia,serif;font-variation-settings:"opsz" 144,"SOFT" 50,"WONK" 0;font-weight:380;letter-spacing:-.025em;line-height:.95}.ld-serif-italic{font-family:Fraunces,Georgia,serif;font-style:italic;font-variation-settings:"opsz" 144,"SOFT" 100,"WONK" 1;letter-spacing:-.02em}.ld-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.05em;font-size:11px;text-transform:uppercase}.ld-marquee-track{display:inline-flex;white-space:nowrap;animation:ld-marquee 38s linear infinite}@keyframes ld-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}.ld-rise{animation:ld-rise .8s cubic-bezier(.2,.8,.2,1) both}@keyframes ld-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}.ld-card{transition:transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s}.ld-card:hover{transform:translateY(-4px);box-shadow:0 12px 28px -16px #2a1a0e44}.ld-gc{position:relative;aspect-ratio:4/5;border-radius:6px;overflow:hidden;padding:24px;display:flex;flex-direction:column;justify-content:space-between}.ld-gc:after{content:"";position:absolute;inset:14px;border:1px solid currentColor;opacity:.18;border-radius:4px;pointer-events:none}.ld-gc-amount{font-family:Fraunces,serif;font-variation-settings:"opsz" 144,"SOFT" 30,"WONK" 1;font-weight:320;font-size:clamp(56px,8vw,96px);line-height:.9;letter-spacing:-.04em}.ld-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:14px 22px;background:var(--ink);color:var(--bg2);border-radius:999px;font-weight:600;font-size:13px;letter-spacing:.06em;text-transform:uppercase;border:0;cursor:pointer;transition:background .25s,transform .25s}.ld-btn:hover{background:var(--accent);transform:translateY(-1px)}.ld-btn:disabled{opacity:.45;pointer-events:none}.ld-pill{display:inline-flex;align-items:center;padding:7px 14px;border-radius:999px;background:transparent;color:var(--ink);border:1px solid #1a14101f;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}.ld-pill-active{background:var(--ink);color:var(--bg2);border-color:var(--ink)}.ld-field{background:transparent;border:0;border-bottom:1px solid #1a14102e;padding:12px 0 12px 28px;width:100%;font:inherit;color:inherit;outline:0}.ld-input{width:100%;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:12px 14px;font:inherit;color:inherit;outline:0;box-sizing:border-box}.ld-input:focus{border-color:var(--ink);background:var(--bg2)}.ld-label{color:var(--soft);margin-bottom:8px}.ld-radio{padding:14px;border:1px solid var(--line);border-radius:6px;cursor:pointer;background:var(--bg2)}.ld-radio.active{border-color:var(--ink);background:var(--paper);box-shadow:inset 0 0 0 1px var(--ink)}.ld-modal{animation:ld-pop .35s cubic-bezier(.2,.8,.2,1) both}@keyframes ld-pop{from{opacity:0;transform:translate(-50%,-48%) scale(.97)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}.ld-preview-classic .ld-preview-head{background:#4f3b2f;color:#f5f0eb}.ld-preview-minimal .ld-preview-head{background:#fbf8f4;color:#16110d;border-bottom:1px solid var(--line)}.ld-preview-premium{background:#16110d!important;color:#f5f0eb!important}.ld-preview-premium .ld-preview-head{background:#0f0c09;color:#f5f0eb}.ld-preview-festive .ld-preview-head{background:#8a3a1c;color:#f5f0eb}.ld-noscroll::-webkit-scrollbar{display:none}.ld-noscroll{scrollbar-width:none}@media(max-width:980px){.ld-nav{display:none}.ld-hero-grid,.ld-howit{grid-template-columns:1fr!important}.ld-filterbar{grid-template-columns:1fr!important}.ld-modal{grid-template-columns:1fr!important}.ld-modal-preview{display:none}.ld-hero-title{font-size:13vw!important}}
      `}</style>

      <div className="overflow-hidden bg-[#16110d] py-2 text-[#f5f0eb]">
        <div className="ld-marquee-track ld-mono opacity-85">
          {[0, 1].map((item) => (
            <span key={item} className="inline-flex gap-9 pr-9">
              <span>★ Poukazy doručujeme po potvrzení platby</span>
              <span>★ Platnost {validityMonths} měsíců</span>
              <span>★ Personalizace zdarma</span>
              <span>★ Náhled poukazu před objednáním</span>
            </span>
          ))}
        </div>
      </div>

      <header className="sticky top-0 z-40 flex items-center justify-between gap-6 border-b border-[#1a14101a] bg-[#ede6df]/95 px-5 py-5 backdrop-blur md:px-14">
        <div className="flex items-center gap-3">
          {shopLogo ? (
            <img src={shopLogo} alt={brandTitle} className="h-10 w-10 object-contain" />
          ) : (
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#16110d] text-sm font-semibold italic text-[#f5f0eb]">ld</div>
          )}
          <div>
            <div className="ld-serif text-2xl">{brandTitle}</div>
            <div className="ld-mono mt-1 text-[#4a3f37]">{page.header_subtitle || 'Poukazy · Praha'}</div>
          </div>
        </div>
        <nav className="ld-nav flex items-center gap-7 text-sm font-medium">
          <a href="#ld-grid" className="hover:underline">Poukazy</a>
          <a href="#jak-to-funguje" className="hover:underline">Jak to funguje</a>
          <Link to="/shop/obchodni-podminky" className="hover:underline">Obchodní podmínky</Link>
        </nav>
        <button className="ld-btn px-5 py-3" type="button" onClick={() => document.getElementById('ld-grid')?.scrollIntoView({ behavior: 'smooth' })}>
          <ShoppingBag size={15} /> Vybrat
        </button>
      </header>

      <section className="relative overflow-hidden px-5 py-14 md:px-14 md:py-24">
        <div className="absolute right-[-8%] top-[12%] h-[45vw] max-h-[560px] w-[45vw] max-w-[560px] rounded-[55%_45%_45%_55%] bg-[#cabeb8] opacity-60 blur-sm" />
        <div className="relative mx-auto max-w-[1400px]">
          <div className="ld-rise mb-7 flex gap-3">
            <span className="ld-mono text-[#4a3f37]">{page.hero_eyebrow || '[01] - Dárkové poukazy'}</span>
          </div>
          <h1 className="ld-serif ld-rise ld-hero-title m-0 text-[clamp(56px,11vw,196px)]">
            {renderHeroTitle(page.hero_title, page.hero_highlight)}
          </h1>
          <div className="ld-hero-grid ld-rise mt-14 grid grid-cols-[1fr_auto_1fr] items-end gap-10">
            <p className="m-0 max-w-[500px] text-[17px] leading-relaxed text-[#4a3f37]">
              {page.hero_text || 'Hodnotové i zážitkové poukazy. Vyberte částku, doplňte jméno a vzkaz, náhled poukazu uvidíte ještě před objednáním.'}
            </p>
            <button className="ld-btn" type="button" onClick={() => document.getElementById('ld-grid')?.scrollIntoView({ behavior: 'smooth' })}>
              Vybrat poukaz <ArrowRight size={15} />
            </button>
            <div />
          </div>
        </div>
      </section>

      <section id="jak-to-funguje" className="border-y border-[#1a14101a] bg-[#f5f0eb] px-5 py-14 md:px-14">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-10 flex items-baseline gap-6">
            <span className="ld-mono text-[#4a3f37]">[02] - Jak to funguje</span>
            <div className="h-px flex-1 bg-[#1a14102e]" />
          </div>
          <div className="ld-howit grid grid-cols-3 gap-8">
            {(page.how_steps || [
              { title: 'Vyberte poukaz', text: 'Hodnotový nebo zážitkový poukaz z aktuální nabídky.' },
              { title: 'Personalizujte', text: 'Doplňte jméno, e-mail, vzkaz a fakturační údaje.' },
              { title: 'Dokončete objednávku', text: 'Po odeslání vám přijde potvrzení objednávky.' },
            ]).map(({ title, text }, index) => (
              <div key={`${index}-${title}`} className="border-t border-[#16110d] pt-5">
                <div className="ld-serif-italic mb-2 text-sm text-[#4a3f37]">{String(index + 1).padStart(2, '0')}</div>
                <h3 className="ld-serif m-0 mb-3 text-3xl">{title}</h3>
                <p className="m-0 leading-relaxed text-[#4a3f37]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sticky top-[81px] z-30 border-b border-[#1a14101a] bg-[#ede6df]/95 px-5 py-5 backdrop-blur md:px-14">
        <div className="ld-filterbar mx-auto grid max-w-[1400px] grid-cols-[1fr_auto] items-center gap-10">
          <div className="ld-noscroll flex gap-2 overflow-x-auto">
            {categories.map((item) => (
              <button key={item} type="button" className={`ld-pill ${category === item ? 'ld-pill-active' : ''}`} onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="relative min-w-[240px]">
            <Search size={15} className="absolute left-0 top-1/2 -translate-y-1/2 text-[#4a3f37]" />
            <input className="ld-field" placeholder="Hledat poukaz..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
      </section>

      <section id="ld-grid" className="px-5 pb-6 pt-14 md:px-14">
        <div className="mx-auto grid max-w-[1400px] grid-cols-[auto_1fr_auto] items-baseline gap-6">
          <h2 className="ld-serif m-0 text-[clamp(32px,4vw,56px)]">{category === 'Vše' ? 'Všechny poukazy' : `${category} poukazy`}</h2>
          <div className="h-px bg-[#1a14102e]" />
          <span className="ld-mono text-[#4a3f37]">{filteredOffers.length} položek</span>
        </div>
      </section>

      <section className="px-5 pb-20 md:px-14">
        <div className="mx-auto grid max-w-[1400px] grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-8 gap-y-12">
          {filteredOffers.map((offer, index) => (
            <article key={offer.id} className="ld-card ld-rise cursor-pointer" style={{ animationDelay: `${index * 0.04}s` }} onClick={() => openOffer(offer)}>
              <ValueCard offer={offer} tone={offer.tone || getOfferTone(index)} />
              <div className="px-1 pt-4">
                <div className="ld-mono mb-2 text-[#4a3f37]">{offer.category}</div>
                <h3 className="ld-serif m-0 text-2xl leading-tight">{offer.title}</h3>
                <p className="my-3 line-clamp-2 text-sm leading-relaxed text-[#4a3f37]">{offer.description}</p>
                <div className="flex items-center justify-between border-t border-[#1a14101a] pt-3">
                  <div className="ld-serif text-2xl">{offer.custom ? `od ${formatMoney(minAmount)}` : formatMoney(offer.amount)}</div>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold">Personalizovat <ChevronRight size={14} /></span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-[#1a14101a] px-5 py-12 md:px-14">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-end justify-between gap-8">
          <div>
            <div className="ld-serif text-5xl">{page.footer_title || 'Pojďme spolu obdarovat.'}</div>
            <div className="ld-mono mt-5 text-[#4a3f37]">{config.branding?.firma_email || 'info@cateringld.cz'} · {config.branding?.firma_telefon || 'Catering LD'}</div>
          </div>
          <Link to="/shop/obchodni-podminky" className="text-sm font-semibold underline">Obchodní podmínky</Link>
        </div>
      </footer>

      {active && (
        <>
          <div className="fixed inset-0 z-[80] bg-[#0d0a0866] backdrop-blur" onClick={() => setActive(null)} />
          <div className="ld-modal fixed left-1/2 top-1/2 z-[90] grid max-h-[92vh] w-[min(980px,94vw)] -translate-x-1/2 -translate-y-1/2 grid-cols-[0.9fr_1.1fr] overflow-hidden rounded-lg bg-[#f5f0eb]">
            <div className="ld-modal-preview bg-[#cabeb8] p-8">
              <VoucherPreview
                preview={preview}
                title={selectedTitle}
                amount={selectedAmount}
                recipient={recipientName}
                description={selectedDescription}
                validityMonths={validityMonths}
                deliveryLabel={deliveryLabel}
                code={active.code}
              />
            </div>
            <form onSubmit={submit} className="relative max-h-[92vh] overflow-y-auto p-8">
              <button type="button" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-[#1a14101a] bg-[#f5f0eb]" onClick={() => setActive(null)} aria-label="Zavřít">
                <X size={15} />
              </button>
              <div className="ld-mono text-[#4a3f37]">{active.category} · {active.code}</div>
              <h3 className="ld-serif m-0 mb-3 mt-2 pr-10 text-4xl">{active.title}</h3>
              <p className="mb-6 text-sm leading-relaxed text-[#4a3f37]">{active.description}</p>

              {active.custom && (
                <div className="mb-5">
                  <Label>Hodnota poukazu</Label>
                  <input type="number" min={minAmount} max="1000000" step="1" className="ld-input" value={form.custom_amount} onChange={(event) => setCustomAmount(event.target.value)} required />
                </div>
              )}

              <div className="mb-5">
                <Label>Komu poukaz poslat</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['buyer', 'Mně'],
                    ['recipient', 'Někomu jinému'],
                  ].map(([value, label]) => (
                    <button key={value} type="button" className={`ld-radio text-left ${form.recipient_choice === value ? 'active' : ''}`} onClick={() => setField('recipient_choice', value)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4 grid gap-3 md:grid-cols-2">
                <Field label={form.recipient_choice === 'recipient' ? 'Jméno kupujícího' : 'Jméno na poukazu'} value={form.buyer_name} onChange={(value) => setField('buyer_name', value)} required />
                <Field label="E-mail kupujícího" type="email" value={form.buyer_email} onChange={(value) => setField('buyer_email', value)} required />
                {form.recipient_choice === 'recipient' && (
                  <>
                    <Field label="Jméno na poukazu" value={form.recipient_name} onChange={(value) => setField('recipient_name', value)} required />
                    <Field label="E-mail obdarovaného" type="email" value={form.recipient_email} onChange={(value) => setField('recipient_email', value)} required />
                  </>
                )}
              </div>

              <div className="mb-5">
                <Label optional>Vzkaz na poukaz</Label>
                <textarea className="ld-input min-h-[84px] resize-y" value={form.fulfillment_note} onChange={(event) => setField('fulfillment_note', event.target.value.slice(0, 2000))} />
              </div>

              <Label>Doručení</Label>
              <div className="mb-5 grid grid-cols-2 gap-3">
                <button type="button" className={`ld-radio text-left ${form.delivery_mode === 'immediate' ? 'active' : ''}`} onClick={() => setField('delivery_mode', 'immediate')}>
                  <span className="mb-1 flex items-center gap-2 font-semibold"><Mail size={15} /> Ihned</span>
                  <span className="ld-mono text-[#4a3f37]">po potvrzení platby</span>
                </button>
                <button type="button" className={`ld-radio text-left ${form.delivery_mode === 'scheduled' ? 'active' : ''}`} onClick={() => setField('delivery_mode', 'scheduled')}>
                  <span className="mb-1 flex items-center gap-2 font-semibold"><Printer size={15} /> Naplánovat</span>
                  <span className="ld-mono text-[#4a3f37]">datum a čas</span>
                </button>
              </div>
              {form.delivery_mode === 'scheduled' && (
                <div className="mb-5">
                  <input required type="datetime-local" min={minDelivery} className="ld-input" value={form.delivery_scheduled_at} onChange={(event) => setField('delivery_scheduled_at', event.target.value)} />
                </div>
              )}

              <div className="mb-5 border-t border-[#1a14101a] pt-5">
                <Label optional>Fakturační údaje</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Fakturační jméno" value={form.billing_name} onChange={(value) => setField('billing_name', value)} placeholder={form.buyer_name || 'Jméno a příjmení'} />
                  <Field label="Firma" value={form.billing_company} onChange={(value) => setField('billing_company', value)} />
                  <Field label="IČO" value={form.billing_ico} onChange={(value) => setField('billing_ico', value)} />
                  <Field label="DIČ" value={form.billing_dic} onChange={(value) => setField('billing_dic', value)} />
                  <div className="md:col-span-2">
                    <Field label="Fakturační e-mail" type="email" value={form.billing_email} onChange={(value) => setField('billing_email', value)} placeholder={form.buyer_email || 'E-mail pro doklady'} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Fakturační adresa</Label>
                    <textarea className="ld-input min-h-[74px] resize-y" value={form.billing_address} onChange={(event) => setField('billing_address', event.target.value)} />
                  </div>
                </div>
              </div>

              <label className="mb-5 flex items-start gap-3 rounded-md border border-[#1a14101a] bg-[#fbf8f4] p-3 text-sm text-[#4a3f37]">
                <input type="checkbox" required checked={form.terms_accepted} onChange={(event) => setField('terms_accepted', event.target.checked)} className="mt-1" />
                <span>Platbou souhlasím s <Link to="/shop/obchodni-podminky" target="_blank" className="font-semibold underline">obchodními podmínkami</Link>.</span>
              </label>

              <div className="mb-5 flex items-baseline justify-between border-t border-[#1a14101a] pt-4">
                <span className="ld-mono text-[#4a3f37]">Celkem</span>
                <span className="ld-serif text-4xl">{formatMoney(selectedAmount)}</span>
              </div>
              <button className="ld-btn w-full" type="submit" disabled={!selectedAmount || selectedAmount < minAmount || !form.terms_accepted || createMut.isPending}>
                {createMut.isPending ? 'Vytvářím objednávku...' : 'Objednat poukaz'} <Send size={15} />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function ValueCard({ offer, tone }) {
  return (
    <div className="ld-gc" style={{ background: tone.bg, color: tone.ink }}>
      <div className="relative z-[1] flex items-start justify-between">
        <div>
          <div className="font-serif text-lg italic leading-none">ld</div>
          <div className="ld-mono mt-2 opacity-70">Catering Voucher</div>
        </div>
        <span className="ld-mono rounded-full border border-current px-2 py-1 text-[9px] opacity-80">{offer.category}</span>
      </div>
      <div className="relative z-[1]">
        <div className="ld-mono mb-2 opacity-70">Hodnota</div>
        <div className="ld-gc-amount">{offer.custom ? '?' : amountShort(offer.amount)}<span className="ml-1 text-2xl italic opacity-60">Kč</span></div>
      </div>
      <div className="relative z-[1] flex items-end justify-between gap-2">
        <div className="ld-mono opacity-70">Platnost</div>
        <div className="ld-serif-italic opacity-70">№ {offer.code}</div>
      </div>
    </div>
  );
}

function VoucherPreview({ preview, title, amount, recipient, description, validityMonths, deliveryLabel, code }) {
  return (
    <div className={`overflow-hidden rounded-lg border bg-[#fbf8f4] shadow-sm ${preview.frame}`}>
      <div className="ld-preview-head p-5">
        <div className="ld-mono opacity-70">{preview.label} šablona · {code}</div>
        <div className="ld-serif mt-3 text-4xl">Dárkový poukaz</div>
        <div className="mt-2 text-sm opacity-80">{title}</div>
        <div className="ld-serif mt-4 text-5xl">{formatMoney(amount)}</div>
      </div>
      <div className="p-5">
        <div className="ld-mono text-[#4a3f37]">Pro</div>
        <div className="ld-serif mt-1 text-2xl">{recipient || 'Obdarovaný'}</div>
        <div className="mt-4 rounded bg-[#f5f0eb] p-3 text-sm leading-relaxed text-[#4a3f37]">{description || 'Věnování nebo popis poukazu se zobrazí tady.'}</div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-[#4a3f37]">
          <div><div className="ld-mono">Platnost</div><div>{validityMonths} měsíců</div></div>
          <div><div className="ld-mono">Doručení</div><div>{deliveryLabel}</div></div>
        </div>
      </div>
    </div>
  );
}

function Label({ children, optional }) {
  return <div className="ld-label ld-mono">{children}{optional && <span className="ml-2 normal-case opacity-60">volitelné</span>}</div>;
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '' }) {
  return (
    <div>
      <Label>{label}</Label>
      <input className="ld-input" type={type} value={value} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
