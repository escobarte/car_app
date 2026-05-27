/**
 * Временный экран-проверка БД (Этап 1).
 * Показывает состояние всех 7 таблиц + результат импорта.
 * Будет заменён дашбордом в Этапе 4.
 */

import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';

import { theme } from '@/constants/theme';
import { useBootstrap } from '@/app/_layout';
import {
  carRepo, categoryRepo, reminderRepo, settingsRepo,
  Car, Category, Reminder, AppSettings,
} from '@/db';
import { openDatabase } from '@/db/database';

type Counts = { fuel: number; expense: number; service: number };
type DbState = {
  car: Car | null;
  categories: Category[];
  reminders: Reminder[];
  settings: AppSettings | null;
  counts: Counts;
};

export default function DbCheckScreen() {
  const { t } = useTranslation();
  const { importResult } = useBootstrap();
  const [data,  setData]  = useState<DbState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // useFocusEffect перечитывает данные каждый раз, когда экран получает фокус.
  // Это исправляет баг: useEffect([], []) срабатывал только при монтировании,
  // поэтому после возврата с формы add-fuel данные оставались устаревшими.
  useFocusEffect(
    useCallback(() => {
      async function load() {
        try {
          const db = await openDatabase();
          const [car, categories, reminders, settings,
                 fuelRow, expRow, svcRow] = await Promise.all([
            carRepo.getCar(),
            categoryRepo.getAllCategories(),
            reminderRepo.getAllReminders(),
            settingsRepo.getSettings(),
            db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM fuel_entry;'),
            db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM expense;'),
            db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM service_record;'),
          ]);
          setData({
            car, categories, reminders, settings,
            counts: {
              fuel:    fuelRow?.cnt ?? 0,
              expense: expRow?.cnt  ?? 0,
              service: svcRow?.cnt  ?? 0,
            },
          });
        } catch (e: unknown) {
          setError(String(e));
        }
      }
      load();
    }, [])
  );

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>{t('common.error')}: {error}</Text>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={s.center}>
        <Text style={s.textSecondary}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text style={s.header}>{t('dbCheck.title')}</Text>

      {/* ── Результат импорта ─────────────────────────────── */}
      {importResult && (
        <View style={[s.card, s.importCard]}>
          <Text style={s.importTitle}>
            {importResult.skipped ? '↩ Импорт уже выполнен' : '✅ Импорт завершён'}
          </Text>
          {!importResult.skipped && (
            <>
              <Row label="Заправок добавлено"  value={String(importResult.fuelCount)} />
              <Row label="Расходов добавлено"  value={String(importResult.expenseCount)} />
            </>
          )}
        </View>
      )}

      {/* ── CAR ──────────────────────────────────────────── */}
      <Text style={s.section}>{t('dbCheck.sectionCar')}</Text>
      {data.car ? (
        <View style={s.card}>
          <Row label="name"             value={data.car.name} />
          <Row label="current_odometer" value={`${data.car.current_odometer.toLocaleString()} км`} />
          <Row label="fuel_unit"        value={data.car.fuel_unit} />
          <Row label="currency"         value={data.car.currency} />
        </View>
      ) : <Text style={s.empty}>нет записи</Text>}

      {/* ── APP_SETTINGS ─────────────────────────────────── */}
      <Text style={s.section}>{t('dbCheck.sectionSettings')}</Text>
      {data.settings ? (
        <View style={s.card}>
          <Row label="language"              value={data.settings.language} />
          <Row label="theme"                 value={data.settings.theme} />
          <Row label="notifications_enabled" value={String(data.settings.notifications_enabled)} />
        </View>
      ) : <Text style={s.empty}>нет записи</Text>}

      {/* ── Таблицы с данными ─────────────────────────────── */}
      <Text style={s.section}>ДАННЫЕ (записи)</Text>
      <View style={s.card}>
        <Row label="fuel_entry"     value={`${data.counts.fuel} записей`} />
        <Row label="expense"        value={`${data.counts.expense} записей`} />
        <Row label="service_record" value={`${data.counts.service} записей`} />
      </View>

      {/* ── CATEGORY ─────────────────────────────────────── */}
      <Text style={s.section}>
        {t('dbCheck.sectionCategories', { count: data.categories.length })}
      </Text>
      {data.categories.map((cat) => (
        <View key={cat.id} style={s.listRow}>
          <Text style={s.iconCol}>{cat.icon}</Text>
          <Text style={s.textPrimary}>
            {cat.key ? t(`categories.${cat.key}` as never) : cat.name}
          </Text>
          {cat.is_builtin === 1 && (
            <Text style={s.badge}>{t('dbCheck.builtin')}</Text>
          )}
        </View>
      ))}

      {/* ── REMINDER ─────────────────────────────────────── */}
      <Text style={s.section}>
        {t('dbCheck.sectionReminders', { count: data.reminders.length })}
      </Text>
      {data.reminders.map((r) => (
        <View key={r.id} style={s.card}>
          <Row label="title"       value={r.title} />
          <Row label="type"        value={r.type} />
          <Row label="interval"    value={
            r.type === 'mileage'
              ? `${r.interval_km} ${t('common.km')}`
              : `${r.interval_days} ${t('common.days_many')}`
          } />
          <Row label="warn_before" value={
            r.type === 'mileage'
              ? `${r.warn_before} ${t('common.km')}`
              : `${r.warn_before} ${t('common.days_many')}`
          } />
        </View>
      ))}

      <Text style={s.footer}>{t('dbCheck.footer')}</Text>

      {/* ── Временные кнопки навигации (Этапы 2–3) ── */}
      <TouchableOpacity
        style={s.testBtn}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPress={() => router.push('/add-fuel' as any)}
        activeOpacity={0.8}
      >
        <Text style={s.testBtnText}>⛽ Тест: добавить заправку →</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.testBtn, { marginTop: 8 }]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPress={() => router.push('/history' as any)}
        activeOpacity={0.8}
      >
        <Text style={s.testBtnText}>📋 История →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.rowInner}>
      <Text style={s.textSecondary}>{label}: </Text>
      <Text style={s.textPrimary}>{value}</Text>
    </View>
  );
}

