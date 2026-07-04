import React, { createContext, useContext } from 'react';
import { AppColors, darkColors } from '../utils/themeColors';

interface ThemeContextValue {
  isDark: boolean;
  colors: AppColors;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: true,
  colors: darkColors,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const value: ThemeContextValue = {
    isDark: true,
    colors: darkColors,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
