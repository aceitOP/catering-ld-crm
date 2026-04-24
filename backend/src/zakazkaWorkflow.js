'use strict';

const WORKFLOW_ORDER = [
  'nova_poptavka',
  'rozpracovano',
  'nabidka_pripravena',
  'nabidka_odeslana',
  'ceka_na_vyjadreni',
  'potvrzeno',
  've_priprave',
  'realizovano',
  'uzavreno',
  'stornovano',
];

const STATUS_INDEX = Object.fromEntries(WORKFLOW_ORDER.map((stav, index) => [stav, index]));

const COMMON_TEMPLATE = [
  { key: 'scope_confirmed', label: 'Potvrdit rozsah akce s klientem', requiredBy: 'potvrzeno' },
  { key: 'menu_confirmed', label: 'Uzavrit finalni menu a sluzby', requiredBy: 'potvrzeno' },
  { key: 'price_confirmed', label: 'Potvrdit finalni cenu', requiredBy: 'potvrzeno' },
  { key: 'timeline_ready', label: 'Dopsat harmonogram realizace', requiredBy: 've_priprave' },
  { key: 'logistics_ready', label: 'Potvrdit logistiku a pristupy na miste', requiredBy: 've_priprave' },
  { key: 'staff_ready', label: 'Priradit a potvrdit personal', requiredBy: 've_priprave' },
  { key: 'allergens_checked', label: 'Zkontrolovat alergeny a specialni prani', requiredBy: 've_priprave' },
  { key: 'docs_ready', label: 'Pripravit podklady pro realizaci', requiredBy: 'realizovano' },
];

const TYPE_SPECIFIC_TEMPLATE = {
  svatba: [
    { key: 'venue_coordination', label: 'Potvrdit koordinaci s venue / wedding plannerem', requiredBy: 've_priprave' },
    { key: 'wedding_schedule', label: 'Sladit svatebni harmonogram se servisem', requiredBy: 've_priprave' },
  ],
  soukroma_akce: [
    { key: 'host_flow', label: 'Potvrdit cas prichodu hostu a servisni scenar', requiredBy: 've_priprave' },
  ],
  firemni_akce: [
    { key: 'billing_data', label: 'Overit fakturacni udaje a schvalovaci proces', requiredBy: 'potvrzeno' },
    { key: 'branding_ready', label: 'Potvrdit branding, oznaceni a firemni pozadavky', requiredBy: 've_priprave' },
  ],
  zavoz: [
    { key: 'delivery_window', label: 'Potvrdit cas doruceni nebo vyzvednuti', requiredBy: 'potvrzeno' },
    { key: 'packing_ready', label: 'Pripravit baleni a predavaci instrukce', requiredBy: 've_priprave' },
  ],
  bistro: [
    { key: 'production_ready', label: 'Pripravit denni produkci a vydaj', requiredBy: 've_priprave' },
  ],
  pohreb: [
    { key: 'ceremony_timing', label: 'Potvrdit navaznost na obrad a citlive pozadavky', requiredBy: 've_priprave' },
  ],
  ostatni: [],
};

function normalizeChecklistItem(item, index = 0) {
  if (typeof item === 'string') {
    return {
      key: `custom_${index}`,
      label: item.trim(),
      done: false,
      requiredBy: null,
    };
  }

  const label = String(item?.label || item?.title || '').trim();
  if (!label) return null;

  const requiredBy = typeof item.requiredBy === 'string'
    ? item.requiredBy
    : Array.isArray(item.requiredFor)
      ? item.requiredFor[0] || null
      : null;

  return {
    key: String(item?.key || `custom_${index}`),
    label,
    done: Boolean(item?.done),
    requiredBy: STATUS_INDEX[requiredBy] != null ? requiredBy : null,
  };
}

function normalizeChecklist(checklist = []) {
  if (!Array.isArray(checklist)) return [];
  return checklist
    .map((item, index) => normalizeChecklistItem(item, index))
    .filter(Boolean);
}

function createChecklistTemplate(typ) {
  const items = [
    ...COMMON_TEMPLATE,
    ...(TYPE_SPECIFIC_TEMPLATE[typ] || []),
  ];

  return items.map((item) => ({
    key: item.key,
    label: item.label,
    done: false,
    requiredBy: item.requiredBy || null,
  }));
}

