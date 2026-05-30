/**
 * Экран выбора языка — Этап 9, подшаг 2.
 *
 * - Два пункта: Русский / English
 * - Текущий помечен галочкой
 * - Тап → сохраняет APP_SETTINGS.language + i18n.changeLanguage() → назад
 */

import { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { settingsRepo } from '@/db';
import i18n from '@/i18n';

const LANGUAGES = [
  { code: 'ru' as const, label: 'Русский' },
  { code: 'en' as const, label: 'English' },
];

export default function SelectLanguageScreen() {
  const { t } = useTranslation();

  const th = useAppTheme();
  const { colors, radius, typography } = th;
  const s = useMemo(() => makeStyles(th), [th]);

  const [current, setCurrent] = useState<'ru' | 'en'>('ru');

  useFocusEffect(
    useCallback(() => {
      settingsRepo.getSettings().then(s => {
        if (s) setCurrent(s.language);
      }).catch(console.error);
    }, [])
  );

  async function handleSelect(code: 'ru' | 'en') {
    await settingsRepo.updateSettings({ language: code });
    await i18n.changeLanguage(code);
    router.back();
  }

  return (
    <View style={s.screen}>
      {/* ── Шапка ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('selectLanguage.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      {/* ── Список языков ──────────────────────────────────────────────── */}
      <View style={s.card}>
        {LANGUAGES.map((lang, idx) => {
          const isSelected = lang.code === current;
          const isLast     = idx === LANGUAGES.length - 1;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[s.row, isLast && s.rowLast]}
              activeOpacity={0.65}
              onPress={() => handleSelect(lang.code)}
            >
              <Text style={[s.label, isSelected && s.labelActive]}>
                {lang.label}
              </Text>
              {isSelected && (
                <Ionicons name="checkmark" size={20} color={colors.accent} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(th: AppTheme) {
  const { colors, radius, typography } = th;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },

    header: {
      flexDirection:   'row',
      alignItems:      'center',
      paddingTop:      56,
      paddingBottom:   12,
      paddingHorizontal: 16,
    },
    backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    headerTitle: {
      flex: 1, textAlign: 'center',
      color: colors.textPrimary, ...typography.screenTitle,
    },
    headerSpacer: { width: 36 },

    card: {
      backgroundColor: colors.surface,
      borderRadius:    radius.card,
      marginHorizontal: 16,
      overflow:        'hidden',
    },

    row: {
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'space-between',
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLast: { borderBottomWidth: 0 },

    label:       { color: colors.textPrimary,   ...typography.cardText },
    labelActive: { color: colors.accent },
  });
}
