export const BRAND_THEMES = [
  {
    key: 'ocean',
    label: 'Ocean',
    description: 'Modrá pro univerzální firemní použití.',
    preview: ['#eff6ff', '#2563eb', '#1d4ed8'],
  },
  {
    key: 'forest',
    label: 'Forest',
    description: 'Zelená pro gastro a přirozenější vizuál.',
    preview: ['#ecfdf5', '#059669', '#047857'],
  },
  {
    key: 'terracotta',
    label: 'Terracotta',
    description: 'Teplá cihlová vhodná pro catering a hospitality.',
    preview: ['#fff7ed', '#ea580c', '#c2410c'],
  },
  {
    key: 'graphite',
    label: 'Graphite',
    description: 'Tmavší neutrální varianta pro elegantní branding.',
    preview: ['#f5f5f4', '#44403c', '#292524'],
  },
];

export const BRAND_THEME_MAP = Object.fromEntries(BRAND_THEMES.map((theme) => [theme.key, theme]));
