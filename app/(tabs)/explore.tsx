/**
 * Экран статистики — Этап 8.
 * Раздел ТЗ: 4.5. Дизайн: docs/дизайн_система.md.
 *
 * Сверху вниз:
 *  1. Переключатель-таблетки: Топливо / Расходы / Расход (л/100)
 *  2. Сумма / среднее за 6 месяцев
 *  3. Столбчатый график последних 6 месяцев (текущий — акцентный цвет)
 *  4. Разбивка по категориям (только вкладка «Расходы»)
 *
 * Никаких внешних chart-библиотек — только View + StyleSheet.
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
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { formatMoney } from '@/constants/currencies';
import { resolveIcon } from '@/utils/icons';
import {
  carRepo, fuelRepo, expenseRepo, categoryRepo,
  Car, FuelEntry, Expense, Category,
} from '@/db';

// ─── Константы ───────────────────────────────────────────────────────────────

const MONTHS_COUNT = 6;
/** Высота области столбиков; верхние 22 px резервируются под подписи значений */
const CHART_H      = 160;
const BAR_MAX_H    = CHART_H - 22;
/** Прошлые месяцы: accent @ ~20% — видно, но не конкурирует с текущим */
const BAR_PAST_CLR = 'rgba(61,181,245,0.20)';

type TabKey = 'fuel' | 'expenses' | 'consumption';

function ionName(icon: string): React.ComponentProps<typeof Ionicons>['name'] {
  return resolveIcon(icon) as React.ComponentProps<typeof Ionicons>['name'];
}

// ─── Утилиты: время ──────────────────────────────────────────────────────────

function recentMonths(): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = MONTHS_COUNT - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

function currentYM(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Сокращённое название месяца на нужном локале. */
function monthAbbr(ym: string, locale: string): string {
  const [y, m] = ym.split('-').map(Number);
  const raw = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'short' });
  // убираем точку (рус.) и capitalise
  const clean = raw.replace('.', '');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// ─── Утилиты: форматирование ──────────────────────────────────────────────────

/** Компактное число для подписи над столбиком. */
function fmtShort(v: number): string {
  if (v >= 10_000) return `${Math.round(v / 1000)}K`;
  if (v >= 1_000)  return `${(v / 1000).toFixed(1)}K`;
  if (v >= 100)    return String(Math.round(v));
  return v.toFixed(1);
}

