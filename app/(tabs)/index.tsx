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
  carRepo, fuelRepo, expenseRepo, serviceRepo, reminderRepo, categoryRepo,
  Car, FuelEntry, Expense, ServiceRecord, Reminder, Category,
} from '@/db';
import MarkDoneSheet from '@/components/MarkDoneSheet';
import RecordDetailModal from '@/components/RecordDetailModal';

// ─── Утилиты ────────────────────────────────────────────────────────────────

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Полная текущая дата: «20 июля 2026» (RU, месяц в род. падеже) / «July 20, 2026» (EN).
// ru-RU добавляет суффикс « г.» — убираем его для чистого вида.
function formatCurrentDate(locale: string): string {
  const s = new Date().toLocaleDateString(locale, {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  return s.replace(/\s*г\.\s*$/, '');
}

// Короткая дата строки транзакции: «20.07.26».
function fmtShortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y.slice(2)}`;
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

// Строка блока «Последние транзакции» (заправка / расход / сервис).
type RecentItem =
  | { kind: 'fuel';    data: FuelEntry }
  | { kind: 'expense'; data: Expense; category?: Category }
  | { kind: 'service'; data: ServiceRecord };

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
  const [recent,       setRecent]       = useState<RecentItem[]>([]);
  const [loading,      setLoading]      = useState(true);

  // Bottom-sheet «Отметить выполнение»
  const [doneTarget,   setDoneTarget]   = useState<Reminder | null>(null);
  // Модалка деталей транзакции (тап по строке «Последние транзакции»)
  const [detail,       setDetail]       = useState<RecentItem | null>(null);

  // ── Загрузка ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const ym = currentYearMonth();
    const [carData, fuelMonth, expMonth, allSvc, allFuel, reminders, allExp, cats] =
      await Promise.all([
        carRepo.getCar(),
        fuelRepo.getFuelEntriesByMonth(ym),
        expenseRepo.getExpensesByMonth(ym),
        serviceRepo.getAllServiceRecords(),
        fuelRepo.getAllFuelEntries(),
        reminderRepo.getAllReminders(),
        expenseRepo.getAllExpenses(),
        categoryRepo.getAllCategories(),
      ]);

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

    // 5 последних транзакций (заправки + расходы + сервис), по дате убыв.
    const catMap = new Map(cats.map((c) => [c.id, c]));
    const merged: RecentItem[] = [
      ...allFuel.map((f): RecentItem => ({ kind: 'fuel', data: f })),
      ...allExp.map((e): RecentItem  => ({ kind: 'expense', data: e, category: catMap.get(e.category_id) })),
      ...allSvc.map((sv): RecentItem => ({ kind: 'service', data: sv })),
    ];
    merged.sort((a, b) => {
      if (a.data.date !== b.data.date) return a.data.date < b.data.date ? 1 : -1;
      return b.data.id - a.data.id;
    });

    setCar(carData);
    setMonthlyTotal(total);
    setAvgPrice(avg(prices));
    setAvgCons(avg(consumptions));
    setRemRows(rows);
    setRecent(merged.slice(0, 5));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      loadData()
        .catch(console.error)
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [loadData])
  );

  // ── Производные ──────────────────────────────────────────────────────────

  const currCode   = car?.currency ?? '';
  const dateLabel  = useMemo(() => formatCurrentDate(locale), [locale]);
  const odometer   = car?.current_odometer.toLocaleString() ?? '—';

  // ── Отображение строки транзакции ──────────────────────────────────────────
  // Возвращает иконку, цвет акцента и краткое описание для строки.
  function recentDisplay(item: RecentItem): {
    icon:  React.ComponentProps<typeof Ionicons>['name'];
    iconBg: string;
    color: string;
    title: string;
    amount: number;
  } {
    if (item.kind === 'fuel') {
      const f = item.data;
      return {
        icon: 'water', iconBg: colors.iconBgFuel, color: colors.accent,
        title: `${f.liters.toFixed(1)} ${t('addFuel.liters').toLowerCase()}`,
        amount: f.total_cost,
      };
    }
    if (item.kind === 'expense') {
      const e = item.data;
      const cat = item.category;
      const catName = cat ? (cat.key ? t(`categories.${cat.key}` as never) : cat.name) : '—';
      return {
        icon: 'receipt-outline', iconBg: colors.iconBgExpense, color: colors.statusSoon.text,
        title: e.description || catName,
        amount: e.amount,
      };
    }
    const sv = item.data;
    return {
      icon: 'build-outline', iconBg: colors.iconBgService, color: colors.statusOk.text,
      title: sv.note || t('history.maintenance'),
      amount: sv.cost,
    };
  }

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
          <Text style={s.monthLabel}>{dateLabel}</Text>
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
              <TouchableOpacity
                key={row.reminder.id}
                onPress={() => setDoneTarget(row.reminder)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${row.reminder.title} — ${reminderLabel(row)}`}
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
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── 5. Последние транзакции ────────────────────────────────────── */}
      {recent.length > 0 && (
        <>
          <Text style={[s.sectionHeader, s.recentHeader]}>
            {t('dashboard.recentTransactions')}
          </Text>
          <View style={s.recentList}>
            {recent.map((item) => {
              const d = recentDisplay(item);
              return (
                <TouchableOpacity
                  key={`${item.kind}-${item.data.id}`}
                  activeOpacity={0.7}
                  onPress={() => setDetail(item)}
                  style={s.recentItem}
                >
                  <View style={[s.recentIconWrap, { backgroundColor: d.iconBg }]}>
                    <Ionicons name={d.icon} size={18} color={d.color} />
                  </View>
                  <View style={s.recentBody}>
                    <Text style={s.recentTitle} numberOfLines={1}>{d.title}</Text>
                    <Text style={s.recentSub}>{fmtShortDate(item.data.date)}</Text>
                  </View>
                  <Text style={[s.recentAmount, { color: d.color }]}>
                    {formatMoney(d.amount, currCode)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

        {/* Нижний отступ (таб-бар) */}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Bottom-Sheet «Отметить выполнение» — открывается тапом по карточке */}
      <MarkDoneSheet
        reminder={doneTarget}
        car={car}
        onClose={() => setDoneTarget(null)}
        onSaved={() => { loadData().catch(console.error); }}
      />

      {/* Модалка деталей транзакции — тап по строке «Последние транзакции» */}
      <RecordDetailModal
        record={detail}
        currCode={currCode}
        onClose={() => setDetail(null)}
      />
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

    // ── Секция «Последние транзакции» ──────────────────────────────────────
    recentHeader: { marginTop: 24 },
    recentList: { gap: 8 },
    recentItem: {
      flexDirection:     'row',
      alignItems:        'center',
      backgroundColor:   colors.surface,
      borderRadius:      radius.card,
      borderWidth:       1,
      borderColor:       colors.border,
      paddingVertical:   12,
      paddingHorizontal: 14,
    },
    recentIconWrap: {
      width:          36,
      height:         36,
      borderRadius:   10,
      justifyContent: 'center',
      alignItems:     'center',
      marginRight:    12,
      flexShrink:     0,
    },
    recentBody:  { flex: 1, marginRight: 8 },
    recentTitle: { color: colors.textPrimary, ...typography.cardTextMedium, marginBottom: 2 },
    recentSub:   { color: colors.textSecondary, ...typography.labelSmall },
    recentAmount: { ...typography.cardTextMedium, textAlign: 'right', minWidth: 72 },
  });
}
