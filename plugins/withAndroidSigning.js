/**
 * Config-plugin: release-подпись + принудительный arm64-v8a ABI.
 *
 * withAppBuildGradle — вшивает release-signing в android/app/build.gradle.
 * withGradleProperties — выставляет reactNativeArchitectures=arm64-v8a,
 *   перекрывая дефолтное значение RN-шаблона (все 4 архитектуры).
 *   Это главный способ ограничить ABI в RN 0.76+; ndk.abiFilters в build.gradle
 *   не перебивает это свойство.
 *
 * Оба мода идемпотентны и применяются при каждом expo prebuild.
 */
const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

const MARKER = '// CAR_APP_SIGNING';

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

function applySigningToBuildGradle(config) {
  return withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;
    if (src.includes(MARKER)) return config;

    if (src.includes('signingConfigs')) {
      src = src.replace(/(\bsigningConfigs\s*\{)/, `$1${RELEASE_BLOCK}`);
    }
    src = src.replace(
      /^(\s+)(minifyEnabled\b)/m,
      '$1signingConfig signingConfigs.release\n$1$2',
    );

    config.modResults.contents = src;
    return config;
  });
}

function forceArm64Only(config) {
  return withGradleProperties(config, (config) => {
    // Удалить любое существующее значение (дефолт RN — все 4 архитектуры)
    config.modResults = config.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'reactNativeArchitectures'),
    );
    config.modResults.push({
      type: 'property',
      key: 'reactNativeArchitectures',
      value: 'arm64-v8a',
    });
    return config;
  });
}

module.exports = (config) => forceArm64Only(applySigningToBuildGradle(config));