/** Полное число с двумя знаками после запятой. */
function fmtFull(v: number): string {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Агрегация данных ─────────────────────────────────────────────────────────

function aggFuel(entries: FuelEntry[], months: string[]): Record<string, number> {
  const r = Object.fromEntries(months.map(m => [m, 0]));
  for (const e of entries) {
    const ym = e.date.slice(0, 7);
    if (ym in r) r[ym] += e.total_cost;
  }
  return r;
}

function aggExpenses(entries: Expense[], months: string[]): Record<string, number> {
  const r = Object.fromEntries(months.map(m => [m, 0]));
  for (const e of entries) {
    const ym = e.date.slice(0, 7);
    if (ym in r) r[ym] += e.amount;
  }
  return r;
}

function aggConsumption(fuel: FuelEntry[], months: string[]): Record<string, number> {
  const r = Object.fromEntries(months.map(m => [m, 0]));
  for (const ym of months) {
    const full = fuel.filter(
      f => f.date.startsWith(ym) && f.is_full_tank === 1 && f.consumption != null,
    );
    if (full.length > 0) {
      r[ym] = full.reduce((s, f) => s + (f.consumption ?? 0), 0) / full.length;
    }
  }
  return r;
}

type CatStat = { cat: Category; total: number };

function buildCatStats(
  expenses: Expense[],
  categories: Category[],
  months: string[],
): CatStat[] {
  const filtered = expenses.filter(e => months.includes(e.date.slice(0, 7)));
  const totals: Record<number, number> = {};
  for (const e of filtered) {
    totals[e.category_id] = (totals[e.category_id] ?? 0) + e.amount;
  }
  return categories
    .filter(c => (totals[c.id] ?? 0) > 0)
    .map(c => ({ cat: c, total: totals[c.id] }))
    .sort((a, b) => b.total - a.total);
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { t, i18n } = useTranslation();
  const locale   = i18n.language === 'ru' ? 'ru-RU' : 'en-US';
  const MONTHS   = useMemo(recentMonths, []);
  const CURR_YM  = useMemo(currentYM,   []);

  const th = useAppTheme();
  const { colors, radius, typography, gradient } = th;
  const s = useMemo(() => makeStyles(th), [th]);

  // ── Состояние ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('fuel');
  const [car,       setCar]       = useState<Car | null>(null);
  const [fuelMap,   setFuelMap]   = useState<Record<string, number>>({});
  const [expMap,    setExpMap]    = useState<Record<string, number>>({});
  const [consMap,   setConsMap]   = useState<Record<string, number>>({});
  const [catStats,  setCatStats]  = useState<CatStat[]>([]);
  const [loading,   setLoading]   = useState(true);

  // ── Загрузка ───────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const [carData, fuel, expenses, cats] = await Promise.all([
          carRepo.getCar(),
          fuelRepo.getAllFuelEntries(),
          expenseRepo.getAllExpenses(),
          categoryRepo.getAllCategories(),
        ]);
        if (!active) return;
        setCar(carData);
        setFuelMap(aggFuel(fuel, MONTHS));
        setExpMap(aggExpenses(expenses, MONTHS));
        setConsMap(aggConsumption(fuel, MONTHS));
        setCatStats(buildCatStats(expenses, cats, MONTHS));
        setLoading(false);
      })().catch(console.error);
      return () => { active = false; };
    }, [MONTHS]),
  );

  // ── Данные текущей вкладки ─────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const src = activeTab === 'fuel'        ? fuelMap
              : activeTab === 'expenses'    ? expMap
              : consMap;
    return MONTHS.map(ym => ({ ym, value: src[ym] ?? 0 }));
  }, [activeTab, fuelMap, expMap, consMap, MONTHS]);

  const maxVal = useMemo(
    () => Math.max(...chartData.map(d => d.value), 1),
    [chartData],
  );

  const summary: number = useMemo(() => {
    const vals = chartData.map(d => d.value).filter(v => v > 0);
    if (vals.length === 0) return 0;
    return activeTab === 'consumption'
      ? vals.reduce((s, v) => s + v, 0) / vals.length   // среднее
      : vals.reduce((s, v) => s + v, 0);                 // сумма
  }, [chartData, activeTab]);

  const currCode = car?.currency ?? '';
  const hasData = chartData.some(d => d.value > 0);

  function summaryText(): string {
    if (!hasData) return t('stats.noData');
    if (activeTab === 'consumption') return `${summary.toFixed(1)} ${t('stats.lPer100')}`;
    return formatMoney(summary, currCode);
  }

  // ── Загрузка ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.center}>
        <Text style={s.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  // ── Рендер ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Заголовок ─────────────────────────────────────────────────────── */}
      <Text style={s.screenTitle}>{t('stats.title')}</Text>

      {/* ── Переключатель-таблетки ─────────────────────────────────────────── */}
      <View style={s.pillsRow}>
        {(['fuel', 'expenses', 'consumption'] as TabKey[]).map(tab => {
          const active = tab === activeTab;
          const label  = tab === 'fuel'     ? t('stats.tabFuel')
                       : tab === 'expenses' ? t('stats.tabExpenses')
                       : t('stats.tabConsumption');
          return (
            <TouchableOpacity
              key={tab}
              style={s.pillOuter}
              onPress={() => setActiveTab(tab)}
              activeOpacity={active ? 1 : 0.75}
            >
              {active ? (
                <LinearGradient
                  colors={gradient.accent.colors}
                  start={gradient.accent.start}
                  end={gradient.accent.end}
                  style={[s.pill, s.pillActive]}
                >
                  <Text style={[s.pillText, s.pillTextActive]}>{label}</Text>
                </LinearGradient>
              ) : (
                <View style={s.pill}>
                  <Text style={s.pillText}>{label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Сумма / среднее ────────────────────────────────────────────────── */}
      <View style={s.summaryRow}>
        <Text style={s.summaryLabel}>
          {activeTab === 'consumption'
            ? t('stats.avgConsLabel')
            : t('stats.totalLabel')}
        </Text>
        <Text style={s.summaryValue}>{summaryText()}</Text>
      </View>

      {/* ── Столбчатый график ──────────────────────────────────────────────── */}
      <View style={s.chartCard}>
        {!hasData ? (
          <View style={s.noDataBox}>
            <Text style={s.noDataText}>{t('stats.noData')}</Text>
          </View>
        ) : (
          <>
            {/* Область столбиков */}
            <View style={[s.barsArea, { height: CHART_H }]}>
              {chartData.map(({ ym, value }) => {
                const isCurrent = ym === CURR_YM;
                const barH = value > 0
                  ? Math.max(Math.round((value / maxVal) * BAR_MAX_H), 4)
                  : 0;

                return (
                  <View key={ym} style={s.barWrapper}>
                    {/* Подпись значения над столбиком */}
                    {value > 0 && (
                      <Text
                        style={[
                          s.barValueLabel,
                          {
                            bottom:  barH + 2,
                            color:   isCurrent ? colors.accent : colors.textWeak,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {fmtShort(value)}
                      </Text>
                    )}
                    {/* Столбик */}
                    <View
                      style={[
                        s.bar,
                        {
                          height:          barH,
                          backgroundColor: isCurrent ? colors.accent : BAR_PAST_CLR,
                        },
                      ]}
                    />
                  </View>
                );
              })}
            </View>

            {/* Подписи месяцев */}
            <View style={s.labelsRow}>
              {chartData.map(({ ym }) => (
                <View key={ym} style={s.labelCell}>
                  <Text
                    style={[
                      s.monthLabel,
                      ym === CURR_YM && { color: colors.accent },
                    ]}
                    numberOfLines={1}
                  >
                    {monthAbbr(ym, locale)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      {/* ── Разбивка по категориям (только «Расходы») ──────────────────────── */}
      {activeTab === 'expenses' && (
        <>
          <Text style={s.sectionHeader}>{t('stats.categoryBreakdown')}</Text>

          {catStats.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.noDataText}>{t('stats.noData')}</Text>
            </View>
          ) : (
            <View style={s.catCard}>
              {catStats.map(({ cat, total: catTotal }, idx) => {
                const pct  = catStats[0].total > 0 ? catTotal / catStats[0].total : 0;
                const name = cat.key
                  ? t(`categories.${cat.key}` as never)
                  : cat.name;

                return (
                  <View
                    key={cat.id}
                    style={[s.catRow, idx < catStats.length - 1 && s.catBorder]}
                  >
                    {/* Иконка */}
                    <View style={s.catIconWrap}>
                      <Ionicons
                        name={ionName(cat.icon)}
                        size={15}
                        color={colors.textSecondary}
                      />
                    </View>

                    {/* Название + полоска + сумма */}
                    <View style={s.catBody}>
                      <View style={s.catTopRow}>
                        <Text style={s.catName} numberOfLines={1}>{name}</Text>
                        <Text style={s.catAmount}>
                          {formatMoney(catTotal, currCode)}
                        </Text>
                      </View>
                      <View style={s.catTrack}>
                        <View
                          style={[
                            s.catFill,
                            { width: `${Math.round(pct * 100)}%` as `${number}%` },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ─── Стили ───────────────────────────────────────────────────────────────────

function makeStyles(th: AppTheme) {
  const { colors, radius, typography } = th;
  return StyleSheet.create({
    root:    { flex: 1, backgroundColor: colors.background },
    content: {
      padding:       16,
      paddingTop:    Platform.OS === 'ios' ? 56 : 48,
      paddingBottom: 48,
    },
    center: {
      flex: 1, justifyContent: 'center', alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: { color: colors.textSecondary, ...typography.cardText },

    // ── Заголовок ──────────────────────────────────────────────────────────────
    screenTitle: {
      color:        colors.textPrimary,
      ...typography.screenTitle,
      marginBottom: 20,
    },

    // ── Переключатель-таблетки ─────────────────────────────────────────────────
    pillsRow: {
      flexDirection: 'row',
      gap:           6,
      marginBottom:  20,
    },
    pillOuter: { flex: 1 },
    pill: {
      paddingVertical:   9,
      borderRadius:      radius.pill,
      backgroundColor:   colors.surface,
      borderWidth:       1,
      borderColor:       colors.border,
      alignItems:        'center',
      justifyContent:    'center',
    },
    pillActive: {
      borderColor: 'transparent',
    },
    pillText:       { color: colors.textSecondary, fontSize: 12, fontWeight: '400' as const },
    pillTextActive: { color: '#ffffff',            fontSize: 12, fontWeight: '500' as const },

    // ── Сумма ──────────────────────────────────────────────────────────────────
    summaryRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'baseline',
      marginBottom:   12,
      paddingHorizontal: 2,
    },
    summaryLabel: {
      color:         colors.textSecondary,
      ...typography.labelSmall,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    summaryValue: {
      color:      colors.textPrimary,
      fontSize:   typography.cardValue.fontSize,
      fontWeight: typography.cardValue.fontWeight,
    },

    // ── Карточка графика ───────────────────────────────────────────────────────
    chartCard: {
      backgroundColor: colors.surface,
      borderRadius:    radius.card,
      padding:         16,
      marginBottom:    20,
    },
    noDataBox: {
      height:         CHART_H + 24,   // chart + labels height
      justifyContent: 'center',
      alignItems:     'center',
    },
    noDataText: { color: colors.textWeak, ...typography.cardText },

    // Область столбиков: flex-row, bars выровнены к низу
    barsArea: {
      flexDirection: 'row',
      alignItems:    'flex-end',
      gap:           4,
    },
    // Каждый столбик: позиционирует бар и подпись
    barWrapper: {
      flex:           1,
      alignItems:     'center',
      justifyContent: 'flex-end',
      // position: relative по умолчанию в RN — absolute-дочерние позиционируются внутри
    },
    barValueLabel: {
      position:  'absolute',
      fontSize:  9,
      fontWeight: '400' as const,
      textAlign: 'center',
      width:     '200%',   // шире самого бара, чтобы числа не обрезались
    },
    bar: {
      width:        '75%',
      borderRadius: 4,
      minHeight:    0,
    },

    // Подписи месяцев под графиком
    labelsRow: {
      flexDirection: 'row',
      gap:           4,
      marginTop:     8,
    },
    labelCell: {
      flex:       1,
      alignItems: 'center',
    },
    monthLabel: {
      color:    colors.textWeak,
      fontSize: 11,
      fontWeight: '400' as const,
    },

    // ── Секция категорий ───────────────────────────────────────────────────────
    sectionHeader: {
      color:         colors.textWeak,
      ...typography.sectionHeader,
      textTransform: 'uppercase',
      marginBottom:  8,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius:    radius.card,
      padding:         24,
      alignItems:      'center',
      marginBottom:    16,
    },
    catCard: {
      backgroundColor: colors.surface,
      borderRadius:    radius.card,
      paddingVertical: 4,
      marginBottom:    16,
    },
    catRow: {
      flexDirection:     'row',
      alignItems:        'center',
      paddingVertical:   13,
      paddingHorizontal: 14,
    },
    catBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    catIconWrap: {
      width:           30,
      height:          30,
      borderRadius:    8,
      backgroundColor: colors.background,
      justifyContent:  'center',
      alignItems:      'center',
      marginRight:     10,
    },
    catBody: { flex: 1 },
    catTopRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'baseline',
      marginBottom:   7,
    },
    catName: {
      color:       colors.textPrimary,
      ...typography.cardText,
      flex:        1,
      marginRight: 8,
    },
    catAmount: {
      color:      colors.textSecondary,
      ...typography.label,
      flexShrink: 0,
    },
    catTrack: {
      height:          4,
      borderRadius:    2,
      backgroundColor: colors.border,
      overflow:        'hidden',
    },
    catFill: {
      height:          4,
      borderRadius:    2,
      backgroundColor: colors.accent,
    },
  });
}
