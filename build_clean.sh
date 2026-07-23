#!/bin/bash
set -e

PROJECT_DIR="/mnt/a/car_app"
OUT_DIR="/mnt/c/Users/Admin/OneDrive/car_apk/Ver_4_export_solving"
APK_SRC="android/app/build/outputs/apk/release/app-release.apk"

cd "$PROJECT_DIR"

echo "=== 1/5 prebuild (clean) ==="
export APP_VARIANT=clean
npx expo prebuild --platform android --clean

echo "=== 2/5 restore signing ==="
./restore_signing.sh

echo "=== 3/5 check applicationId ==="
grep -n "applicationId" android/app/build.gradle

if ! grep -q "applicationIdSuffix '.clean'" android/app/build.gradle; then
  echo ""
  echo "ОШИБКА: суффикс '.clean' не найден в build.gradle."
  echo "Сборка остановлена — иначе APK встанет поверх другого варианта."
  exit 1
fi

if [ ! -f android/app/key.properties ]; then
  echo "ОШИБКА: android/app/key.properties отсутствует. APK будет без подписи."
  exit 1
fi

echo "=== 4/5 gradle assembleRelease ==="
cd android
./gradlew assembleRelease
cd ..

if [ ! -f "$APK_SRC" ]; then
  echo "ОШИБКА: $APK_SRC не найден. Проверь вывод gradle выше."
  exit 1
fi

echo "=== 5/5 copy APK ==="
mkdir -p "$OUT_DIR"
STAMP=$(date +"%Y-%m-%d_%H-%M")
DEST="$OUT_DIR/apk_clean_v$STAMP.apk"
cp "$APK_SRC" "$DEST"

echo ""
echo "ГОТОВО: $DEST"
ls -lh "$DEST"
