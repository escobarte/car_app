/**
 * Главный экран — Дашборд (Этап 4).
 * Разделы ТЗ: 4.1, 6.3, 6.4.
 * Дизайн: docs/дизайн_система.md.
 *
 * Блоки сверху вниз:
 *  1. Шапка: месяц + пробег + шестерёнка (заглушка)
 *  2. Градиентный блок: расходы за текущий месяц (ТЗ 6.4)
 *  3. Две карточки: средняя цена литра + средний расход
 *  4. Секция напоминаний с цветами статусов (ТЗ 6.3)
 *  5. Кнопки быстрого доступа (заглушки Этапов 2–3)
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { theme } from '@/constants/theme';
import { currencySymbol } from '@/constants/currencies';
import {
  carRepo, fuelRepo, expenseRepo, serviceRepo, reminderRepo,
  Car, FuelEntry, Expense, ServiceRecord, Reminder,
} from '@/db';

const { colors, radius, typography, gradient } = theme;

// ─── Утилиты ────────────────────────────────────────────────────────────────

/** 'YYYY-MM' текущего месяца */
function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Локализованное название месяца + год: 'Май 2026' */
function formatCurrentMonth(locale: string): string {
  const s = new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Сумма массива чисел */
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

/** Среднее массива чисел (null если массив пустой) */
function avg(arr: number[]): number | null {
  return arr.length > 0 ? sum(arr) / arr.length : null;
}

// ─── Типы ──────────────────────────────────────────────────────────────────

type StatusKind = 'ok' | 'soon' | 'due';

type ReminderRow = {
  reminder: Reminder;
  remaining: number;   // км или дней; < 0 означает просрочку
  unit: 'km' | 'days';
  status: StatusKind;
};

// ─── Расчёт статуса напоминания (ТЗ 6.3) ────────────────────────────────────

function calcReminderStatus(r: Reminder, currentOdometer: number, today: Date): ReminderRow {
  if (r.type === 'mileage') {
    const remaining = (r.last_odometer + (r.interval_km ?? 0)) - currentOdometer;
    const status: StatusKind =
      remaining <= 0              ? 'due'  :
      remaining <= r.warn_before  ? 'soon' : 'ok';
    return { reminder: r, remaining, unit: 'km', status };
  }

  // time-based
  const lastDate = new Date(r.last_date + 'T00:00:00');
  const dueDate  = new Date(lastDate.getTime() + (r.interval_days ?? 0) * 86_400_000);
  const remaining = Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
  const status: StatusKind =
    remaining <= 0              ? 'due'  :
    remaining <= r.warn_before  ? 'soon' : 'ok';
  return { reminder: r, remaining, unit: 'days', status };
}

const STATUS_ORDER: Record<StatusKind, number> = { due: 0, soon: 1, ok: 2 };

// ─── Компонент ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';

  // ── Состояние ─────────────────────────────────────────────────────────────
  const [car,         setCar]         = useState<Car | null>(null);
  const [monthlyTotal,setMonthlyTotal]= useState<number>(0);
  const [avgPrice,    setAvgPrice]    = useState<number | null>(null);
  const [avgCons,     setAvgCons]     = useState<number | null>(null);
  const [remRows,     setRemRows]     = useState<ReminderRow[]>([]);
  const [loading,     setLoading]     = useState(true);

  // ── Загрузка данных ───────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);

        const ym = currentYearMonth();
        const [
          carData, fuelMonth, expMonth,
          allSvc, allFuel, reminders,
        ] = await Promise.all([
          carRepo.getCar(),
          fuelRepo.getFuelEntriesByMonth(ym),
          expenseRepo.getExpensesByMonth(ym),
          serviceRepo.getAllServiceRecords(),
          fuelRepo.getAllFuelEntries(),
          reminderRepo.getAllReminders(),
        ]);

        if (!active) return;

        // ── Сумма за месяц (ТЗ 6.4) ─────────────────────────────────────────
        const svcMonth = allSvc.filter((s) => s.date.startsWith(ym));
        const total =
          sum(fuelMonth.map((f) => f.total_cost)) +
          sum(expMonth.map((e) => e.amount)) +
          sum(svcMonth.map((s) => s.cost));

        // ── Средняя цена за литр (текущий месяц) ────────────────────────────
        const prices = fuelMonth
          .filter((f) => f.price_per_liter > 0)
          .map((f) => f.price_per_liter);

        // ── Средний расход (все полные заправки, за все время) ───────────────
        const consumptions = allFuel
          .filter((f): f is FuelEntry & { consumption: number } => f.consumption != null)
          .map((f) => f.consumption);

        // ── Напоминания с вычисленным статусом ──────────────────────────────
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentOdo = carData?.current_odometer ?? 0;

        const rows: ReminderRow[] = reminders
          .map((r) => calcReminderStatus(r, currentOdo, today))
          .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

        setCar(carData);
        setMonthlyTotal(total);
        setAvgPrice(avg(prices));
        setAvgCons(avg(consumptions));
        setRemRows(rows);
        setLoading(false);
      }

      load().catch(console.error);
      return () => { active = false; };
    }, [])
  );

  // ── Производные значения ──────────────────────────────────────────────────

  const sym         = currencySymbol(car?.currency ?? '');
  const monthLabel  = useMemo(() => formatCurrentMonth(locale), [locale]);
  const odometer    = car?.current_odometer.toLocaleString() ?? '—';

  // ── Вспомогательные функции для текста напоминаний ───────────────────────

  function reminderLabel(row: ReminderRow): string {
    const n = Math.abs(row.remaining);
    if (row.unit === 'km') {
      return row.remaining <= 0
        ? t('service.overdueKm',      { n })
        : t('service.remainingKm',    { n });
    }
    return row.remaining <= 0
      ? t('service.overdueDays',  { n })
      : t('service.remainingDays',{ n });
  }

  // ── Цвет строки напоминания ───────────────────────────────────────────────

  const STATUS_COLORS: Record<StatusKind, string> = {
    due:  colors.statusDue.text,
    soon: colors.statusSoon.text,
    ok:   colors.statusOk.text,
  };
  const STATUS_BG: Record<StatusKind, string> = {
    due:  colors.statusDue.background,
    soon: colors.statusSoon.background,
    ok:   colors.statusOk.background,
  };

  // ── Загрузка ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <Text style={s.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  // ── Рендер ───────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 1. Шапка: месяц + пробег + шестерёнка ─────────────────────── */}
      <View style={s.topRow}>
        <View>
          <Text style={s.monthLabel}>{monthLabel}</Text>
          <Text style={s.odoLabel}>
            {t('dashboard.odometer')}: {odometer} {t('common.km')}
          </Text>
        </View>
        {/* Шестерёнка — заглушка до Этапа 9 (Настройки) */}
        <TouchableOpacity
          style={s.gearBtn}
          activeOpacity={0.7}
          onPress={() => {/* TODO Этап 9: router.push('/settings') */}}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── 2. Градиентный блок: расходы за месяц ─────────────────────── */}
      <LinearGradient
        colors={gradient.accent.colors}
        start={gradient.accent.start}
        end={gradient.accent.end}
        style={s.totalBlock}
      >
        <Text style={s.totalLabel}>{t('dashboard.thisMonth')}</Text>
        <Text style={s.totalAmount}>
          {monthlyTotal.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{' '}
          {sym}
        </Text>
      </LinearGradient>

      {/* ── 3. Карточки: средняя цена + средний расход ────────────────── */}
      <View style={s.statsRow}>
        <View style={[s.statCard, { marginRight: 8 }]}>
          <Text style={s.statTitle}>{t('dashboard.avgFuelPrice')}</Text>
          <Text style={s.statValue}>
            {avgPrice != null
              ? `${avgPrice.toFixed(2)} ${sym}`
              : '—'}
          </Text>
          <Text style={s.statSub}>{t('dashboard.perLiter')}</Text>
        </View>

        <View style={s.statCard}>
          <Text style={s.statTitle}>{t('dashboard.avgConsumption')}</Text>
          <Text style={s.statValue}>
            {avgCons != null ? avgCons.toFixed(1) : '—'}
          </Text>
          <Text style={s.statSub}>{t('dashboard.per100km')}</Text>
        </View>
      </View>

      {/* ── 4. Напоминания ─────────────────────────────────────────────── */}
      <Text style={s.sectionHeader}>{t('dashboard.reminders')}</Text>

      {remRows.length === 0 ? (
        <View style={s.card}>
          <Text style={s.noReminders}>{t('dashboard.noReminders')}</Text>
        </View>
      ) : (
        <View style={s.card}>
          {remRows.map((row, idx) => {
            const color = STATUS_COLORS[row.status];
            const bg    = STATUS_BG[row.status];
            return (
              <View
                key={row.reminder.id}
                style={[
                  s.reminderRow,
                  idx < remRows.length - 1 && s.reminderBorder,
                ]}
              >
                {/* Цветная точка-индикатор */}
                <View style={[s.dot, { backgroundColor: bg }]}>
                  <View style={[s.dotInner, { backgroundColor: color }]} />
                </View>

                {/* Название регламента */}
                <Text style={s.reminderTitle} numberOfLines={1}>
                  {row.reminder.title}
                </Text>

                {/* Остаток / просрочка */}
                <Text style={[s.reminderStatus, { color }]}>
                  {reminderLabel(row)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── 5. Кнопки-заглушки (для разработки, Этапы 2–3) ───────────── */}
      <View style={s.devSection}>
        <TouchableOpacity
          style={s.devBtn}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/add-fuel' as any)}
          activeOpacity={0.8}
        >
          <Text style={s.devBtnText}>⛽ {t('addFuel.title')} →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.devBtn}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/add-expense' as any)}
          activeOpacity={0.8}
        >
          <Text style={s.devBtnText}>💳 {t('addExpense.title')} →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.devBtn}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/history' as any)}
          activeOpacity={0.8}
        >
          <Text style={s.devBtnText}>📋 {t('history.title')} →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.devBtn}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/db-check' as any)}
          activeOpacity={0.8}
        >
          <Text style={s.devBtnText}>🗄 DB Check →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingTop: Platform.OS === 'ios' ? 56 : 48, paddingBottom: 40 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center',
             backgroundColor: colors.background },

  loadingText: { color: colors.textSecondary, ...typography.cardText },

  // ── Шапка ──────────────────────────────────────────────────────────────
  topRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   20,
  },
  monthLabel: {
    color: colors.textPrimary,
    ...typography.screenTitle,
    marginBottom: 4,
  },
  odoLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  gearBtn: {
    marginTop: 2,
  },

  // ── Градиентный блок суммы ─────────────────────────────────────────────
  totalBlock: {
    borderRadius:    radius.totalBlock,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems:      'center',
    marginBottom:    16,
  },
  totalLabel: {
    color:        'rgba(255,255,255,0.75)',
    ...typography.label,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  totalAmount: {
    color:      '#ffffff',
    fontSize:   typography.totalAmount.fontSize,
    fontWeight: typography.totalAmount.fontWeight,
  },

  // ── Карточки статистики ────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    marginBottom:  16,
  },
  statCard: {
    flex:            1,
    backgroundColor: colors.surface,
    borderRadius:    radius.card,
    padding:         16,
  },
  statTitle: {
    color:        colors.textSecondary,
    ...typography.labelSmall,
    marginBottom: 6,
  },
  statValue: {
    color:        colors.textPrimary,
    fontSize:     typography.cardValue.fontSize,
    fontWeight:   typography.cardValue.fontWeight,
    marginBottom: 4,
  },
  statSub: {
    color: colors.textMuted,
    ...typography.labelSmall,
  },

  // ── Секция напоминаний ─────────────────────────────────────────────────
  sectionHeader: {
    color:            colors.textWeak,
    ...typography.sectionHeader,
    textTransform:    'uppercase',
    marginBottom:     8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius:    radius.card,
    paddingVertical: 4,
    marginBottom:    16,
  },
  noReminders: {
    color:   colors.statusOk.text,
    ...typography.cardText,
    padding: 12,
  },
  reminderRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  reminderBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dot: {
    width:        28,
    height:       28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems:     'center',
    marginRight:    12,
  },
  dotInner: {
    width:        10,
    height:       10,
    borderRadius: 5,
  },
  reminderTitle: {
    flex:  1,
    color: colors.textPrimary,
    ...typography.cardText,
  },
  reminderStatus: {
    ...typography.label,
    textAlign: 'right',
    flexShrink: 0,
  },

  // ── Кнопки-заглушки (dev) ─────────────────────────────────────────────
  devSection: {
    gap: 8,
  },
  devBtn: {
    backgroundColor: colors.surface,
    borderRadius:    radius.card,
    borderWidth:     1,
    borderColor:     colors.border,
    paddingVertical: 13,
    alignItems:      'center',
  },
  devBtnText: {
    color: colors.textSecondary,
    ...typography.label,
  },
});
