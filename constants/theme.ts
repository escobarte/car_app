import { Platform } from 'react-native';

/**
 * Дизайн-система «Учёт расходов на авто»
 * Источник: docs/дизайн_система.md
 *
 * Правила:
 *  - Все экраны и компоненты берут цвета ТОЛЬКО отсюда.
 *  - Хардкод цветов в компонентах запрещён.
 *  - Градиент: используй accentGradient.colors + accentGradient.start/end
 *    с <LinearGradient> из expo-linear-gradient.
 *  - Светлая тема: заглушка до Этапа 9. Токены совпадают с тёмной.
 */

// ─── Тёмная тема (раздел 3 дизайн-системы) ─────────────────────────────────

export const darkTheme = {
  colors: {
    // Фоны
    background:        '#000000',   // фон экрана
    surface:           '#0f0f12',   // карточка / поверхность
    surfaceSecondary:  '#16161a',   // иконки, табы, барры

    // Границы
    border:            '#1c1c22',   // обычная граница
    borderAccent:      '#2b8fd6',   // граница активного элемента

    // Состояния активной карточки
    activeCard:        '#0a1620',   // подсветка выбранного элемента

    // Акцент (голубой) — для активных элементов, НЕ для статусов
    accent:            '#3db5f5',

    // Текст
    textPrimary:       '#ffffff',
    textSecondary:     '#9a9aa2',
    textMuted:         '#7a7a82',   // подписи
    textWeak:          '#5a5a62',   // заголовки секций

    // Иконки
    iconInactive:      '#5a5a62',

    // Статусы напоминаний (раздел 4.1, 6.3 ТЗ)
    // Красный — ТОЛЬКО «пора/просрочено», не обычный акцент
    statusOk: {
      text:       '#4caf7d',
      background: '#0c2018',
      bar:        '#4caf7d',
    },
    statusSoon: {
      text:       '#e0a020',
      background: '#241c0a',
      bar:        '#e0a020',
    },
    statusDue: {
      text:       '#e5484d',
      background: '#2a1416',
      bar:        '#e5484d',
    },
  },

  // ── Градиент акцента (раздел 2 дизайн-системы) ──────────────────────────
  // Используй с <LinearGradient colors={theme.gradient.accent.colors}
  //   start={theme.gradient.accent.start} end={theme.gradient.accent.end}>
  // Применяется: блок суммы, кнопка «+», кнопки Save/Confirm, тумблеры
  gradient: {
    accent: {
      colors: ['#3db5f5', '#1a8fd6'] as [string, string],
      start:  { x: 0, y: 0 },
      end:    { x: 1, y: 1 },
    },
  },

  // ── Скругления (раздел 5 дизайн-системы) ────────────────────────────────
  radius: {
    frame:      30,   // рамка телефона (внешняя)
    totalBlock: 18,   // блок суммы (крупный)
    navButton:  16,   // кнопка «+» в навигации
    card:       12,   // карточки и поля ввода
    cardLarge:  14,   // поля ввода (альтернативный вариант)
    pill:       14,   // фильтры-таблетки
    badge:       7,   // бейджи статусов
  },

  // ── Типографика (раздел 6 дизайн-системы) ───────────────────────────────
  // Два веса: 400 (обычный) и '500' (полужирный).
  // Регистр — обычный, кроме мелких заголовков-секций.
  typography: {
    totalAmount:    { fontSize: 34, fontWeight: '500' as const },
    screenTitle:    { fontSize: 19, fontWeight: '500' as const },
    cardValue:      { fontSize: 18, fontWeight: '500' as const },
    cardText:       { fontSize: 15, fontWeight: '400' as const },
    cardTextMedium: { fontSize: 15, fontWeight: '500' as const },
    label:          { fontSize: 13, fontWeight: '400' as const },
    labelSmall:     { fontSize: 12, fontWeight: '400' as const },
    sectionHeader:  { fontSize: 12, fontWeight: '400' as const, letterSpacing: 1 },
  },
} as const;

export type AppTheme = typeof darkTheme;

/**
 * Активная тема приложения.
 * Сейчас всегда тёмная. На Этапе 9 станет динамической (через context).
 * Импортируй везде именно `theme`, а не `darkTheme` напрямую —
 * тогда при добавлении переключателя менять нужно будет только этот файл.
 */
export const theme = darkTheme;

// ─── Шрифты (совместимость с шаблонными Expo-компонентами) ──────────────────
// explore.tsx и другие шаблонные экраны используют этот объект.
// Будет убрано при замене шаблонных экранов в процессе разработки.
export const Fonts = Platform.select({
  ios: {
    sans:    'system-ui',
    serif:   'ui-serif',
    rounded: 'ui-rounded',
    mono:    'ui-monospace',
  },
  default: {
    sans:    'normal',
    serif:   'serif',
    rounded: 'normal',
    mono:    'monospace',
  },
  web: {
    sans:    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif:   "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono:    "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// ─── Совместимость с Expo-компонентами ──────────────────────────────────────
// useThemeColor / ThemedText / ThemedView / TabBar используют Colors.
// Значения .dark приведены в соответствие с дизайн-системой.
// .light — заглушка (совпадает с .dark) до Этапа 9.

export const Colors = {
  dark: {
    text:           darkTheme.colors.textPrimary,      // '#ffffff'
    background:     darkTheme.colors.background,       // '#000000'
    tint:           darkTheme.colors.accent,           // '#3db5f5'
    icon:           darkTheme.colors.textSecondary,    // '#9a9aa2'
    tabIconDefault: darkTheme.colors.iconInactive,     // '#5a5a62'
    tabIconSelected:darkTheme.colors.accent,           // '#3db5f5'
  },
  light: {
    // Этап 9: светлая тема. Пока совпадает с тёмной.
    text:           darkTheme.colors.textPrimary,
    background:     darkTheme.colors.background,
    tint:           darkTheme.colors.accent,
    icon:           darkTheme.colors.textSecondary,
    tabIconDefault: darkTheme.colors.iconInactive,
    tabIconSelected:darkTheme.colors.accent,
  },
};
