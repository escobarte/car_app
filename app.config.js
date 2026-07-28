const IS_CLEAN = process.env.APP_VARIANT === 'clean';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name:        'MyCarLedger',
  slug:        'car_app',
  version:     '1.0.0',
  orientation: 'portrait',
  icon:        './assets/icon.png',
  scheme:      'carapp',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  // Фон рут-вью под React-слоем (применяет expo-system-ui). Тот же тёмный,
  // что у splash и у фона приложения — чтобы не мелькал белый кадр.
  backgroundColor: '#05050a',

  ios: {
    supportsTablet: true,
  },

  android: {
    // namespace и базовый applicationId — одинаковые для обоих вариантов.
    // Суффикс .clean добавляется плагином withAndroidSigning через applicationIdSuffix.
    package: 'com.escobarte.autoapp',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon-foreground.png',
      backgroundImage: './assets/adaptive-icon-background.png',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },

  web: {
    output:  'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    // ВНИМАНИЕ, порядок неочевиден: моды выполняются в ОБРАТНОМ порядке
    // регистрации (withMod вызывает свой action, а затем nextMod —
    // ранее зарегистрированную цепочку). Значит плагин, стоящий в списке
    // РАНЬШЕ, отрабатывает ПОЗЖЕ и перезаписывает результат.
    // withDarkWindowBackground обязан идти до expo-splash-screen: тот
    // целиком пересоздаёт стиль Theme.App.SplashScreen и безусловно
    // прописывает @drawable/splashscreen_logo, которого без image в
    // конфиге не существует → aapt падает на processReleaseResources.
    './plugins/withDarkWindowBackground',
    [
      'expo-splash-screen',
      {
        // Без картинки: splash — ровная тёмная заливка под цвет фона
        // приложения (constants/theme.ts → onboarding.bgBase). Оба режима
        // тёмные, иначе в светлой системной теме мелькает белый кадр.
        backgroundColor: '#05050a',
        dark: { backgroundColor: '#05050a' },
      },
    ],
    'expo-sqlite',
    'expo-localization',
    '@react-native-community/datetimepicker',
    [
      'expo-notifications',
      {
        // Добавляет POST_NOTIFICATIONS (Android 13+) и RECEIVE_BOOT_COMPLETED
        // в AndroidManifest автоматически.
        iosDisplayInForeground: true,
        androidMode: 'default',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion:                 29,        // Android 10+, arm64 only
          enableProguardInReleaseBuilds: true,       // R8 full mode
          enableShrinkResources:         true,       // удалить неиспользуемые ресурсы
          ndk: { abiFilters: ['arm64-v8a'] },        // только arm64 → −60% размера
        },
      },
    ],
    './plugins/withAndroidSigning',
  ],

  extra: {
    // Доступно в runtime через Constants.expoConfig.extra.appVariant
    appVariant: IS_CLEAN ? 'clean' : 'data',
  },

  experiments: {
    typedRoutes:     true,
    reactCompiler:   true,
  },
};
