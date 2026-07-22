data (из корня проекта):

bash
cd /mnt/a/car_app
export APP_VARIANT=data
npx expo prebuild --platform android --clean
./restore_signing.sh
grep -n "applicationId" android/app/build.gradle

Проверь: должно быть com.escobarte.autoapp без суффикса. Затем:

bash
cd android && ./gradlew assembleRelease && cd ..
cp android/app/build/outputs/apk/release/app-release.apk ~/apk_data.apk

clean:

bash
export APP_VARIANT=clean
npx expo prebuild --platform android --clean
./restore_signing.sh
grep -n "applicationId" android/app/build.gradle

Проверь: должен появиться applicationIdSuffix '.clean'. Затем:

bash
cd android && ./gradlew assembleRelease && cd ..
cp android/app/build/outputs/apk/release/app-release.apk ~/apk_clean.apk

Три правила: всегда --clean, сразу после него restore_signing.sh, и grep до gradlew. Имя APK — без -unsigned.

Оба старых приложения с телефона удали — подпись сменилась, поверх не встанут.