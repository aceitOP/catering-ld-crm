'use strict';

const THEME_MAP = {
  ocean: {
    primary: '#1d4ed8',
    primaryDark: '#1e3a8a',
    accent: '#0f766e',
    soft: '#eff6ff',
  },
  forest: {
    primary: '#059669',
    primaryDark: '#065f46',
    accent: '#0f766e',
    soft: '#ecfdf5',
  },
  terracotta: {
    primary: '#c2410c',
    primaryDark: '#9a3412',
    accent: '#ea580c',
    soft: '#fff7ed',
  },
  graphite: {
    primary: '#44403c',
    primaryDark: '#1c1917',
    accent: '#78716c',
    soft: '#f5f5f4',
  },
};

const FONT_MAP = {
  syne: {
    family: "'Syne', Arial, sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&display=swap',
  },
  manrope: {
    family: "'Manrope', Arial, sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap',
  },
  merriweather: {
    family: "'Merriweather', Georgia, serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap',
  },
  source_sans_3: {
    family: "'Source Sans 3', Arial, sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap',
  },
};

function resolveDocumentBranding(settings = {}) {
  const theme = THEME_MAP[settings.app_color_theme] || THEME_MAP.ocean;
  const font = FONT_MAP[settings.app_document_font_family] || FONT_MAP.syne;

  return {
    appTitle: settings.app_title || settings.firma_nazev || 'Catering CRM',
    logoDataUrl: settings.app_logo_data_url || '',
    fontFamily: font.family,
    fontImportUrl: font.importUrl,
    primary: theme.primary,
    primaryDark: theme.primaryDark,
    accent: theme.accent,
    soft: theme.soft,
  };
}

module.exports = {
  resolveDocumentBranding,
};
