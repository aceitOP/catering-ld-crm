import { createContext, useContext, useState, useEffect } from 'react';
import { safeGetItem, safeSetItem } from '../utils/storage';

/**
 * Automatický dark mode:
 * - 'light'  → vždy světlý
 * - 'dark'   → vždy tmavý
 * - 'auto'   → tmavý od 19:00 do 7:00, jinak světlý
 */

const DARK_FROM = 19; // 19:00
const DARK_TO   = 7;  // 07:00

function shouldBeDark(mode) {
  if (mode === 'dark')  return true;
  if (mode === 'light') return false;
  // auto – detekce podle hodiny
  const h = new Date().getHours();
  return h >= DARK_FROM || h < DARK_TO;
}

function applyTheme(mode) {
  document.documentElement.classList.toggle('dark', shouldBeDark(mode));
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(
    () => safeGetItem('theme', 'auto') || 'auto'
  );

  function setMode(newMode) {
    setModeState(newMode);
    safeSetItem('theme', newMode);
    applyTheme(newMode);
  }

  // Aplikuj při prvním renderu
  useEffect(() => {
    applyTheme(mode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // V auto módu kontroluj každou minutu (přechod přes 7:00 / 19:00)
  useEffect(() => {
    if (mode !== 'auto') return;
    const id = setInterval(() => applyTheme('auto'), 60_000);
    return () => clearInterval(id);
  }, [mode]);

  const isDark = shouldBeDark(mode);

  return (
    <ThemeContext.Provider value={{ mode, setMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
