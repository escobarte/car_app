/**
 * Экран выбора валюты — Этап 9, подшаг 2.
 * Раздел ТЗ: 6.6.
 *
 * - Поиск по коду или названию
 * - Список со символом, кодом и названием
 * - Текущая валюта помечена галочкой
 * - Тап → сохраняет CAR.currency, возвращает назад
 */

import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { CURRENCY_LIST } from '@/constants/currencies';
import { carRepo } from '@/db';

export default function SelectCurrencyScreen() {
  const { t, i18n } = useTranslation();
  const isRu = i18n.language === 'ru';

  const th = useAppTheme();
  const { colors, radius, typography } = th;
  const s = useMemo(() => makeStyles(th), [th]);

  const [current, setCurrent] = useState('MDL');
  const [query,   setQuery]   = useState('');

  // ── Загрузка текущей валюты ───────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      carRepo.getCar().then(car => {
        if (car) setCurrent(car.currency);
      }).catch(console.error);
    }, [])
  );

  // ── Фильтрация ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCY_LIST;
    return CURRENCY_LIST.filter(c =>
      c.code.toLowerCase().includes(q) ||
      c.symbol.toLowerCase().includes(q) ||
      (isRu ? c.name_ru : c.name_en).toLowerCase().includes(q)
    );
  }, [query, isRu]);

  // ── Выбор ─────────────────────────────────────────────────────────────────
  async function handleSelect(code: string) {
    await carRepo.updateCar({ currency: code });
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
        <Text style={s.headerTitle}>{t('selectCurrency.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      {/* ── Поиск ──────────────────────────────────────────────────────── */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('selectCurrency.search')}
          placeholderTextColor={colors.textWeak}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {/* ── Список ─────────────────────────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.code}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => {
          const isLast     = index === filtered.length - 1;
          const isSelected = item.code === current;
          return (
            <TouchableOpacity
              style={[s.row, isLast && s.rowLast]}
              activeOpacity={0.65}
              onPress={() => handleSelect(item.code)}
            >
              {/* Символ */}
              <Text style={s.symbol}>{item.symbol}</Text>

              {/* Код + название */}
              <View style={s.textCol}>
                <Text style={s.code}>{item.code}</Text>
                <Text style={s.name} numberOfLines={1}>
                  {isRu ? item.name_ru : item.name_en}
                </Text>
              </View>

              {/* Галочка */}
              {isSelected && (
                <Ionicons name="checkmark" size={20} color={colors.accent} />
              )}
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        contentContainerStyle={s.listContent}
      />
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
      backgroundColor: colors.background,
    },
    backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    headerTitle: {
      flex: 1, textAlign: 'center',
      color: colors.textPrimary, ...typography.screenTitle,
    },
    headerSpacer: { width: 36 },

    searchWrap: {
      flexDirection:   'row',
      alignItems:      'center',
      backgroundColor: colors.surface,
      borderRadius:    radius.card,
      borderWidth:     1,
      borderColor:     colors.border,
      marginHorizontal: 16,
      marginBottom:    12,
      paddingHorizontal: 12,
    },
    searchIcon:  { marginRight: 8 },
    searchInput: {
      flex:            1,
      color:           colors.textPrimary,
      ...typography.cardText,
      paddingVertical: 12,
    },

    listContent: { paddingHorizontal: 16, paddingBottom: 40 },

    row: {
      flexDirection:   'row',
      alignItems:      'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLast: { borderBottomWidth: 0 },

    symbol: {
      minWidth:   48,
      color:      colors.accent,
      fontSize:   17,
      fontWeight: '500',
      textAlign:  'center',
    },
    textCol:  { flex: 1, marginLeft: 8 },
    code:     { color: colors.textPrimary,   ...typography.cardText },
    name:     { color: colors.textSecondary, ...typography.labelSmall, marginTop: 2 },

    separator: { height: 0 },  // border на row уже разделяет
  });
}
