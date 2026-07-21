const IS_CLEAN = process.env.APP_VARIANT === 'clean';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name:        IS_CLEAN ? 'Авто (чистый)' : 'Авто',
  slug:        'car_app',
  version:     '1.0.0',
  orientation: 'portrait',
  icon:        IS_CLEAN ? './assets/icon-clean.png' : './assets/icon-data.png',
  scheme:      'carapp',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,

  ios: {
    supportsTablet: true,
  },

  android: {
    // namespace и базовый applicationId — одинаковые для обоих вариантов.
    // Суффикс .clean добавляется плагином withAndroidSigning через applicationIdSuffix.
    package: 'com.escobarte.autoapp',
    adaptiveIcon: {
      foregroundImage: IS_CLEAN
        ? './assets/icon-clean-foreground.png'
        : './assets/icon-data-foreground.png',
      backgroundColor: IS_CLEAN ? '#1c1c22' : '#1a8fd6',
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
    [
      'expo-splash-screen',
      {
        image:           './assets/images/splash-icon.png',
        imageWidth:      200,
        resizeMode:      'contain',
        backgroundColor: '#ffffff',
        dark: { backgroundColor: '#000000' },
      },
    ],
    'expo-sqlite',
    'expo-localization',
    '@react-native-community/datetimepicker',
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
