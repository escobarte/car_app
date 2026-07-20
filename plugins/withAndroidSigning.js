/**
 * Config-plugin: добавляет release-подпись в android/app/build.gradle.
 *
 * Параметры подписи читаются из android/app/key.properties (создаётся вручную,
 * в .gitignore через правило /android).  Если файл отсутствует — signing-блок
 * остаётся пустым и Gradle использует debug-ключ (удобно при первом prebuild
 * до создания keystore).
 *
 * Плагин идемпотентен: маркер CAR_APP_SIGNING предотвращает двойной патч.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// CAR_APP_SIGNING';

// Groovy-блок, вставляемый внутрь signingConfigs { }
const RELEASE_BLOCK = `
        ${MARKER}
        release {
            def kf = rootProject.file("app/key.properties")
            if (kf.exists()) {
                def props = new Properties()
                kf.withInputStream { props.load(it) }
                storeFile     props['storeFile']     ? file(props['storeFile']) : null
                storePassword props['storePassword'] ?: ""
                keyAlias      props['keyAlias']      ?: ""
                keyPassword   props['keyPassword']   ?: ""
            }
        }`;

module.exports = (config) =>
  withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;

    // Уже патчили — ничего не делаем
    if (src.includes(MARKER)) return config;

    // 1. Добавить release-блок в начало signingConfigs { }
    if (src.includes('signingConfigs')) {
      src = src.replace(/(\bsigningConfigs\s*\{)/, `$1${RELEASE_BLOCK}`);
    }

    // 2. Добавить signingConfig signingConfigs.release перед minifyEnabled
    //    (minifyEnabled есть только в release-buildType)
    src = src.replace(
      /^(\s+)(minifyEnabled\b)/m,
      '$1signingConfig signingConfigs.release\n$1$2',
    );

    config.modResults.contents = src;
    return config;
  });
