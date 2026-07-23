/**
 * Экран статистики — Этап 8.
 * Раздел ТЗ: 4.5. Дизайн: docs/дизайн_система.md.
 *
 * Сверху вниз:
 *  1. Переключатель-таблетки: Топливо / Расходы / Расход (л/100)
 *  2. Сумма выбранного месяца (над графиком)
 *  3. Столбчатый график последних 6 месяцев; тап по столбику выделяет месяц
 *     (акцентный градиент), остальные приглушены. По умолчанию — последний месяц.
 *  4. Разбивка по категориям (только вкладка «Расходы»)
 *
 * Никаких внешних chart-библиотек — только View + StyleSheet.
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
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { formatMoney } from '@/constants/currencies';
import { resolveIcon } from '@/utils/icons';
import DonutByMonth from '@/components/DonutByMonth';
import DashStatModal, { StatRow, StatItem } from '@/components/DashStatModal';
import SettingsGearBtn from '@/components/SettingsGearBtn';
import {
  carRepo, fuelRepo, expenseRepo, categoryRepo,
  Car, FuelEntry, Expense, Category,
} from '@/db';

// ─── Константы ───────────────────────────────────────────────────────────────

const MONTHS_COUNT = 6;
/** Высота области столбиков; верхние 22 px резервируются под подписи значений */
const CHART_H      = 160;
const BAR_MAX_H    = CHART_H - 22;
/** Прозрачность приглушённых (невыбранных) столбиков — цвет берётся из темы */
const BAR_DIM_OPACITY = 0.2;

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