const { colors, radius, typography } = theme;

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.background },
  content:     { padding: 16, paddingBottom: 40 },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center',
                 backgroundColor: colors.background },

  header:      { color: colors.accent, ...typography.screenTitle, marginBottom: 16 },
  section:     { color: colors.textWeak, ...typography.sectionHeader,
                 marginTop: 20, marginBottom: 8, textTransform: 'uppercase' },

  card:        { backgroundColor: colors.surface, borderRadius: radius.card,
                 padding: 12, marginBottom: 4 },
  importCard:  { borderWidth: 1, borderColor: colors.statusOk.text },
  importTitle: { color: colors.statusOk.text, ...typography.cardTextMedium,
                 marginBottom: 6 },
  rowInner:    { flexDirection: 'row', marginBottom: 2 },

  listRow:     { flexDirection: 'row', alignItems: 'center',
                 paddingVertical: 6, borderBottomWidth: 1,
                 borderBottomColor: colors.border },

  textPrimary:   { color: colors.textPrimary,   ...typography.cardText },
  textSecondary: { color: colors.textSecondary, ...typography.cardText },
  iconCol:       { color: colors.textSecondary, ...typography.cardText, width: 130 },
  badge:         { color: colors.accent,        ...typography.labelSmall, marginLeft: 'auto' },
  empty:         { color: colors.textWeak,      ...typography.cardText, marginBottom: 8 },

  errorText:   { color: colors.statusDue.text, padding: 16, textAlign: 'center' },
  footer:      { color: colors.statusOk.text,  marginTop: 24,
                 ...typography.label, textAlign: 'center' },

  testBtn: {
    marginTop: 20,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderAccent,
    paddingVertical: 14,
    alignItems: 'center',
  },
  testBtnText: {
    color: colors.accent,
    ...typography.cardTextMedium,
  },
});