function mergeChecklistWithTemplate(checklist = [], typ) {
  const normalized = normalizeChecklist(checklist);
  const template = createChecklistTemplate(typ);

  if (!normalized.length) return template;

  const byKey = new Map(normalized.map((item) => [item.key, item]));
  const byLabel = new Map(normalized.map((item) => [item.label.trim().toLowerCase(), item]));

  const merged = template.map((templateItem) => {
    const existing = byKey.get(templateItem.key) || byLabel.get(templateItem.label.trim().toLowerCase());
    return existing
      ? { ...templateItem, ...existing, done: Boolean(existing.done) }
      : templateItem;
  });

  const mergedKeys = new Set(merged.map((item) => item.key));
  const customItems = normalized.filter((item) => !mergedKeys.has(item.key));

  return [...merged, ...customItems];
}

function isStatusAtLeast(currentStatus, expectedStatus) {
  const currentIndex = STATUS_INDEX[currentStatus];
  const expectedIndex = STATUS_INDEX[expectedStatus];
  if (currentIndex == null || expectedIndex == null) return false;
  return currentIndex >= expectedIndex;
}

function getChecklistBlockers(checklist = [], targetStatus) {
  return normalizeChecklist(checklist)
    .filter((item) => item.requiredBy && !item.done && isStatusAtLeast(targetStatus, item.requiredBy))
    .map((item) => item.label);
}

async function getWorkflowBlockers(dbClient, zakazka, targetStatus) {
  if (targetStatus === 'stornovano') return [];

  const blockers = [];
  const add = (condition, message) => {
    if (condition) blockers.push(message);
  };

  add(!zakazka.datum_akce && isStatusAtLeast(targetStatus, 'nabidka_pripravena'), 'Chybi datum akce.');
  add(!zakazka.misto && isStatusAtLeast(targetStatus, 'nabidka_pripravena'), 'Chybi misto konani.');
  add(!(Number(zakazka.pocet_hostu) > 0) && isStatusAtLeast(targetStatus, 'nabidka_pripravena'), 'Chybi pocet hostu.');

  if (isStatusAtLeast(targetStatus, 'nabidka_odeslana')) {
    const nabidkaRes = await dbClient.query(
      `SELECT COUNT(*)::int AS count
       FROM nabidky
       WHERE zakazka_id = $1 AND aktivni = true`,
      [zakazka.id]
    );
    add((nabidkaRes.rows[0]?.count || 0) === 0, 'Chybi aktivni nabidka.');
  }

  add(!(Number(zakazka.cena_celkem) > 0) && isStatusAtLeast(targetStatus, 'potvrzeno'), 'Chybi finalni cena zakazky.');
  add(!zakazka.harmonogram && isStatusAtLeast(targetStatus, 've_priprave'), 'Chybi harmonogram realizace.');
  add(!zakazka.logistika && isStatusAtLeast(targetStatus, 've_priprave'), 'Chybi logisticke informace.');

  if (isStatusAtLeast(targetStatus, 've_priprave')) {
    const personalRes = await dbClient.query(
      `SELECT COUNT(*)::int AS count
       FROM zakazky_personal
       WHERE zakazka_id = $1`,
      [zakazka.id]
    );
    add((personalRes.rows[0]?.count || 0) === 0, 'Neni prirazen zadny personal.');
  }

  const checklistBlockers = getChecklistBlockers(zakazka.checklist, targetStatus);
  for (const label of checklistBlockers) {
    blockers.push(`Checklist: ${label}`);
  }

  return blockers;
}

function getChecklistSummary(checklist = []) {
  const normalized = normalizeChecklist(checklist);
  const total = normalized.length;
  const done = normalized.filter((item) => item.done).length;

  return {
    total,
    done,
    pending: Math.max(total - done, 0),
  };
}

module.exports = {
  WORKFLOW_ORDER,
  normalizeChecklist,
  createChecklistTemplate,
  mergeChecklistWithTemplate,
  getWorkflowBlockers,
  getChecklistSummary,
};
