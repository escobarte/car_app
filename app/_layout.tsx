// i18n должен быть первым импортом — до любых компонентов
import '@/i18n';

// Foreground-обработчик уведомлений должен быть установлен до рендера.
// В Expo Go (appOwnership === 'expo') expo-notifications не поддерживается
// начиная с SDK 53 — пропускаем инициализацию, чтобы не было предупреждений.
import Constants from 'expo-constants';
import {
  setupNotificationHandler,
  requestNotificationPermissions,
  scheduleReminderNotifications,
} from '@/notifications/engine';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

if (!IS_EXPO_GO) {
  try {
    setupNotificationHandler();
  } catch {
    // в dev-сборках без нативного модуля — молча игнорируем
  }
}

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { getLocales } from 'expo-localization';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { initDatabase, settingsRepo } from '@/db';
import { importLegacyData, ImportResult } from '@/db/legacy-import';
import i18n, { isSupportedLanguage } from '@/i18n';

export const unstable_settings = { anchor: '(tabs)' };

// ── Контекст результата импорта (чтобы экран-проверка мог его показать) ─────
type BootstrapCtx = { importResult: ImportResult | null };
const BootstrapContext = createContext<BootstrapCtx>({ importResult: null });
export function useBootstrap() { return useContext(BootstrapContext); }

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isReady,      setIsReady]      = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    async function bootstrap() {
      // 1. Язык телефона для первого запуска
      const deviceCode = getLocales()[0]?.languageCode ?? 'en';
      const deviceLang = isSupportedLanguage(deviceCode) ? deviceCode : 'en';

      // 2. БД: таблицы + стартовые данные
      await initDatabase(deviceLang);

      // 3. Язык из сохранённых настроек → i18n
      const settings = await settingsRepo.getSettings();
      if (settings && isSupportedLanguage(settings.language)) {
        await i18n.changeLanguage(settings.language);
      }

      // 4. Разовый импорт исторических данных
      const result = await importLegacyData();
      setImportResult(result);

      // 5. Уведомления — только в production/dev-build, не в Expo Go
      if (!IS_EXPO_GO) {
        try {
          await requestNotificationPermissions();
          scheduleReminderNotifications().catch(() => {}); // не блокируем старт
        } catch {
          // нативный модуль недоступен — молча пропускаем
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
    <BootstrapContext.Provider value={{ importResult }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)"     options={{ headerShown: false }} />
          <Stack.Screen name="add-fuel"     options={{ headerShown: false }} />
          <Stack.Screen name="add-expense"   options={{ headerShown: false }} />
          <Stack.Screen name="add-reminder"  options={{ headerShown: false }} />
          <Stack.Screen name="history"    options={{ headerShown: false }} />
          <Stack.Screen name="db-check"   options={{ headerShown: false }} />
          <Stack.Screen name="modal"      options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </BootstrapContext.Provider>
  );
}
