/**
 * ThemeContext — динамическая тема приложения (Этап 9).
 *
 * Использование:
 *   const th = useAppTheme();               // только тема
 *   const { isDark, setDark } = useThemeCtx(); // переключатель
 */

import React, { createContext, useCallback, useContext, useState } from 'react';
import { darkTheme, lightTheme, AppTheme } from '@/constants/theme';
import { settingsRepo } from '@/db';

// ─── Контекст ────────────────────────────────────────────────────────────────

type ThemeCtxType = {
  th:     AppTheme;
  isDark: boolean;
  setDark: (dark: boolean) => Promise<void>;
};

const ThemeCtx = createContext<ThemeCtxType>({
  th:      darkTheme,
  isDark:  true,
  setDark: async () => {},
});

// ─── Провайдер ───────────────────────────────────────────────────────────────

type Props = {
  children:     React.ReactNode;
  initialDark?: boolean;   // загружается в _layout.tsx в процессе bootstrap
};

export function AppThemeProvider({ children, initialDark = true }: Props) {
  const [isDark, setIsDark] = useState(initialDark);

  const setDark = useCallback(async (dark: boolean) => {
    setIsDark(dark);
    await settingsRepo.updateSettings({ theme: dark ? 'dark' : 'light' });
  }, []);

  const th = isDark ? darkTheme : lightTheme;

  return (
    <ThemeCtx.Provider value={{ th, isDark, setDark }}>
      {children}
    </ThemeCtx.Provider>
  );
}

// ─── Хуки ────────────────────────────────────────────────────────────────────

/** Возвращает текущую тему. Используй в компонентах для цветов. */
export function useAppTheme(): AppTheme {
  return useContext(ThemeCtx).th;
}

/** Возвращает тему + переключатель. Используй только в Settings. */
export function useThemeCtx() {
  return useContext(ThemeCtx);
}
