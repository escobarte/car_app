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
import {
  setupNotificationHandler,
  requestNotificationPermissions,
  scheduleReminderNotifications,
} from '@/notifications/engine';

const IS_EXPO_GO = Constants.appOwnership === 'expo';
if (!IS_EXPO_GO) {
  setupNotificationHandler();
}

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { getLocales } from 'expo-localization';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { initDatabase, settingsRepo, fuelRepo } from '@/db';
import { importLegacyData, ImportResult } from '@/db/legacy-import';
import i18n, { isSupportedLanguage } from '@/i18n';
import { AppThemeProvider, useThemeCtx } from '@/contexts/theme-context';

export const unstable_settings = { anchor: '(tabs)' };

// ── Контекст результата импорта ───────────────────────────────────────────────
type BootstrapCtx = { importResult: ImportResult | null };
const BootstrapContext = createContext<BootstrapCtx>({ importResult: null });
export function useBootstrap() { return useContext(BootstrapContext); }

// ── Внутренний компонент: имеет доступ к ThemeContext ─────────────────────────
function NavShell({ importResult }: { importResult: ImportResult | null }) {
  const { isDark } = useThemeCtx();

  return (
    <BootstrapContext.Provider value={{ importResult }}>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)"          options={{ headerShown: false }} />
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
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeProvider>
    </BootstrapContext.Provider>
  );
}

// ── Корневой Layout ───────────────────────────────────────────────────────────
export default function RootLayout() {
  const [isReady,      setIsReady]      = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [initDark,     setInitDark]     = useState(true);

  useEffect(() => {
    async function bootstrap() {
      const deviceCode = getLocales()[0]?.languageCode ?? 'en';
      const deviceLang = isSupportedLanguage(deviceCode) ? deviceCode : 'en';

      await initDatabase(deviceLang);

      const settings = await settingsRepo.getSettings();
      if (settings) {
        if (isSupportedLanguage(settings.language)) {
          await i18n.changeLanguage(settings.language);
        }
        setInitDark(settings.theme !== 'light');
      }

      const result = await importLegacyData();
      setImportResult(result);

      // Разовая миграция: пересчёт consumption по полной формуле §6.2
      // для записей, сохранённых по старой упрощённой формуле. Идемпотентна.
      await fuelRepo.recalcAllFullTankConsumption();

      if (!IS_EXPO_GO) {
        try {
          await requestNotificationPermissions();
          scheduleReminderNotifications().catch(() => {});
        } catch {
          /* нативный модуль недоступен */
        }
      }

      setIsReady(true);
    }

    bootstrap().catch((err) => {
      console.error('[bootstrap]', err);
      setIsReady(true);
    });
  }, []);

  if (!isReady) {
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
        <NavShell importResult={importResult} />
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