/** Полное название месяца + год: «Июль 2026» (ru убирает суффикс « г.»). */
function monthFull(ym: string, locale: string): string {
  const [y, m] = ym.split('-').map(Number);
  const raw = new Date(y, m - 1, 1)
    .toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    .replace(/\s*г\.\s*$/, '');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Русские месяцы в дательном падеже — для строки тренда «к марту».
const RU_MONTHS_DATIVE = [
  'январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню',
  'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю',
];

/** Название предыдущего месяца для тренда: ru — дательный, en — короткое. */
function prevMonthName(ym: string, locale: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (locale.startsWith('ru')) return RU_MONTHS_DATIVE[m - 1];
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
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

// Максимальный пробег среди заправок каждого месяца (для «км за месяц»).
// Месяцы без заправок с пробегом в результат не попадают.
function aggMaxOdo(fuel: FuelEntry[], months: string[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const f of fuel) {
    const ym = f.date.slice(0, 7);
    if (!months.includes(ym) || f.odometer <= 0) continue;
    if (r[ym] === undefined || f.odometer > r[ym]) r[ym] = f.odometer;
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

// Метрики расхода за период (вкладка «Расход л/100»). л/100 — только полные баки (ТЗ 6.2).
type ConsStats = { avg: number; distance: number; min: number; max: number };

function buildConsStats(fuel: FuelEntry[], months: string[]): ConsStats {
  const periodFuel = fuel.filter(f => months.includes(f.date.slice(0, 7)));
  const cons = periodFuel
    .filter(f => f.is_full_tank === 1 && f.consumption != null)
    .map(f => f.consumption as number);

  const odos = periodFuel.map(f => f.odometer).filter(o => o > 0);
  const distance = odos.length >= 2 ? Math.max(...odos) - Math.min(...odos) : 0;

  if (cons.length === 0) return { avg: 0, distance, min: 0, max: 0 };
  return {
    avg:      cons.reduce((s, v) => s + v, 0) / cons.length,
    distance,
    min:      Math.min(...cons),
    max:      Math.max(...cons),
  };
}

type CatStat = { cat: Category; total: number };

type MetricModalData = {
  title:      string;
  icon:       React.ComponentProps<typeof Ionicons>['name'];
  rows:       StatRow[];
  listTitle?: string;
  items?:     StatItem[];
};

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
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(th, insets.top), [th, insets.top]);

  // ── Состояние ──────────────────────────────────────────────────────────────
  const [activeTab,  setActiveTab]  = useState<TabKey>('fuel');
  // Выбранный столбик графика; по умолчанию — последний (текущий) месяц.
  const [selectedYM, setSelectedYM] = useState<string>(CURR_YM);
  const [car,       setCar]       = useState<Car | null>(null);
  const [fuelMap,   setFuelMap]   = useState<Record<string, number>>({});
  const [expMap,    setExpMap]    = useState<Record<string, number>>({});
  const [consMap,   setConsMap]   = useState<Record<string, number>>({});
  const [maxOdoMap, setMaxOdoMap] = useState<Record<string, number>>({});
  const [consStats, setConsStats] = useState<ConsStats | null>(null);
  const [catStats,  setCatStats]  = useState<CatStat[]>([]);
  const [allFuel,      setAllFuel]      = useState<FuelEntry[]>([]);
  const [allExpenses,  setAllExpenses]  = useState<Expense[]>([]);
  const [loading,      setLoading]      = useState(true);

  // Выбранный сектор donut («Доля трат по месяцам»)
  const [selectedDonutKey, setSelectedDonutKey] = useState<string | null>(null);

  // Выбранная категория (модалка деталей)
  const [selCat,       setSelCat]       = useState<CatStat | null>(null);
  const [showCatModal, setShowCatModal] = useState(false);

  // Модалка деталей метрики
  const [metricModal, setMetricModal] = useState<MetricModalData | null>(null);

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
        setMaxOdoMap(aggMaxOdo(fuel, MONTHS));
        setConsStats(buildConsStats(fuel, MONTHS));
        setCatStats(buildCatStats(expenses, cats, MONTHS));
        setAllFuel(fuel);
        setAllExpenses(expenses);
        setLoading(false);
      })().catch(console.error);
      return () => { active = false; };
    }, [MONTHS]),
  );

  // ── Записи выбранного месяца в donut (только «Топливо») ─────────────────────
  const donutMonthRecords = useMemo(() => {
    if (!selectedDonutKey) return [];
    return allFuel
      .filter(f => f.date.startsWith(selectedDonutKey))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedDonutKey, allFuel]);

  // ── Записи выбранной категории для модалки ──────────────────────────────────
  const catModalRecords = useMemo<Expense[]>(() => {
    if (!selCat) return [];
    return allExpenses
      .filter(e => e.category_id === selCat.cat.id && MONTHS.includes(e.date.slice(0, 7)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selCat, allExpenses, MONTHS]);

  // ── Метрики расходов за период ───────────────────────────────────────────────
  const expMetrics = useMemo(() => {
    const vals = MONTHS.map(m => expMap[m] ?? 0).filter(v => v > 0);
    if (vals.length === 0) return null;
    const total = vals.reduce((s, v) => s + v, 0);
    return { total, avg: total / vals.length, min: Math.min(...vals), max: Math.max(...vals) };
  }, [expMap, MONTHS]);

  // ── Открыть модалку деталей метрики ─────────────────────────────────────────
  function openMetricModal(key: 'cons-avg' | 'cons-distance' | 'cons-min' | 'cons-max' | 'exp-avg' | 'exp-total' | 'exp-min' | 'exp-max') {
    const consFills = allFuel
      .filter(f => MONTHS.includes(f.date.slice(0, 7)) && f.is_full_tank === 1 && f.consumption != null)
      .sort((a, b) => b.date.localeCompare(a.date));
    const monthData = MONTHS
      .map(m => ({ ym: m, total: expMap[m] ?? 0 }))
      .filter(m => m.total > 0);

    switch (key) {
      case 'cons-avg': {
        if (!consStats || consFills.length === 0) return;
        setMetricModal({
          title: t('stats.metricAvg'),
          icon:  'speedometer-outline',
          rows: [
            { label: t('stats.metricModalFillsCount'), value: String(consFills.length) },
            { label: t('stats.metricAvg'), value: `${consStats.avg.toFixed(1)} ${t('stats.lPer100')}` },
          ],
          listTitle: t('stats.metricModalFillsTitle'),
          items: consFills.map(f => ({
            left:  f.date,
            right: `${f.consumption!.toFixed(1)} ${t('stats.lPer100')}`,
          })),
        });
        break;
      }
      case 'cons-distance': {
        if (!consStats) return;
        setMetricModal({
          title: t('stats.metricDistance'),
          icon:  'navigate-outline',
          rows: [{
            label: t('stats.metricDistance'),
            value: consStats.distance > 0
              ? `${consStats.distance.toLocaleString()} ${t('common.km')}`
              : '—',
          }],
        });
        break;
      }
      case 'cons-min': {
        if (!consStats || consFills.length === 0) return;
        const minFill = consFills.reduce((m, f) => (f.consumption! < m.consumption! ? f : m));
        setMetricModal({
          title: t('stats.metricMin'),
          icon:  'trending-down-outline',
          rows: [{
            label:      t('stats.metricMin'),
            value:      `${consStats.min.toFixed(1)} ${t('stats.lPer100')}`,
            valueColor: colors.statusOk.text,
          }],
          listTitle: t('stats.metricModalFillsTitle'),
          items: [{
            left:  minFill.date,
            right: `${minFill.liters.toFixed(2)} ${t('common.liters')}`,
            badge: `${minFill.odometer} ${t('common.km')}`,
          }],
        });
        break;
      }
      case 'cons-max': {
        if (!consStats || consFills.length === 0) return;
        const maxFill = consFills.reduce((m, f) => (f.consumption! > m.consumption! ? f : m));
        setMetricModal({
          title: t('stats.metricMax'),
          icon:  'trending-up-outline',
          rows: [{
            label:      t('stats.metricMax'),
            value:      `${consStats.max.toFixed(1)} ${t('stats.lPer100')}`,
            valueColor: colors.statusDue.text,
          }],
          listTitle: t('stats.metricModalFillsTitle'),
          items: [{
            left:  maxFill.date,
            right: `${maxFill.liters.toFixed(2)} ${t('common.liters')}`,
            badge: `${maxFill.odometer} ${t('common.km')}`,
          }],
        });
        break;
      }
      case 'exp-avg': {
        if (!expMetrics || monthData.length === 0) return;
        setMetricModal({
          title: t('stats.expMetricAvg'),
          icon:  'wallet-outline',
          rows: [
            { label: t('stats.metricModalMonthsCount'), value: String(monthData.length) },
            { label: t('stats.expMetricAvg'), value: formatMoney(expMetrics.avg, currCode) },
          ],
          listTitle: t('stats.metricModalMonthsTitle'),
          items: monthData.map(m => ({
            left:  monthFull(m.ym, locale),
            right: formatMoney(m.total, currCode),
          })),
        });
        break;
      }
      case 'exp-total': {
        if (!expMetrics || monthData.length === 0) return;
        setMetricModal({
          title: t('stats.expMetricTotal'),
          icon:  'calculator-outline',
          rows: [
            { label: t('stats.metricModalMonthsCount'), value: String(monthData.length) },
            { label: t('stats.expMetricTotal'), value: formatMoney(expMetrics.total, currCode) },
          ],
          listTitle: t('stats.metricModalMonthsTitle'),
          items: monthData.map(m => ({
            left:  monthFull(m.ym, locale),
            right: formatMoney(m.total, currCode),
          })),
        });
        break;
      }
      case 'exp-min': {
        if (!expMetrics || monthData.length === 0) return;
        const minM = monthData.reduce((m, d) => (d.total < m.total ? d : m));
        setMetricModal({
          title: t('stats.expMetricMin'),
          icon:  'trending-down-outline',
          rows: [{
            label:      t('stats.expMetricMin'),
            value:      formatMoney(expMetrics.min, currCode),
            valueColor: colors.statusOk.text,
          }],
          listTitle: t('stats.metricModalMonthsTitle'),
          items: [{ left: monthFull(minM.ym, locale), right: formatMoney(minM.total, currCode) }],
        });
        break;
      }
      case 'exp-max': {
        if (!expMetrics || monthData.length === 0) return;
        const maxM = monthData.reduce((m, d) => (d.total > m.total ? d : m));
        setMetricModal({
          title: t('stats.expMetricMax'),
          icon:  'trending-up-outline',
          rows: [{
            label:      t('stats.expMetricMax'),
            value:      formatMoney(expMetrics.max, currCode),
            valueColor: colors.statusDue.text,
          }],
          listTitle: t('stats.metricModalMonthsTitle'),
          items: [{ left: monthFull(maxM.ym, locale), right: formatMoney(maxM.total, currCode) }],
        });
        break;
      }
    }
  }

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

  // Значение выбранного месяца (для показа над графиком).
  const selectedValue = useMemo(
    () => chartData.find(d => d.ym === selectedYM)?.value ?? 0,
    [chartData, selectedYM],
  );

  const currCode = car?.currency ?? '';
  const hasData = chartData.some(d => d.value > 0);

  // Текст суммы/расхода за выбранный месяц.
  function selectedText(): string {
    if (activeTab === 'consumption') {
      return selectedValue > 0 ? `${selectedValue.toFixed(1)} ${t('stats.lPer100')}` : '—';
    }
    return formatMoney(selectedValue, currCode);
  }

  // ── Тренд к предыдущему месяцу набора ───────────────────────────────────────
  // Меньше (трат / расхода) = хорошо (success), больше = плохо (danger) —
  // правило едино для всех трёх вкладок. У первого месяца тренд прячем.
  const selIdx    = MONTHS.indexOf(selectedYM);
  const prevYM    = selIdx > 0 ? MONTHS[selIdx - 1] : '';
  const prevValue = selIdx > 0 ? (chartData[selIdx - 1]?.value ?? 0) : 0;
  const showTrend = selIdx > 0 && prevValue > 0 && selectedValue > 0 && selectedValue !== prevValue;
  const trendDown = selectedValue < prevValue;
  const trendPct  = showTrend ? Math.round((Math.abs(selectedValue - prevValue) / prevValue) * 100) : 0;
  const trendClr  = trendDown ? colors.statusOk : colors.statusDue;

  // ── Пробег за выбранный месяц (только «Топливо») ────────────────────────────
  // км = maxOdo(этот месяц) − maxOdo(предыдущий месяц набора). Прячем, если:
  // первый месяц набора; нет заправок с пробегом в этом/предыдущем месяце;
  // либо разница ≤ 0 (данные без роста пробега).
  const monthKm = ((): number | null => {
    if (activeTab !== 'fuel' || selIdx <= 0) return null;
    const cur  = maxOdoMap[selectedYM];
    const prev = maxOdoMap[MONTHS[selIdx - 1]];
    if (cur === undefined || prev === undefined) return null;
    const diff = cur - prev;
    return diff > 0 ? diff : null;
  })();

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
    <View style={s.safeWrap}>
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Заголовок ─────────────────────────────────────────────────────── */}
      <View style={s.titleRow}>
        <Text style={s.screenTitle}>{t('stats.title')}</Text>
        <SettingsGearBtn />
      </View>

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
              onPress={() => { setActiveTab(tab); setSelectedDonutKey(null); }}
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

      {/* ── Сумма выбранного месяца + тренд к предыдущему ───────────────────── */}
      <View style={s.summaryRow}>
        <Text style={s.summaryLabel}>{monthFull(selectedYM, locale)}</Text>
        <View style={s.summaryRight}>
          <Text style={s.summaryValue}>{selectedText()}</Text>
          {showTrend && (
            <View style={[s.trendBadge, { backgroundColor: trendClr.background }]}>
              <Ionicons
                name={trendDown ? 'arrow-down' : 'arrow-up'}
                size={12}
                color={trendClr.text}
              />
              <Text style={[s.trendText, { color: trendClr.text }]}>
                {t('stats.trendVs', { pct: trendPct, month: prevMonthName(prevYM, locale) })}
              </Text>
            </View>
          )}
          {monthKm !== null && (
            <Text style={s.monthKm}>
              {t('stats.kmPerMonth', { km: monthKm.toLocaleString() })}
            </Text>
          )}
        </View>
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
                const isSelected = ym === selectedYM;
                // Выбранный пустой месяц показываем маленьким «нубом», чтобы
                // подсветка была видна; невыбранный пустой месяц — без бара.
                const barH = value > 0
                  ? Math.max(Math.round((value / maxVal) * BAR_MAX_H), 4)
                  : (isSelected ? 4 : 0);

                return (
                  <TouchableOpacity
                    key={ym}
                    style={s.barWrapper}
                    activeOpacity={0.8}
                    onPress={() => setSelectedYM(ym)}
                    accessibilityRole="button"
                    accessibilityLabel={`${monthFull(ym, locale)}`}
                  >
                    {/* Подпись значения над столбиком */}
                    {value > 0 && (
                      <Text
                        style={[
                          s.barValueLabel,
                          {
                            bottom:  barH + 2,
                            color:   isSelected ? colors.accent : colors.textWeak,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {fmtShort(value)}
                      </Text>
                    )}
                    {/* Столбик: выбранный — акцентный градиент, остальные приглушены */}
                    {isSelected ? (
                      <LinearGradient
                        colors={gradient.accent.colors}
                        start={gradient.accent.start}
                        end={gradient.accent.end}
                        style={[s.bar, { height: barH }]}
                      />
                    ) : (
                      <View style={[s.bar, s.barDimmed, { height: barH }]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Подписи месяцев */}
            <View style={s.labelsRow}>
              {chartData.map(({ ym }) => (
                <TouchableOpacity
                  key={ym}
                  style={s.labelCell}
                  activeOpacity={0.8}
                  onPress={() => setSelectedYM(ym)}
                >
                  <Text
                    style={[
                      s.monthLabel,
                      ym === selectedYM && { color: colors.accent },
                    ]}
                    numberOfLines={1}
                  >
                    {monthAbbr(ym, locale)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      {/* ── Доля трат по месяцам — donut (только «Топливо») ─────────────────── */}
      {activeTab === 'fuel' && hasData && (
        <DonutByMonth
          data={MONTHS.map(ym => ({
            key:   ym,
            label: monthAbbr(ym, locale),
            value: fuelMap[ym] ?? 0,
          }))}
          selectedKey={selectedDonutKey}
          onSelectKey={setSelectedDonutKey}
        />
      )}

      {/* ── Записи выбранного месяца (donut drill-down) ─────────────────────── */}
      {activeTab === 'fuel' && selectedDonutKey && (
        <>
          <Text style={s.sectionHeader}>
            {t('stats.donutMonthTitle', { month: monthFull(selectedDonutKey, locale) })}
          </Text>
          {donutMonthRecords.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.noDataText}>{t('stats.noData')}</Text>
            </View>
          ) : (
            <View style={s.catCard}>
              {donutMonthRecords.map((f, idx) => (
                <View
                  key={f.id}
                  style={[s.catRow, idx < donutMonthRecords.length - 1 && s.catBorder]}
                >
                  <View style={s.catIconWrap}>
                    <Ionicons name="water-outline" size={15} color={colors.textSecondary} />
                  </View>
                  <View style={s.catBody}>
                    <View style={s.catTopRow}>
                      <Text style={s.catName} numberOfLines={1}>
                        {f.date}
                        {f.is_full_tank === 1 ? `  ·  ${t('addFuel.fullTank').toLowerCase()}` : ''}
                      </Text>
                      <Text style={s.catAmount}>{formatMoney(f.total_cost, currCode)}</Text>
                    </View>
                    <Text style={s.donutSubText}>
                      {f.liters.toFixed(2)} {t('common.liters')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* ── Метрики расхода 2×2 (только «Расход л/100») ─────────────────────── */}
      {activeTab === 'consumption' && consStats && (
        <View style={s.metricsGrid}>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('cons-avg')}>
            <Text style={s.metricLabel}>{t('stats.metricAvg')}</Text>
            <Text style={s.metricValue}>
              {consStats.avg > 0 ? `${consStats.avg.toFixed(1)} ${t('stats.lPer100')}` : '—'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('cons-distance')}>
            <Text style={s.metricLabel}>{t('stats.metricDistance')}</Text>
            <Text style={s.metricValue}>
              {consStats.distance > 0
                ? `${consStats.distance.toLocaleString()} ${t('common.km')}`
                : '—'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('cons-min')}>
            <Text style={s.metricLabel}>{t('stats.metricMin')}</Text>
            <Text style={[s.metricValue, { color: colors.statusOk.text }]}>
              {consStats.min > 0 ? `${consStats.min.toFixed(1)} ${t('stats.lPer100')}` : '—'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('cons-max')}>
            <Text style={s.metricLabel}>{t('stats.metricMax')}</Text>
            <Text style={[s.metricValue, { color: colors.statusDue.text }]}>
              {consStats.max > 0 ? `${consStats.max.toFixed(1)} ${t('stats.lPer100')}` : '—'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Метрики расходов 2×2 (только «Расходы») ────────────────────────── */}
      {activeTab === 'expenses' && expMetrics && (
        <View style={s.metricsGrid}>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('exp-avg')}>
            <Text style={s.metricLabel}>{t('stats.expMetricAvg')}</Text>
            <Text style={s.metricValue}>{formatMoney(expMetrics.avg, currCode)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('exp-total')}>
            <Text style={s.metricLabel}>{t('stats.expMetricTotal')}</Text>
            <Text style={s.metricValue}>{formatMoney(expMetrics.total, currCode)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('exp-min')}>
            <Text style={s.metricLabel}>{t('stats.expMetricMin')}</Text>
            <Text style={[s.metricValue, { color: colors.statusOk.text }]}>
              {formatMoney(expMetrics.min, currCode)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('exp-max')}>
            <Text style={s.metricLabel}>{t('stats.expMetricMax')}</Text>
            <Text style={[s.metricValue, { color: colors.statusDue.text }]}>
              {formatMoney(expMetrics.max, currCode)}
            </Text>
          </TouchableOpacity>
        </View>
      )}

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
                  <TouchableOpacity
                    key={cat.id}
                    style={[s.catRow, idx < catStats.length - 1 && s.catBorder]}
                    activeOpacity={0.7}
                    onPress={() => { setSelCat({ cat, total: catTotal }); setShowCatModal(true); }}
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
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}
    </ScrollView>

    {/* ── Модалка деталей метрики ──────────────────────────────────────────── */}
    {metricModal && (
      <DashStatModal
        visible
        onClose={() => setMetricModal(null)}
        title={metricModal.title}
        icon={metricModal.icon}
        iconBg={colors.surface}
        iconColor={colors.accent}
        rows={metricModal.rows}
        listTitle={metricModal.listTitle}
        items={metricModal.items}
      />
    )}

    {/* ── Модалка деталей категории ─────────────────────────────────────────── */}
    {selCat && (() => {
      const totalPeriod = catStats.reduce((s, cs) => s + cs.total, 0);
      const pct = totalPeriod > 0 ? Math.round((selCat.total / totalPeriod) * 100) : 0;
      const catName = selCat.cat.key
        ? t(`categories.${selCat.cat.key}` as never)
        : selCat.cat.name;
      const rows: StatRow[] = [
        { label: t('stats.catModalTotal'), value: formatMoney(selCat.total, currCode) },
        { label: t('stats.catModalCount'), value: String(catModalRecords.length) },
        { label: t('stats.catModalShare'), value: `${pct}%` },
      ];
      const items: StatItem[] = catModalRecords.map(e => ({
        left:  e.date,
        right: formatMoney(e.amount, currCode),
        badge: e.description?.trim() || undefined,
      }));
      return (
        <DashStatModal
          visible={showCatModal}
          onClose={() => setShowCatModal(false)}
          title={catName}
          icon={ionName(selCat.cat.icon)}
          iconBg={colors.background}
          iconColor={colors.accent}
          rows={rows}
          listTitle={t('stats.catModalRecords')}
          items={items}
        />
      );
    })()}
    </View>
  );
}

// ─── Стили ───────────────────────────────────────────────────────────────────

function makeStyles(th: AppTheme, topInset: number) {
  const { colors, radius, typography } = th;
  return StyleSheet.create({
    // Внешний контейнер: фон под status bar + safe-area paddingTop.
    safeWrap: {
      flex:            1,
      backgroundColor: colors.background,
      paddingTop:      topInset,
    },
    root:    { flex: 1, backgroundColor: colors.background },
    content: {
      padding:       16,
      paddingTop:    16,
      paddingBottom: 48,
    },
    center: {
      flex: 1, justifyContent: 'center', alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: { color: colors.textSecondary, ...typography.cardText },

    // ── Заголовок ──────────────────────────────────────────────────────────────
    titleRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      marginBottom:   20,
    },
    screenTitle: {
      color: colors.textPrimary,
      ...typography.screenTitle,
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

    // ── Сумма + тренд ────────────────────────────────────────────────────────
    summaryRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'flex-start',
      marginBottom:   12,
      paddingHorizontal: 2,
    },
    summaryLabel: {
      color:         colors.textSecondary,
      ...typography.labelSmall,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop:     4,
    },
    summaryRight: { alignItems: 'flex-end' },
    summaryValue: {
      color:      colors.textPrimary,
      fontSize:   typography.cardValue.fontSize,
      fontWeight: typography.cardValue.fontWeight,
    },
    trendBadge: {
      flexDirection:     'row',
      alignItems:        'center',
      gap:               3,
      marginTop:         6,
      paddingHorizontal: 8,
      paddingVertical:   3,
      borderRadius:      radius.badge,
    },
    trendText: { ...typography.labelSmall },
    monthKm:   { color: colors.textMuted, ...typography.labelSmall, marginTop: 4 },

    // ── Метрики расхода 2×2 ───────────────────────────────────────────────────
    metricsGrid: {
      flexDirection: 'row',
      flexWrap:      'wrap',
      gap:           10,
      marginBottom:  20,
    },
    metricCell: {
      // две колонки: (100% - gap) / 2
      width:           '48%',
      flexGrow:        1,
      backgroundColor: colors.surface,
      borderRadius:    radius.card,
      padding:         16,
    },
    metricLabel: {
      color:         colors.textSecondary,
      ...typography.labelSmall,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom:  8,
    },
    metricValue: {
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
    // Приглушённый (невыбранный) столбик: цвет акцента из темы + прозрачность
    barDimmed: {
      backgroundColor: colors.accent,
      opacity:         BAR_DIM_OPACITY,
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

    // ── Строки drill-down donut ────────────────────────────────────────────────
    donutSubText: {
      color:    colors.textWeak,
      fontSize: 11,
      fontWeight: '400' as const,
    },
  });
}
