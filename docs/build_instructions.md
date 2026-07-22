bash
cd /mnt/a/car_app
nano docs/build.md

Вставь:
# Сборка APK (data / clean)

## Подпись
- Keystore: `car_release.jks` в корне проекта. Alias: `car_release`.
- Пароль: в менеджере паролей. В git и в чаты не писать.
- Конфиг подписи: `android/app/key.properties` (создаётся из бэкапа).
- Бэкап обоих файлов: `~/keys_backup/` + копия в облаке.
- ВАЖНО: потеря keystore = невозможно обновить приложение в Play. Навсегда.

## Правило
`android/` в .gitignore — откатить через git нельзя.
`prebuild` ВСЕГДА запускать с `--clean`. Без него папка переиспользуется
и в build.gradle остаётся applicationIdSuffix от прошлого варианта —
сборка data встаёт поверх clean, база выглядит пустой.
`--clean` сносит `key.properties` → сразу после него `./restore_signing.sh`.

## Сборка data

cd /mnt/a/car_app
export APP_VARIANT=data
npx expo prebuild --platform android --clean
./restore_signing.sh
cd android && ./gradlew assembleRelease && cd ..
cp android/app/build/outputs/apk/release/app-release.apk ~/apk_data.apk


## Сборка clean
То же, но `export APP_VARIANT=clean`, и копировать в `~/apk_clean.apk`.

## Проверка
- `grep applicationId android/app/build.gradle` — до gradlew.
  data → `com.escobarte.autoapp`, clean → тот же + суффикс `.clean`.
- APK должен называться `app-release.apk`, не `app-release-unsigned.apk`.

## История
22.07.2026 — keystore пересоздан (старый пароль засветился на скриншоте).
Старый файл: `car_release_OLD.jks`. Из-за смены подписи APK, собранные
до этой даты, не обновляются поверх — только удалить и поставить заново.

Ctrl+O → Enter → Ctrl+X