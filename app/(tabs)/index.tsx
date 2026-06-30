/**
 * Главный экран — Дашборд (Этап 4, переработан в Этапе 10).
 * Разделы ТЗ: 4.1, 6.3, 6.4.
 * Дизайн: docs/дизайн_система.md.
 *
 * Блоки сверху вниз:
 *  1. Шапка: месяц + пробег + шестерёнка (→ Настройки)
 *  2. Градиентный блок: расходы за текущий месяц (ТЗ 6.4)
 *  3. Две карточки: средняя цена литра + средний расход
 *  4. Секция напоминаний — каждое отдельной карточкой (ТЗ 6.3)
 *
 * Кнопки-заглушки убраны — навигация через Tab Bar и кнопку «+».
 * Все цвета из theme, весь текст через t().
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { formatMoney } from '@/constants/currencies';
import {
  carRepo, fuelRepo, expenseRepo, serviceRepo, reminderRepo,
  Car, FuelEntry, Expense, ServiceRecord, Reminder,
} from '@/db';

// ─── Утилиты ────────────────────────────────────────────────────────────────

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrentMonth(locale: string): string {
  const s = new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
function avg(arr: number[]): number | null {
  return arr.length > 0 ? sum(arr) / arr.length : null;
}

// ─── Типы ──────────────────────────────────────────────────────────────────

type StatusKind = 'ok' | 'soon' | 'due';

type ReminderRow = {
  reminder:  Reminder;
  remaining: number;   // км или дней; < 0 → просрочка
  unit:      'km' | 'days';
  status:    StatusKind;
};

// ─── Расчёт статуса ─────────────────────────────────────────────────────────

function calcStatus(r: Reminder, currentOdometer: number, today: Date): ReminderRow {
  if (r.type === 'mileage') {
    const remaining = (r.last_odometer + (r.interval_km ?? 0)) - currentOdometer;
    const status: StatusKind =
      remaining <= 0             ? 'due'  :
      remaining <= r.warn_before ? 'soon' : 'ok';
    return { reminder: r, remaining, unit: 'km', status };
  }

  const lastDate = new Date(r.last_date + 'T00:00:00');
  const dueDate  = new Date(lastDate.getTime() + (r.interval_days ?? 0) * 86_400_000);
  const remaining = Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
  const status: StatusKind =
    remaining <= 0             ? 'due'  :
    remaining <= r.warn_before ? 'soon' : 'ok';
  return { reminder: r, remaining, unit: 'days', status };
}

const STATUS_ORDER: Record<StatusKind, number> = { due: 0, soon: 1, ok: 2 };

// ─── Иконка напоминания ─────────────────────────────────────────────────────

function reminderIcon(row: ReminderRow): React.ComponentProps<typeof Ionicons>['name'] {
  if (row.status === 'due')  return 'warning-outline';
  if (row.status === 'soon') return 'time-outline';
  return row.reminder.type === 'mileage' ? 'speedometer-outline' : 'calendar-outline';
}

// ─── Компонент ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';

  const th = useAppTheme();
  const { colors, radius, typography, gradient } = th;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(th, insets.top), [th, insets.top]);

  // ── Состояние ─────────────────────────────────────────────────────────────
  const [car,          setCar]          = useState<Car | null>(null);
  const [monthlyTotal, setMonthlyTotal] = useState<number>(0);
  const [avgPrice,     setAvgPrice]     = useState<number | null>(null);
  const [avgCons,      setAvgCons]      = useState<number | null>(null);
  const [remRows,      setRemRows]      = useState<ReminderRow[]>([]);
  const [loading,      setLoading]      = useState(true);

  // ── Загрузка ─────────────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);

        const ym = currentYearMonth();
        const [carData, fuelMonth, expMonth, allSvc, allFuel, reminders] =
          await Promise.all([
            carRepo.getCar(),
            fuelRepo.getFuelEntriesByMonth(ym),
            expenseRepo.getExpensesByMonth(ym),
            serviceRepo.getAllServiceRecords(),
            fuelRepo.getAllFuelEntries(),
            reminderRepo.getAllReminders(),
          ]);

        if (!active) return;

        const svcMonth = allSvc.filter((sv) => sv.date.startsWith(ym));
        const total =
          sum(fuelMonth.map((f) => f.total_cost)) +
          sum(expMonth.map((e) => e.amount)) +
          sum(svcMonth.map((sv) => sv.cost));

        const prices = fuelMonth
          .filter((f) => f.price_per_liter > 0)
          .map((f) => f.price_per_liter);

        const consumptions = allFuel
          .filter((f): f is FuelEntry & { consumption: number } => f.consumption != null)
          .map((f) => f.consumption);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentOdo = carData?.current_odometer ?? 0;

        const rows: ReminderRow[] = reminders
          .map((r) => calcStatus(r, currentOdo, today))
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

  // ── Производные ──────────────────────────────────────────────────────────

  const currCode   = car?.currency ?? '';
  const monthLabel = useMemo(() => formatCurrentMonth(locale), [locale]);
  const odometer   = car?.current_odometer.toLocaleString() ?? '—';

  function reminderLabel(row: ReminderRow): string {
    const n = Math.abs(row.remaining);
    if (row.unit === 'km') {
      return row.remaining <= 0
        ? t('service.overdueKm',  { n })
        : t('service.remainingKm', { n });
    }
    return row.remaining <= 0
      ? t('service.overdueDays',   { n })
      : t('service.remainingDays', { n });
  }

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
    <View style={s.safeWrap}>
      <ScrollView
        style={s.root}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
      {/* ── 1. Шапка ─────────────────────────────────────────────────── */}
      <View style={s.topRow}>
        <View>
          <Text style={s.monthLabel}>{monthLabel}</Text>
          <Text style={s.odoLabel}>
            {t('dashboard.odometer')}: {odometer} {t('common.km')}
          </Text>
        </View>
        <TouchableOpacity
          style={s.gearBtn}
          activeOpacity={0.7}
          onPress={() => router.push('/settings' as never)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── 2. Градиентный блок суммы ─────────────────────────────────── */}
      <LinearGradient
        colors={gradient.accent.colors}
        start={gradient.accent.start}
        end={gradient.accent.end}
        style={s.totalBlock}
      >
        <Text style={s.totalLabel}>{t('dashboard.thisMonth')}</Text>
        <Text style={s.totalAmount}>{formatMoney(monthlyTotal, currCode)}</Text>
      </LinearGradient>

      {/* ── 3. Карточки статистики ─────────────────────────────────────── */}
      <View style={s.statsRow}>
        <View style={[s.statCard, { marginRight: 8 }]}>
          <Text style={s.statTitle}>{t('dashboard.avgFuelPrice')}</Text>
          <Text style={s.statValue}>
            {avgPrice != null ? formatMoney(avgPrice, currCode) : '—'}
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
        <View style={[s.reminderCard, s.reminderCardOk]}>
          <View style={[s.statusDot, { backgroundColor: colors.statusOk.background }]}>
            <View style={[s.statusDotInner, { backgroundColor: colors.statusOk.bar }]} />
          </View>
          <Text style={[s.noReminders, { color: colors.statusOk.text }]}>
            {t('dashboard.noReminders')}
          </Text>
        </View>
      ) : (
        <View style={s.reminderList}>
          {remRows.map((row) => {
            const isDue  = row.status === 'due';
            const isSoon = row.status === 'soon';

            const statusColors = isDue  ? colors.statusDue  :
                                 isSoon ? colors.statusSoon : colors.statusOk;

            const borderColor = isDue
              ? colors.borderAccent          // синяя обводка = «требует внимания»
              : isSoon
              ? colors.statusSoon.background
              : colors.border;

            return (
              <View
                key={row.reminder.id}
                style={[
                  s.reminderCard,
                  {
                    borderColor,
                    // iOS glow для просроченных
                    shadowColor:   isDue ? colors.borderAccent : 'transparent',
                    shadowOffset:  { width: 0, height: 0 },
                    shadowOpacity: isDue ? 0.55 : 0,
                    shadowRadius:  isDue ? 8    : 0,
                    elevation:     isDue ? 6    : 0,
                  },
                ]}
              >
                {/* Левый индикатор статуса */}
                <View
                  style={[
                    s.statusDot,
                    { backgroundColor: statusColors.background },
                  ]}
                >
                  <View
                    style={[s.statusDotInner, { backgroundColor: statusColors.bar }]}
                  />
                </View>

                {/* Центр: название + статус */}
                <View style={s.reminderCenter}>
                  <Text style={s.reminderTitle} numberOfLines={1}>
                    {row.reminder.title}
                  </Text>
                  <Text style={[s.reminderSub, { color: statusColors.text }]}>
                    {reminderLabel(row)}
                  </Text>
                </View>

                {/* Правая иконка типа задачи */}
                <Ionicons
                  name={reminderIcon(row)}
                  size={20}
                  color={statusColors.text}
                />
              </View>
            );
          })}
        </View>
      )}

        {/* Нижний отступ (таб-бар) */}
        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

