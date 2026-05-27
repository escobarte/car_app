// Инициализация i18n должна быть ПЕРВОЙ строкой — до любых импортов компонентов.
// Это гарантирует, что словари загружены до первого рендера.
import '@/i18n';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { getLocales } from 'expo-localization';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { initDatabase, settingsRepo } from '@/db';
import i18n, { isSupportedLanguage } from '@/i18n';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      // 1. Определяем язык телефона для первого запуска
      const deviceCode = getLocales()[0]?.languageCode ?? 'en';
      const deviceLang = isSupportedLanguage(deviceCode) ? deviceCode : 'en';

      // 2. Инициализируем БД (передаём язык — используется только при первом запуске)
      await initDatabase(deviceLang);

      // 3. Читаем сохранённый язык из настроек и применяем к i18n
      //    (на первом запуске совпадёт с deviceLang, потом — с выбором пользователя)
      const settings = await settingsRepo.getSettings();
      if (settings && isSupportedLanguage(settings.language)) {
        await i18n.changeLanguage(settings.language);
      }

      setIsReady(true);
    }

    bootstrap().catch((err) => {
      console.error('[bootstrap] Ошибка:', err);
      setIsReady(true); // показываем приложение даже при ошибке
    });
  }, []);

  // Пока идёт инициализация — тёмный фон со спиннером (цвета из дизайн-системы)
  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3db5f5" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
