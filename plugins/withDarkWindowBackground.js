/**
 * Config-plugin: тёмный первый кадр окна на Android.
 *
 * Зачем отдельный плагин: expo-splash-screen задаёт только цвет самого
 * splash (windowSplashScreenBackground). А белый кадр приходил из другого
 * места — у AppTheme (postSplashScreenTheme) не был задан windowBackground,
 * и он брался из Theme.AppCompat.DayNight, то есть белый в светлой теме.
 * Этот кадр виден между скрытием splash и первым рендером React.
 *
 * Что делает:
 *  1. windowBackground / statusBarColor / navigationBarColor у AppTheme —
 *     в тёмный цвет, чтобы окно было тёмным с самого первого кадра;
 *  2. splashscreen_background в values и values-night — один и тот же
 *     тёмный цвет (иначе светлая системная тема даёт белый splash);
 *  3. windowSplashScreenAnimatedIcon → прозрачный, чтобы на Android 12+
 *     не показывалась иконка. Полностью отключить системный splash-icon
 *     на API 31+ нельзя, прозрачный drawable — штатный обходной путь.
 *  4. Снимает ЛЮБУЮ ссылку на @drawable/splashscreen_logo. Это не
 *     украшательство: expo-splash-screen пересоздаёт стиль
 *     Theme.App.SplashScreen и прописывает эту ссылку безусловно, даже
 *     когда image в конфиге нет и drawable не генерируется. Результат —
 *     висячая ссылка и падение aapt на processReleaseResources.
 *
 * ПОРЯДОК В app.config.js: этот плагин должен стоять ДО expo-splash-screen.
 * Моды выполняются в обратном порядке регистрации (withMod: сначала свой
 * action, потом nextMod — ранее зарегистрированная цепочка), поэтому
 * «раньше в списке» означает «отработает позже и перезапишет».
 *
 * Идемпотентен, применяется при каждом expo prebuild.
 *
 * ВАЖНО: android/ лежит в репозитории, поэтому те же правки внесены
 * напрямую в native-файлы. Плагин нужен, чтобы они не потерялись при
 * следующем expo prebuild.
 */
const {
  withAndroidStyles,
  withAndroidColors,
  withAndroidColorsNight,
} = require('@expo/config-plugins');

// Совпадает с onboarding.bgBase из constants/theme.ts
const DARK = '#05050a';

const APP_THEME    = 'AppTheme';
const SPLASH_THEME = 'Theme.App.SplashScreen';
const BG_COLOR_REF = '@color/splashscreen_background';
const TRANSPARENT  = '@android:color/transparent';
const DEAD_LOGO_REF = '@drawable/splashscreen_logo';

// ─── Хелперы над разобранным XML ─────────────────────────────────────────────

function setStyleItem(styles, styleName, itemName, value) {
  const style = styles.resources.style?.find((s) => s.$.name === styleName);
  if (!style) return;
  style.item = style.item ?? [];
  const found = style.item.find((i) => i.$.name === itemName);
  if (found) found._ = value;
  else style.item.push({ _: value, $: { name: itemName } });
}

/** Заменяет ссылку на несуществующий splash-логотип во ВСЕХ стилях,
 *  независимо от того, в каком атрибуте она оказалась. */
function dropDeadLogoRefs(styles) {
  for (const style of styles.resources.style ?? []) {
    for (const item of style.item ?? []) {
      if (item._ === DEAD_LOGO_REF) item._ = TRANSPARENT;
    }
  }
}

function setColor(colors, name, value) {
  colors.resources.color = colors.resources.color ?? [];
  const found = colors.resources.color.find((c) => c.$.name === name);
  if (found) found._ = value;
  else colors.resources.color.push({ _: value, $: { name } });
}

// ─── Моды ────────────────────────────────────────────────────────────────────

function applyStyles(config) {
  return withAndroidStyles(config, (config) => {
    const styles = config.modResults;

    // Окно после скрытия splash — тёмное с первого кадра
    setStyleItem(styles, APP_THEME, 'android:windowBackground',    BG_COLOR_REF);
    setStyleItem(styles, APP_THEME, 'android:statusBarColor',      BG_COLOR_REF);
    setStyleItem(styles, APP_THEME, 'android:navigationBarColor',  BG_COLOR_REF);

    // Android 12+: убрать иконку со splash
    setStyleItem(styles, SPLASH_THEME, 'windowSplashScreenAnimatedIcon', TRANSPARENT);
    setStyleItem(styles, SPLASH_THEME, 'android:windowSplashScreenBehavior', 'default');

    // Страховка: ни одной висячей ссылки на splashscreen_logo не остаётся
    dropDeadLogoRefs(styles);

    return config;
  });
}

function applyColors(config) {
  const withLight = withAndroidColors(config, (config) => {
    setColor(config.modResults, 'splashscreen_background', DARK);
    return config;
  });
  return withAndroidColorsNight(withLight, (config) => {
    setColor(config.modResults, 'splashscreen_background', DARK);
    return config;
  });
}

module.exports = function withDarkWindowBackground(config) {
  return applyColors(applyStyles(config));
};
