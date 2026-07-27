import { Platform } from 'react-native';
import { onboardingFonts } from './fonts';

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

// ─── Семантические переопределения для истории (иначе хардкодятся в компонентах) ─
// iconBgFuel / iconBgExpense / iconBgService — фон иконок в списке

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

    // Фон иконок в списке Истории
    iconBgFuel:        '#0a1f2e',   // синеватый
    iconBgExpense:     '#241c0a',   // жёлто-коричневый
    iconBgService:     '#0c2018',   // зелёный

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

  // ── Токены онбординга ────────────────────────────────────────────────────
  // Фон собирается компонентом OnboardingBackground из четырёх слоёв:
  // база → радиальное свечение → перспективная сетка → виньетка.
  onboarding: {
    // База фона — чуть теплее чистого чёрного, чтобы сетка читалась
    bgBase:       '#05050a',
    // Стопы для затухания сетки и виньетки (тот же цвет, разная альфа)
    bgFadeStrong: 'rgba(5, 5, 10, 0.94)',
    bgFadeMid:    'rgba(5, 5, 10, 0.62)',
    bgFadeClear:  'rgba(5, 5, 10, 0)',

    // Радиальное свечение сверху-центр
    glowBlue:     '#3db5f5',
    glowGreen:    '#4caf7d',
    glowOpacity:  0.22 as number,   // суммарная альфа в центре свечения
    glowSize:     1.45 as number,   // диаметр относительно ширины экрана

    // Линии перспективной сетки
    gridBlue:     'rgba(61, 181, 245, 0.10)',
    gridGreen:    'rgba(76, 175, 125, 0.10)',

    // Подложки под иконки (круг с галочкой, иконки карточек)
    glowAccent:   'rgba(29, 143, 214, 0.42)',
    glowSuccess:  'rgba(76, 175, 125, 0.42)',

    startBtnBg:   '#ffffff',

    // ── Размеры (увеличены на ~15% относительно первой версии) ────────────
    sizes: {
      logo:        144,
      logoRadius:  32,
      logoGlow:    200,
      accentLineW: 55,
      btnHeight:   62,
      btnRadius:   20,
      fieldHeight: 66,
      fieldRadius: 17,
      fieldIcon:   23,
      doneCircle:  78,
      doneCheck:   34,
      tipHeight:   72,
      tipRadius:   17,
      tipIconBox:  37,
      tipIconBoxR: 12,
      tipIcon:     18,
    },
  },

  // ── Тени (раздел 5 дизайн-системы) ──────────────────────────────────────
  // Кроссплатформенно: iOS читает shadow*, Android — elevation.
  // ВАЖНО: вешать только на View БЕЗ overflow:'hidden' и с непрозрачным
  // backgroundColor — иначе тень обрежется на iOS и не построится на Android.
  shadows: {
    // Главный CTA: мягкое голубое свечение под кнопкой
    ctaAccent: {
      shadowColor:   '#1a8fd6',
      shadowOffset:  { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius:  16,
      elevation:     10,
    },
    // Белая кнопка на экране 1: нейтральная тёмная тень, без голубого
    ctaNeutral: {
      shadowColor:   '#000000',
      shadowOffset:  { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius:  12,
      elevation:     8,
    },
    // Карточки-подсказки: лёгкий подъём
    card: {
      shadowColor:   '#000000',
      shadowOffset:  { width: 0, height: 3 },
      shadowOpacity: 0.32,
      shadowRadius:  8,
      elevation:     4,
    },
  },

  // ── Шрифты ───────────────────────────────────────────────────────────────
  // Кастомный шрифт подключён только для Onboarding (см. constants/fonts.ts).
  // Применять как элемент массива стилей: [g.slideTitle, fonts.onboarding.medium]
  fonts: {
    onboarding: onboardingFonts,
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

    // Онбординг — отдельная шкала, крупнее основной (~+15%).
    // Вес не задаётся: он приходит из fonts.onboarding.regular / .medium
    onboarding: {
      appName:    { fontSize: 34, letterSpacing: 0.3 },
      slogan:     { fontSize: 18, lineHeight: 27 },
      stepLabel:  { fontSize: 13, letterSpacing: 1.6 },
      title:      { fontSize: 25 },
      subtitle:   { fontSize: 15, lineHeight: 22 },
      fieldLabel: { fontSize: 14 },
      fieldInput: { fontSize: 18 },
      tipText:    { fontSize: 16, lineHeight: 23 },
      btnText:    { fontSize: 18 },
    },
  },
};

export type AppTheme = typeof darkTheme;

// ─── Светлая тема (раздел 4 дизайн-системы) ─────────────────────────────────

export const lightTheme: AppTheme = {
  colors: {
    background:        '#ffffff',
    surface:           '#F5F5F5',
    surfaceSecondary:  '#e8e8ec',
    border:            '#ebebed',
    borderAccent:      '#3db5f5',
    activeCard:        '#eaf6fe',
    accent:            '#1a8fd6',   // темнее — читаемо на белом
    textPrimary:       '#1a1a1e',
    textSecondary:     '#8a8a90',
    textMuted:         '#8a8a90',
    textWeak:          '#a0a0a6',
    iconInactive:      '#a0a0a6',
    iconBgFuel:        '#daeeff',
    iconBgExpense:     '#fdf3e0',
    iconBgService:     '#e6f5ec',
    statusOk: {
      text:       '#1a8f5a',
      background: '#e6f5ec',
      bar:        '#1a8f5a',
    },
    statusSoon: {
      text:       '#b87a10',
      background: '#fdf3e0',
      bar:        '#b87a10',
    },
    statusDue: {
      text:       '#d63a3f',
      background: '#fdeaeb',
      bar:        '#d63a3f',
    },
  },
  gradient:   darkTheme.gradient,
  radius:     darkTheme.radius,
  fonts:      darkTheme.fonts,
  typography: darkTheme.typography,
  onboarding: {
    bgBase:       '#f7fafd',
    bgFadeStrong: 'rgba(247, 250, 253, 0.94)',
    bgFadeMid:    'rgba(247, 250, 253, 0.62)',
    bgFadeClear:  'rgba(247, 250, 253, 0)',

    glowBlue:     '#3db5f5',
    glowGreen:    '#4caf7d',
    glowOpacity:  0.16 as number,
    glowSize:     1.45 as number,

    gridBlue:     'rgba(26, 143, 214, 0.11)',
    gridGreen:    'rgba(26, 143, 90, 0.11)',

    glowAccent:   'rgba(29, 143, 214, 0.16)',
    glowSuccess:  'rgba(76, 175, 125, 0.16)',

    startBtnBg:   '#ffffff',

    sizes:        darkTheme.onboarding.sizes,
  },

  // На светлом фоне те же тени выглядят грязными — ослаблены.
  shadows: {
    ctaAccent: {
      shadowColor:   '#1a8fd6',
      shadowOffset:  { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius:  14,
      elevation:     8,
    },
    ctaNeutral: {
      shadowColor:   '#000000',
      shadowOffset:  { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius:  10,
      elevation:     5,
    },
    card: {
      shadowColor:   '#000000',
      shadowOffset:  { width: 0, height: 2 },
      shadowOpacity: 0.10,
      shadowRadius:  6,
      elevation:     2,
    },
  },
} as const;

/**
 * Дефолтная тема (тёмная). Используется в ThemeContext как начальное значение.
 * Компоненты должны получать тему через useAppTheme(), а не импортировать напрямую.
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
    text:           lightTheme.colors.textPrimary,
    background:     lightTheme.colors.background,
    tint:           lightTheme.colors.accent,
    icon:           lightTheme.colors.textSecondary,
    tabIconDefault: lightTheme.colors.iconInactive,
    tabIconSelected:lightTheme.colors.accent,
  },
};
