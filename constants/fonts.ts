import type { TextStyle } from 'react-native';

/**
 * Кастомные шрифты приложения.
 *
 * Сейчас Helvetica Neue подключена ТОЛЬКО для экранов Onboarding.
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
  'HelveticaNeue-Regular': require('../assets/fonts/HelveticaNeue-Regular.ttf'),
  'HelveticaNeue-Medium':  require('../assets/fonts/HelveticaNeue-Medium.ttf'),
};

// ─── Токены темы ─────────────────────────────────────────────────────────────
// fontWeight принудительно '400' в обоих вариантах: начертание берётся из
// файла, а не синтезируется системой. Иначе Android/iOS накладывают
// искусственное утолщение поверх уже жирного Medium.
export const onboardingFonts: {
  regular: TextStyle;
  medium:  TextStyle;
} = {
  regular: { fontFamily: 'HelveticaNeue-Regular', fontWeight: '400' },
  medium:  { fontFamily: 'HelveticaNeue-Medium',  fontWeight: '400' },
};
