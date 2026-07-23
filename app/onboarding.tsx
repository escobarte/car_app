/**
 * Онбординг — заглушка для проверки роутинга.
 * Полная вёрстка будет добавлена после проверки на телефоне.
 */

import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';

import { useBootstrap } from '@/app/_layout';
import { useAppTheme } from '@/contexts/theme-context';
import { settingsRepo, carRepo } from '@/db';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { completeOnboarding } = useBootstrap();

  // Блокируем аппаратную кнопку «Назад»
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  async function handleFinish() {
    // Сохраняем дефолтные значения машины (будет заменено полными данными в Phase 2)
    await carRepo.updateCar({ name: t('onboarding.name_placeholder'), current_odometer: 0 });
    await settingsRepo.updateSettings({ onboarding_completed: 1 });
    completeOnboarding();
    router.replace('/(tabs)');
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <Text style={[s.title, { color: colors.textPrimary }]}>
        {t('onboarding.done_title')}
      </Text>
      <Text style={[s.sub, { color: colors.textSecondary }]}>
        Роутинг работает. Полная вёрстка — после проверки.
      </Text>
      <TouchableOpacity
        style={[s.btn, { backgroundColor: colors.accent }]}
        activeOpacity={0.8}
        onPress={handleFinish}
      >
        <Text style={[s.btnText, { color: colors.background }]}>
          {t('onboarding.go')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title:   { fontSize: 24, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  sub:     { fontSize: 15, textAlign: 'center', marginBottom: 40 },
  btn:     { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 15 },
  btnText: { fontSize: 16, fontWeight: '600' },
});