function makeStyles(th: AppTheme, topInset: number) {
  const { colors, radius, typography } = th;
  return StyleSheet.create({
    // Внешний контейнер: занимает весь экран, фон тянется под status bar.
    // paddingTop через safe-area inset гарантирует, что ScrollView начинается
    // НИЖЕ status bar — и контент при скролле не уезжает под него.
    safeWrap: {
      flex:            1,
      backgroundColor: colors.background,
      paddingTop:      topInset,
    },
    root:    { flex: 1, backgroundColor: colors.background },
    content: {
      padding:       16,
      paddingTop:    16,
      paddingBottom: 24,
    },
    center:  {
      flex:            1,
      justifyContent:  'center',
      alignItems:      'center',
      backgroundColor: colors.background,
    },
    loadingText: { color: colors.textSecondary, ...typography.cardText },

    // ── Шапка ──────────────────────────────────────────────────────────────
    topRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'flex-start',
      marginBottom:   20,
    },
    monthLabel: { color: colors.textPrimary, ...typography.screenTitle, marginBottom: 4 },
    odoLabel:   { color: colors.textSecondary, ...typography.label },
    gearBtn:    { marginTop: 2 },

    // ── Градиентный блок ───────────────────────────────────────────────────
    totalBlock: {
      borderRadius:      radius.totalBlock,
      paddingVertical:   28,
      paddingHorizontal: 24,
      alignItems:        'center',
      marginBottom:      16,
    },
    totalLabel: {
      color:         'rgba(255,255,255,0.75)',
      ...typography.label,
      marginBottom:  8,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    totalAmount: {
      color:      '#ffffff',
      fontSize:   typography.totalAmount.fontSize,
      fontWeight: typography.totalAmount.fontWeight,
    },

    // ── Карточки статистики ────────────────────────────────────────────────
    statsRow: { flexDirection: 'row', marginBottom: 24 },
    statCard: {
      flex:            1,
      backgroundColor: colors.surface,
      borderRadius:    radius.card,
      padding:         16,
    },
    statTitle: { color: colors.textSecondary, ...typography.labelSmall, marginBottom: 6 },
    statValue: {
      color:        colors.textPrimary,
      fontSize:     typography.cardValue.fontSize,
      fontWeight:   typography.cardValue.fontWeight,
      marginBottom: 4,
    },
    statSub: { color: colors.textMuted, ...typography.labelSmall },

    // ── Секция напоминаний ─────────────────────────────────────────────────
    sectionHeader: {
      color:         colors.textWeak,
      ...typography.sectionHeader,
      textTransform: 'uppercase',
      marginBottom:  12,
    },
    reminderList: { gap: 8 },

    // Карточка одного напоминания
    reminderCard: {
      flexDirection:     'row',
      alignItems:        'center',
      backgroundColor:   colors.surface,
      borderRadius:      radius.card,
      borderWidth:       1,
      borderColor:       colors.border,
      paddingVertical:   14,
      paddingHorizontal: 14,
      gap:               12,
    },
    reminderCardOk: {
      // для плейсхолдера «Все в норме»
    },

    // Индикатор статуса (левый кружок)
    statusDot: {
      width:          28,
      height:         28,
      borderRadius:   14,
      justifyContent: 'center',
      alignItems:     'center',
      flexShrink:     0,
    },
    statusDotInner: {
      width:        10,
      height:       10,
      borderRadius: 5,
    },

    // Центральный блок
    reminderCenter: { flex: 1 },
    reminderTitle: {
      color:        colors.textPrimary,
      ...typography.cardTextMedium,
      marginBottom: 3,
    },
    reminderSub: {
      ...typography.labelSmall,
    },

    // «Все в норме» текст
    noReminders: {
      flex:       1,
      ...typography.cardText,
    },
  });
}
