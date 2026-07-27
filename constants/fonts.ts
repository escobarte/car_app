import type { TextStyle } from 'react-native';

/**
 * Кастомные шрифты приложения.
 *
 * Сейчас Inter подключён ТОЛЬКО для экранов Onboarding.
 * Остальные экраны продолжают использовать системный шрифт
 * (Roboto на Android, SF Pro на iOS).
 *
 * Правила:
 *  - Имена семейств (fontFamily) не хардкодить в компонентах —
 *    брать через тему: th.fonts.onboarding.regular / .medium
 *  - Веса задаются РАЗНЫМИ файлами, а не свойством fontWeight.
 */

// ─── Ассеты для useFonts() ───────────────────────────────────────────────────
// Ключ объекта = имя семейства, которое затем указывается в fontFamily.
// Загружается один раз в app/_layout.tsx до первого рендера.
export const onboardingFontAssets = {
  'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
  'Inter-Medium':  require('../assets/fonts/Inter-Medium.ttf'),
};

// ─── Токены темы ─────────────────────────────────────────────────────────────
// fontWeight принудительно '400' в обоих вариантах: начертание берётся из
// файла, а не синтезируется системой. Иначе Android/iOS накладывают
// искусственное утолщение поверх уже жирного Medium.
export const onboardingFonts: {
  regular: TextStyle;
  medium:  TextStyle;
} = {
  regular: { fontFamily: 'Inter-Regular', fontWeight: '400' },
  medium:  { fontFamily: 'Inter-Medium',  fontWeight: '400' },
};
