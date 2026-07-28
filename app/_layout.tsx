// i18n должен быть первым импортом — до любых компонентов
import '@/i18n';

import { LogBox } from 'react-native';
LogBox.ignoreLogs([
  'expo-notifications',
  '[expo-notifications]',
  'Notifications.setNotificationHandler',
  'expo-notifications: Android Push',
]);

import Constants from 'expo-constants';
import * as Application from 'expo-application';
import {
  setupNotificationHandler,
  scheduleReminderNotifications,
} from '@/notifications/engine';

const IS_EXPO_GO = Constants.appOwnership === 'expo';
if (!IS_EXPO_GO) {
  setupNotificationHandler();
}

// Определяем вариант сборки двумя способами (belt-and-suspenders):
// 1. Application.applicationId — читает фактический applicationId, заданный Gradle;
//    100% надёжен в release-APK: com.escobarte.autoapp.clean → clean.
// 2. Constants.expoConfig.extra.appVariant — запасной путь для dev-окружения,
//    где applicationId может совпадать у обоих вариантов.
const _appId     = Application.applicationId ?? '';
const _fromNative = _appId.endsWith('.clean') ? 'clean' : null;
const _fromConfig = Constants.expoConfig?.extra?.appVariant as string | undefined;
const APP_VARIANT: 'clean' | 'data' =
  (_fromNative ?? _fromConfig ?? 'data') === 'clean' ? 'clean' : 'data';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { getLocales } from 'expo-localization';
import { Redirect, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { onboardingFontAssets } from '@/constants/fonts';
import { initDatabase, settingsRepo, fuelRepo } from '@/db';
import { importLegacyData, ImportResult } from '@/db/legacy-import';
import i18n, { isSupportedLanguage } from '@/i18n';
import { AppThemeProvider, useThemeCtx } from '@/contexts/theme-context';

export const unstable_settings = { anchor: '(tabs)' };

// Держим нативный splash на экране, пока не готовы БД и шрифты.
// Скрываем вручную ниже, в RootLayout.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* splash уже скрыт или недоступен (web / Expo Go) */
});

// ── Контекст результата импорта ───────────────────────────────────────────────
type BootstrapCtx = {
  importResult: ImportResult | null;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  /** true — онбординг ещё ни разу не пройден (первый запуск приложения).
   *  По нему решается, показывать ли запрос разрешения на уведомления:
   *  при повторном прохождении из настроек — не показывать. */
  isFirstRun: boolean;
};
const BootstrapContext = createContext<BootstrapCtx>({
  importResult: null,
  completeOnboarding: () => {},
  resetOnboarding: () => {},
  isFirstRun: false,
});
export function useBootstrap() { return useContext(BootstrapContext); }

// ── Внутренний компонент: имеет доступ к ThemeContext ─────────────────────────
function NavShell({
  importResult,
  initialOnboardingCompleted,
}: {
  importResult: ImportResult | null;
  initialOnboardingCompleted: boolean;
}) {
  const { isDark } = useThemeCtx();
  const [onboardingCompleted, setOnboardingCompleted] = useState(initialOnboardingCompleted);

  const completeOnboarding = useCallback(() => setOnboardingCompleted(true), []);
  const resetOnboarding    = useCallback(() => setOnboardingCompleted(false), []);

  return (
    <BootstrapContext.Provider
      value={{ importResult, completeOnboarding, resetOnboarding,
               isFirstRun: !initialOnboardingCompleted }}
    >
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="onboarding"       options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="(tabs)"           options={{ headerShown: false }} />
          <Stack.Screen name="add-fuel"         options={{ headerShown: false }} />
          <Stack.Screen name="add-expense"      options={{ headerShown: false }} />
          <Stack.Screen name="add-reminder"     options={{ headerShown: false }} />
          <Stack.Screen name="settings"         options={{ headerShown: false }} />
          <Stack.Screen name="select-currency"  options={{ headerShown: false }} />
          <Stack.Screen name="select-language"  options={{ headerShown: false }} />
          <Stack.Screen name="categories"       options={{ headerShown: false }} />
          <Stack.Screen name="history"          options={{ headerShown: false }} />
          <Stack.Screen name="db-check"         options={{ headerShown: false }} />
          <Stack.Screen name="modal"            options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        {!onboardingCompleted && <Redirect href={'/onboarding' as never} />}
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeProvider>
    </BootstrapContext.Provider>
  );
}

// ── Корневой Layout ───────────────────────────────────────────────────────────
export default function RootLayout() {
  const [isReady,                   setIsReady]                   = useState(false);
  const [importResult,              setImportResult]              = useState<ImportResult | null>(null);
  const [initDark,                  setInitDark]                  = useState(true);
  const [initOnboardingCompleted,   setInitOnboardingCompleted]   = useState(true);

  // Шрифты Onboarding. fontError — не блокируем запуск: приложение стартует
  // на системном шрифте, а не зависает на splash навсегда.
  const [fontsLoaded, fontError] = useFonts(onboardingFontAssets);

  useEffect(() => {
    if (fontError) console.error('[fonts]', fontError);
  }, [fontError]);

  useEffect(() => {
    async function bootstrap() {
      const deviceCode = getLocales()[0]?.languageCode ?? 'en';
      const deviceLang = isSupportedLanguage(deviceCode) ? deviceCode : 'en';

      await initDatabase(deviceLang, APP_VARIANT === 'clean');

      const settings = await settingsRepo.getSettings();
      if (settings) {
        if (isSupportedLanguage(settings.language)) {
          await i18n.changeLanguage(settings.language);
        }
        setInitDark(settings.theme !== 'light');
        setInitOnboardingCompleted((settings.onboarding_completed ?? 0) === 1);
      }

      if (APP_VARIANT === 'data') {
        const result = await importLegacyData();
        setImportResult(result);
        // Разовая идемпотентная миграция: пересчёт consumption по формуле §6.2
        await fuelRepo.recalcAllFullTankConsumption();
      }

      // Разрешение на уведомления здесь НЕ запрашивается: системный диалог
      // на старте даёт низкий процент согласий и всплывает поверх splash.
      // Его показывает последний шаг онбординга — см. handleFinish()
      // в app/onboarding.tsx. Здесь только пересборка расписания для тех,
      // кто разрешение уже выдал.
      if (!IS_EXPO_GO) {
        scheduleReminderNotifications().catch(() => {});
      }

      setIsReady(true);
    }

    bootstrap().catch((err) => {
      console.error('[bootstrap]', err);
      setIsReady(true);
    });
  }, []);

  // Рендерим только когда готовы И данные, И шрифты.
  const canRender = isReady && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (canRender) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [canRender]);

  if (!canRender) {
    // Поверх лежит нативный splash; индикатор — запасной вариант там,
    // где splash недоступен.
    return (
      <View style={{ flex: 1, backgroundColor: '#000000',
                     justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3db5f5" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider initialDark={initDark}>
        <NavShell importResult={importResult} initialOnboardingCompleted={initOnboardingCompleted} />
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
