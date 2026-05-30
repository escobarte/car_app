/**
 * Экран-проверка БД (Этап 1) — перенесён сюда из (tabs)/index.tsx
 * на Этапе 4, когда главный экран стал Дашбордом.
 * Доступен с Дашборда кнопкой «🗄 DB Check».
 */

import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { useBootstrap } from '@/app/_layout';
import {
  carRepo, categoryRepo, reminderRepo, settingsRepo,
  Car, Category, Reminder, AppSettings,
} from '@/db';
import { openDatabase } from '@/db/database';
import {
  cleanupTestData, CleanupResult,
  getAnomalousFuelEntries, deleteAnomalousFuelEntries,
  AnomalousFuelEntry,
} from '@/db/dev-tools';

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

  const th = useAppTheme();
  const { colors, typography } = th;
  const s = useMemo(() => makeStyles(th), [th]);

  const [data,          setData]          = useState<DbState | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [cleaning,      setCleaning]      = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [anomalous,     setAnomalous]     = useState<AnomalousFuelEntry[]>([]);
  const [anomChecked,   setAnomChecked]   = useState(false);
  const [anomDeleting,  setAnomDeleting]  = useState(false);
  const [selectedIds,   setSelectedIds]   = useState<Set<number>>(new Set());

  async function reload() {
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

  useFocusEffect(useCallback(() => { reload(); }, []));  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Аномальные заправки ───────────────────────────────────────────────────
  async function handleCheckAnomalous() {
    const entries = await getAnomalousFuelEntries();
    setAnomalous(entries);
    setSelectedIds(new Set(entries.map(e => e.id)));
    setAnomChecked(true);
  }

  function toggleSelected(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    setAnomDeleting(true);
    try {
      await deleteAnomalousFuelEntries([...selectedIds]);
      const remaining = await getAnomalousFuelEntries();
      setAnomalous(remaining);
      setSelectedIds(new Set(remaining.map(e => e.id)));
      await reload();
    } finally {
      setAnomDeleting(false);
    }
  }

  async function handleCleanup() {
    if (cleaning) return;
    setCleaning(true);
    try {
      const result = await cleanupTestData();
      setCleanupResult(result);
      await reload();          // обновляем счётчики на экране
    } catch (e) {
      setError(String(e));
    } finally {
      setCleaning(false);
    }
  }

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
      <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
        <Text style={s.backBtnText}>← Назад</Text>
      </TouchableOpacity>

      <Text style={s.header}>{t('dbCheck.title')}</Text>

      {/* ── Результат импорта ─────────────────────────────── */}
      {importResult && (
        <View style={[s.card, s.importCard]}>
          <Text style={s.importTitle}>
            {importResult.skipped ? '↩ Импорт уже выполнен' : '✅ Импорт завершён'}
          </Text>
          {!importResult.skipped && (
            <>
              <Row label="Заправок добавлено"  value={String(importResult.fuelCount)} s={s} />
              <Row label="Расходов добавлено"  value={String(importResult.expenseCount)} s={s} />
            </>
          )}
        </View>
      )}

      {/* ── Очистка тестовых данных ───────────────────────── */}
      {cleanupResult ? (
        <View style={[s.card, s.cleanCard]}>
          <Text style={s.cleanTitle}>🧹 Очистка выполнена</Text>
          <Row label="Удалено заправок"  value={String(cleanupResult.deletedFuel)} s={s} />
          <Row label="Осталось заправок" value={String(cleanupResult.remainingFuel)} s={s} />
          <Row label="Пробег сброшен на" value={`${cleanupResult.odoReset.toLocaleString()} км`} s={s} />
        </View>
      ) : (
        <TouchableOpacity
          style={[s.testBtn, s.cleanBtn]}
          onPress={handleCleanup}
          activeOpacity={0.8}
          disabled={cleaning}
        >
          <Text style={s.cleanBtnText}>
            {cleaning ? '⏳ Удаляю…' : '🧹 Удалить тестовые заправки (одометр > 205 071)'}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── CAR ──────────────────────────────────────────── */}
      <Text style={s.section}>{t('dbCheck.sectionCar')}</Text>
      {data.car ? (
        <View style={s.card}>
          <Row label="name"             value={data.car.name} s={s} />
          <Row label="current_odometer" value={`${data.car.current_odometer.toLocaleString()} км`} s={s} />
          <Row label="fuel_unit"        value={data.car.fuel_unit} s={s} />
          <Row label="currency"         value={data.car.currency} s={s} />
        </View>
      ) : <Text style={s.empty}>нет записи</Text>}

      {/* ── APP_SETTINGS ─────────────────────────────────── */}
      <Text style={s.section}>{t('dbCheck.sectionSettings')}</Text>
      {data.settings ? (
        <View style={s.card}>
          <Row label="language"              value={data.settings.language} s={s} />
          <Row label="theme"                 value={data.settings.theme} s={s} />
          <Row label="notifications_enabled" value={String(data.settings.notifications_enabled)} s={s} />
        </View>
      ) : <Text style={s.empty}>нет записи</Text>}

      {/* ── Таблицы с данными ─────────────────────────────── */}
      <Text style={s.section}>ДАННЫЕ (записи)</Text>
      <View style={s.card}>
        <Row label="fuel_entry"     value={`${data.counts.fuel} записей`} s={s} />
        <Row label="expense"        value={`${data.counts.expense} записей`} s={s} />
        <Row label="service_record" value={`${data.counts.service} записей`} s={s} />
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
          <Row label="title"       value={r.title} s={s} />
          <Row label="type"        value={r.type} s={s} />
          <Row label="interval"    value={
            r.type === 'mileage'
              ? `${r.interval_km} ${t('common.km')}`
              : `${r.interval_days} ${t('common.days_many')}`
          } s={s} />
          <Row label="warn_before" value={
            r.type === 'mileage'
              ? `${r.warn_before} ${t('common.km')}`
              : `${r.warn_before} ${t('common.days_many')}`
          } s={s} />
        </View>
      ))}

      {/* ── Аномальные заправки ──────────────────────────────── */}
      <Text style={s.section}>🔍 АНОМАЛЬНЫЕ ЗАПРАВКИ</Text>
      {!anomChecked ? (
        <TouchableOpacity
          style={[s.testBtn, { marginTop: 0 }]}
          onPress={handleCheckAnomalous}
          activeOpacity={0.8}
        >
          <Text style={s.testBtnText}>Проверить аномальные записи</Text>
        </TouchableOpacity>
      ) : anomalous.length === 0 ? (
        <View style={[s.card, { borderWidth: 1, borderColor: colors.statusOk.text }]}>
          <Text style={{ color: colors.statusOk.text, ...typography.label }}>
            ✅ Аномальных записей не найдено
          </Text>
        </View>
      ) : (
        <>
          <Text style={{ color: colors.statusSoon.text, ...typography.labelSmall, marginBottom: 8 }}>
            Найдено {anomalous.length} записей. Отметьте нужные и нажмите «Удалить».
          </Text>
          {anomalous.map(entry => (
            <TouchableOpacity
              key={entry.id}
              style={[s.anomRow, selectedIds.has(entry.id) && s.anomRowSelected]}
              onPress={() => toggleSelected(entry.id)}
              activeOpacity={0.7}
            >
              <View style={s.anomCheck}>
                {selectedIds.has(entry.id) && (
                  <Text style={{ color: colors.accent }}>✓</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, ...typography.labelSmall }}>
                  {entry.date} · {entry.odometer.toLocaleString()} км
                </Text>
                <Text style={{ color: colors.statusDue.text, ...typography.labelSmall }}>
                  ⚠ {entry.reason}
                </Text>
                <Text style={{ color: colors.textSecondary, ...typography.labelSmall }}>
                  {entry.liters.toFixed(1)} л · {entry.total_cost.toFixed(2)} MDL
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[s.testBtn, s.cleanBtn, { marginTop: 8 }]}
            onPress={handleDeleteSelected}
            activeOpacity={0.8}
            disabled={anomDeleting || selectedIds.size === 0}
          >
            <Text style={s.cleanBtnText}>
              {anomDeleting
                ? '⏳ Удаляю…'
                : `🗑 Удалить выбранные (${selectedIds.size})`}
            </Text>
          </TouchableOpacity>
        </>
      )}

      <Text style={s.footer}>{t('dbCheck.footer')}</Text>

      {/* ── Кнопки быстрого перехода ── */}
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
        onPress={() => router.push('/add-expense' as any)}
        activeOpacity={0.8}
      >
        <Text style={s.testBtnText}>💳 Тест: добавить расход →</Text>
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

type RowStyles = ReturnType<typeof makeStyles>;

function Row({ label, value, s }: { label: string; value: string; s: RowStyles }) {
  return (
    <View style={s.rowInner}>
      <Text style={s.textSecondary}>{label}: </Text>
      <Text style={s.textPrimary}>{value}</Text>
    </View>
  );
}

function makeStyles(th: AppTheme) {
  const { colors, radius, typography } = th;
  return StyleSheet.create({
    root:        { flex: 1, backgroundColor: colors.background },
    content:     { padding: 16, paddingBottom: 40 },
    center:      { flex: 1, justifyContent: 'center', alignItems: 'center',
                   backgroundColor: colors.background },

    backBtn:     { marginBottom: 8 },
    backBtnText: { color: colors.accent, ...typography.label },

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

    // Аномальные записи
    anomRow: {
      flexDirection:   'row',
      alignItems:      'flex-start',
      backgroundColor: colors.surface,
      borderRadius:    radius.card,
      borderWidth:     1,
      borderColor:     colors.border,
      padding:         10,
      marginBottom:    4,
    },
    anomRowSelected: {
      borderColor:     colors.borderAccent,
      backgroundColor: colors.activeCard,
    },
    anomCheck: {
      width:          22,
      height:         22,
      borderRadius:   4,
      borderWidth:    1,
      borderColor:    colors.border,
      justifyContent: 'center',
      alignItems:     'center',
      marginRight:    8,
      marginTop:      2,
    },

    // Очистка тестовых данных
    cleanBtn: {
      marginTop: 0,
      borderColor: colors.statusDue.text,
    },
    cleanBtnText: {
      color: colors.statusDue.text,
      ...typography.label,
    },
    cleanCard: {
      borderWidth: 1,
      borderColor: colors.statusOk.text,
    },
    cleanTitle: {
      color: colors.statusOk.text,
      ...typography.cardTextMedium,
      marginBottom: 6,
    },
  });
}
