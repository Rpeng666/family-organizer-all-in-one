import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getLocalThemeName, setLocalThemeName } from '../lib/session-prefs';
import { DEFAULT_THEME_NAME, getThemeColors, getThemeDefinition, themeOptions } from './tokens';

const ThemeContext = createContext({
  colors: getThemeColors(DEFAULT_THEME_NAME),
  themeName: DEFAULT_THEME_NAME,
  theme: getThemeDefinition(DEFAULT_THEME_NAME),
  themeOptions,
  isThemeReady: false,
  setThemeName: async () => {},
});

export function ThemeProvider({ children }) {
  const [themeName, setThemeNameState] = useState(DEFAULT_THEME_NAME);
  const [isThemeReady, setIsThemeReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTheme() {
      const storedTheme = await getLocalThemeName();
      if (cancelled) return;
      setThemeNameState(storedTheme || DEFAULT_THEME_NAME);
      setIsThemeReady(true);
    }

    void loadTheme();

    return () => {
      cancelled = true;
    };
  }, []);

  async function setThemeName(nextThemeName) {
    const resolvedThemeName = nextThemeName || DEFAULT_THEME_NAME;
    setThemeNameState(resolvedThemeName);
    await setLocalThemeName(resolvedThemeName);
  }

  const value = useMemo(
    () => ({
      colors: getThemeColors(themeName),
      themeName,
      theme: getThemeDefinition(themeName),
      themeOptions,
      isThemeReady,
      setThemeName,
    }),
    [isThemeReady, themeName]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
