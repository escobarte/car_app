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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
/** Ширина одного столбика в режиме «за всё время» (горизонтальный скролл) */
const BAR_COL_W    = 44;
/** Прозрачность приглушённых (невыбранных) столбиков — цвет берётся из темы */
const BAR_DIM_OPACITY = 0.2;

type TabKey = 'fuel' | 'expenses' | 'consumption';

function ionName(icon: string): React.ComponentProps<typeof Ionicons>['name'] {
  return resolveIcon(icon) as React.ComponentProps<typeof Ionicons>['name'];
}

// ─── Утилиты: время ──────────────────────────────────────────────────────────

/** 'YYYY-MM' + delta месяцев (может быть отрицательным) → 'YYYY-MM'. */
function shiftYM(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** count месяцев, заканчивающихся на anchorYM (включительно), по возрастанию. */
function monthsWindow(anchorYM: string, count: number): string[] {
  const result: string[] = [];
  for (let i = count - 1; i >= 0; i--) result.push(shiftYM(anchorYM, -i));
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

/** Полное название месяца + год строчными буквами (ru) — для подписи периода
 *  в середине фразы («за май 2026»): monthFull() даёт заглавную (для шапки),
 *  в середине русского предложения это выглядит чужеродно. */
function monthFullLower(ym: string, locale: string): string {
  const full = monthFull(ym, locale);
  return locale.startsWith('ru') ? full.charAt(0).toLowerCase() + full.slice(1) : full;
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

/**
 * Целые км с разделителем тысяч — для вывода пробега. Округляет (не
 * обрезает) до целого: значения из getMonthlyFuelConsumption() и прочих
 * пропорциональных расчётов (доля сегмента по km) дробные (1284.774 км),
 * а в самих расчётах дробность нужна для точности — округляем только тут,
 * на выводе. toLocaleString() без явного round() у дробного числа печатает
 * дробную часть (до 3 знаков по умолчанию), поэтому round() обязателен.
 */
function fmtKm(v: number): string {
  return Math.round(v).toLocaleString();
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

// Средневзвешенный расход за месяц: сумма литров ÷ сумма км × 100, где литры
// и км — не целого сегмента (как раньше, из-за чего длинный сегмент целиком
// попадал в месяц закрывающей заправки, а месяцы без полной заправки
// оставались пустыми), а ДОЛИ сегментов, пришедшиеся на этот месяц
// (fuelRepo.getMonthlyFuelConsumption — пропорционально пробегу внутри
// сегмента, см. fuelRepo.splitSegmentByMonth). Месяц без km в карте (нет
// закрытого отрезка между полными баками) остаётся 0 → «—» в UI.
function aggConsumption(
  monthly: Map<string, { liters: number; km: number }>,
  months: string[],
): Record<string, number> {
  const r = Object.fromEntries(months.map(m => [m, 0]));
  for (const ym of months) {
    const m = monthly.get(ym);
    if (!m || m.km <= 0) continue;
    r[ym] = parseFloat(((m.liters / m.km) * 100).toFixed(2));
  }
  return r;
}

// Метрики расхода (вкладка «Расход л/100»). л/100 — только полные баки (ТЗ 6.2).
// «За всё время» — как раньше: avg средневзвешенный по сегментам ВСЕХ months
// (окна целиком), distance/min/max — по заправкам этого периода.
// В режиме месяца карточки больше не усредняют окно из 6 столбиков графика —
// каждая показывает данные ровно selectedYM (того месяца, что выбран стрелками
// ‹ › или тапом по столбцу и показан в шапке): avg/distance — доля месяца из
// getMonthlyFuelConsumption (monthlyCons, та же карта, что красит график), min/
// max — по отдельным полным заправкам, ЗАКРЫВШИМСЯ в этом месяце (как и раньше,
// по individual fill-up, просто теперь не по всему окну, а по одному месяцу).
type ConsStats = { avg: number; distance: number; min: number; max: number };

function buildConsStats(
  fuel: FuelEntry[],
  segments: fuelRepo.FuelSegment[],
  months: string[],
  monthlyCons: Map<string, { liters: number; km: number }>,
  selectedYM: string,
  allTime: boolean,
): ConsStats {
  if (allTime) {
    const periodFuel = fuel.filter(f => months.includes(f.date.slice(0, 7)));
    const cons = periodFuel
      .filter(f => f.is_full_tank === 1 && f.consumption != null)
      .map(f => f.consumption as number);

    const odos = periodFuel.map(f => f.odometer).filter(o => o > 0);
    const distance = odos.length >= 2 ? Math.max(...odos) - Math.min(...odos) : 0;

    if (cons.length === 0) return { avg: 0, distance, min: 0, max: 0 };

    const periodSegments = segments.filter(s => months.includes(s.date.slice(0, 7)));
    return {
      avg:      fuelRepo.calcWeightedConsumption(periodSegments) ?? 0,
      distance,
      min:      Math.min(...cons),
      max:      Math.max(...cons),
    };
  }

  const monthData = monthlyCons.get(selectedYM);
  const avg      = monthData && monthData.km > 0
    ? parseFloat(((monthData.liters / monthData.km) * 100).toFixed(2))
    : 0;
  const distance = monthData?.km ?? 0;

  const monthCons = fuel
    .filter(f => f.date.slice(0, 7) === selectedYM && f.is_full_tank === 1 && f.consumption != null)
    .map(f => f.consumption as number);

  // Нет полной заправки, ЗАКРЫВШЕЙСЯ в этом месяце (monthCons пусто) — весь
  // месяц мог быть покрыт отрезком, который начался раньше и закроется позже
  // (например, май: все заправки частичные). Тогда берём расход отрезков,
  // чей диапазон [d1,d2] ПЕРЕСЕКАЕТ месяц, целиком (не долю месяца) — один
  // отрезок → min = max, несколько → минимальный/максимальный из них. Для
  // месяцев с закрывшейся заправкой это не используется — поведение там
  // не меняется (monthCons уже непустой).
  const segCons = monthCons.length > 0
    ? monthCons
    : segments
        .filter(s => s.d1.slice(0, 7) <= selectedYM && selectedYM <= s.d2.slice(0, 7))
        .map(s => s.consumption);

  return {
    avg,
    distance,
    min: segCons.length > 0 ? Math.min(...segCons) : 0,
    max: segCons.length > 0 ? Math.max(...segCons) : 0,
  };
}

// Метрики расходов (вкладка «Затраты»). «За всё время» — как раньше: avg/min/
// max сравнивают МЕСЯЦЫ окна (средний/минимальный/максимальный месяц, total —
// сумма за весь период). В режиме месяца сравнивать месяцы смысла нет (выбран
// один) — avg/min/max теперь по отдельным тратам ВНУТРИ selectedYM (средний
// чек, самая маленькая/большая трата месяца), total — сумма месяца (как и в
// шапке). Подписи карточек меняются вместе со смыслом, см. expMetricAvgMonth и
// соседние ключи i18n.
type ExpStats = { avg: number; total: number; min: number; max: number };

function buildExpStats(
  expenses: Expense[],
  expMap: Record<string, number>,
  months: string[],
  selectedYM: string,
  allTime: boolean,
): ExpStats | null {
  if (allTime) {
    const vals = months.map(m => expMap[m] ?? 0).filter(v => v > 0);
    if (vals.length === 0) return null;
    const total = vals.reduce((s, v) => s + v, 0);
    return { total, avg: total / vals.length, min: Math.min(...vals), max: Math.max(...vals) };
  }

  const amounts = expenses
    .filter(e => e.date.slice(0, 7) === selectedYM)
    .map(e => e.amount);
  if (amounts.length === 0) return null;
  const total = amounts.reduce((s, v) => s + v, 0);
  return {
    total,
    avg: total / amounts.length,
    min: Math.min(...amounts),
    max: Math.max(...amounts),
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
  const CURR_YM  = useMemo(currentYM, []);

  const th = useAppTheme();
  const { colors, radius, typography, gradient } = th;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(th, insets.top), [th, insets.top]);

  // ── Состояние ──────────────────────────────────────────────────────────────
  const [activeTab,  setActiveTab]  = useState<TabKey>('fuel');
  // Выбранный столбик графика; по умолчанию — последний (текущий) месяц.
  const [selectedYM, setSelectedYM] = useState<string>(CURR_YM);
  // Правый край видимого 6-месячного окна графика (вне режима «за всё время»).
  const [windowEnd,  setWindowEnd]  = useState<string>(CURR_YM);
  // Режим «за всё время»: суммы/категории/расход считаются по всем записям.
  const [allTime,    setAllTime]    = useState(false);
  const [car,       setCar]       = useState<Car | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allFuel,      setAllFuel]      = useState<FuelEntry[]>([]);
  const [allSegments,  setAllSegments]  = useState<fuelRepo.FuelSegment[]>([]);
  // Расход по месяцам (доли сегментов, см. fuelRepo.getMonthlyFuelConsumption) —
  // отдельно от allSegments, который используется для среднего «за всё время»/
  // карточки на главной (эти не меняются, считаются по целым сегментам).
  const [monthlyCons,  setMonthlyCons]  = useState<Map<string, { liters: number; km: number }>>(new Map());
  const [allExpenses,  setAllExpenses]  = useState<Expense[]>([]);
  // Все месяцы, где есть хоть одна запись (заправка или расход) — по возрастанию.
  const [monthsWithData, setMonthsWithData] = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);

  // Выбранный сектор donut («Доля трат по месяцам»)
  const [selectedDonutKey, setSelectedDonutKey] = useState<string | null>(null);

  // Выбранная категория (модалка деталей)
  const [selCat,       setSelCat]       = useState<CatStat | null>(null);
  const [showCatModal, setShowCatModal] = useState(false);

  // Модалка деталей метрики
  const [metricModal, setMetricModal] = useState<MetricModalData | null>(null);

  // Самый ранний месяц с данными — граница для стрелки «назад». Нет данных
  // вообще → earliestYM = null, «назад» дальше текущего месяца не пускаем.
  const earliestYM = monthsWithData[0] ?? null;

  // Месяцы, показанные на графике и участвующие в агрегации: либо скользящее
  // окно из 6 месяцев вокруг selectedYM, либо (в allTime) все месяцы с данными.
  const MONTHS = useMemo(() => {
    if (allTime) return monthsWithData.length > 0 ? monthsWithData : [CURR_YM];
    return monthsWindow(windowEnd, MONTHS_COUNT);
  }, [allTime, monthsWithData, windowEnd, CURR_YM]);

  // ── Загрузка (один раз на фокус экрана, не зависит от MONTHS) ───────────────
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const [carData, fuel, expenses, cats, segments, monthly] = await Promise.all([
          carRepo.getCar(),
          fuelRepo.getAllFuelEntries(),
          expenseRepo.getAllExpenses(),
          categoryRepo.getAllCategories(),
          fuelRepo.getFuelSegments(),
          fuelRepo.getMonthlyFuelConsumption(),
        ]);
        if (!active) return;
        setCar(carData);
        setCategories(cats);
        setAllFuel(fuel);
        setAllSegments(segments);
        setMonthlyCons(monthly);
        setAllExpenses(expenses);
        const monthSet = new Set<string>();
        fuel.forEach(f => monthSet.add(f.date.slice(0, 7)));
        expenses.forEach(e => monthSet.add(e.date.slice(0, 7)));
        setMonthsWithData(Array.from(monthSet).sort());
        setLoading(false);
      })().catch(console.error);
      return () => { active = false; };
    }, []),
  );

  // ── Агрегаты (пересчитываются при смене вкладки окна/режима, не при фетче) ──
  const fuelMap   = useMemo(() => aggFuel(allFuel, MONTHS),        [allFuel, MONTHS]);
  const expMap    = useMemo(() => aggExpenses(allExpenses, MONTHS), [allExpenses, MONTHS]);
  const consMap   = useMemo(() => aggConsumption(monthlyCons, MONTHS), [monthlyCons, MONTHS]);
  const maxOdoMap = useMemo(() => aggMaxOdo(allFuel, MONTHS),      [allFuel, MONTHS]);
  const consStats = useMemo(
    () => buildConsStats(allFuel, allSegments, MONTHS, monthlyCons, selectedYM, allTime),
    [allFuel, allSegments, MONTHS, monthlyCons, selectedYM, allTime],
  );
  const catStats  = useMemo(
    () => buildCatStats(allExpenses, categories, MONTHS),
    [allExpenses, categories, MONTHS],
  );

  // ── Навигация по месяцам (стрелки ‹ ›) ──────────────────────────────────────
  const canGoForward = selectedYM < CURR_YM;
  const canGoBack     = selectedYM > (earliestYM ?? CURR_YM);

  function goMonth(delta: 1 | -1) {
    const next = shiftYM(selectedYM, delta);
    if (next > CURR_YM) return;
    if (next < (earliestYM ?? CURR_YM)) return;
    setSelectedYM(next);
    // Окно сдвигаем минимально — только когда выбранный месяц выходит за край.
    const windowStart = shiftYM(windowEnd, -(MONTHS_COUNT - 1));
    if (next > windowEnd) setWindowEnd(next);
    else if (next < windowStart) setWindowEnd(shiftYM(next, MONTHS_COUNT - 1));
  }

  // Горизонтальный скролл графика в режиме «за всё время» — прокручиваем
  // к последнему месяцу при входе в режим или смене набора данных.
  const chartScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (allTime) chartScrollRef.current?.scrollToEnd({ animated: false });
  }, [allTime, MONTHS.length]);

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

  // ── Метрики расходов: за период (allTime) или за выбранный месяц ───────────
  const expMetrics = useMemo(
    () => buildExpStats(allExpenses, expMap, MONTHS, selectedYM, allTime),
    [allExpenses, expMap, MONTHS, selectedYM, allTime],
  );

  // ── Открыть модалку деталей метрики ─────────────────────────────────────────
  // Имя категории для badge в списке трат месяца (ниже) — так же, как в
  // разбивке по категориям и модалке категории (cat.key переведённый, иначе
  // «сырое» cat.name).
  function catDisplayName(categoryId: number): string {
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) return '';
    return cat.key ? t(`categories.${cat.key}` as never) : cat.name;
  }

  function openMetricModal(key: 'cons-avg' | 'cons-distance' | 'cons-min' | 'cons-max' | 'exp-avg' | 'exp-total' | 'exp-min' | 'exp-max') {
    // Полные баки для расхода: в режиме месяца — закрывшиеся в selectedYM
    // (то же определение, что и у consStats.min/max); «за всё время» — как
    // раньше, по всем месяцам MONTHS (там MONTHS = все месяцы с данными).
    const consFills = allFuel
      .filter(f => (allTime ? MONTHS.includes(f.date.slice(0, 7)) : f.date.slice(0, 7) === selectedYM)
        && f.is_full_tank === 1 && f.consumption != null)
      .sort((a, b) => b.date.localeCompare(a.date));
    // Режим месяца, нет заправки, закрывшейся в selectedYM (consFills пуст,
    // см. buildConsStats): минимум/максимум берём из отрезков, пересекающих
    // месяц, целиком — тот же критерий и те же сегменты, что в consStats.
    const crossSegments = (!allTime && consFills.length === 0)
      ? allSegments
          .filter(seg => seg.d1.slice(0, 7) <= selectedYM && selectedYM <= seg.d2.slice(0, 7))
          .sort((a, b) => a.consumption - b.consumption)
      : [];
    // «За всё время»: месяцы периода с тратами (сравниваем месяцы между собой).
    const monthData = MONTHS
      .map(m => ({ ym: m, total: expMap[m] ?? 0 }))
      .filter(m => m.total > 0);
    // Режим месяца: отдельные траты selectedYM (сравниваем траты внутри месяца).
    const monthExpenses = allExpenses
      .filter(e => e.date.slice(0, 7) === selectedYM)
      .sort((a, b) => b.date.localeCompare(a.date));

    const distanceLabel = allTime ? t('stats.metricDistance') : t('stats.metricDistanceMonth');
    const expAvgLabel    = allTime ? t('stats.expMetricAvg')   : t('stats.expMetricAvgMonth');
    const expTotalLabel  = allTime ? t('stats.expMetricTotal') : t('stats.expMetricTotalMonth');
    const expMinLabel    = allTime ? t('stats.expMetricMin')   : t('stats.expMetricMinMonth');
    const expMaxLabel    = allTime ? t('stats.expMetricMax')   : t('stats.expMetricMaxMonth');

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
          title: distanceLabel,
          icon:  'navigate-outline',
          rows: [{
            label: distanceLabel,
            value: consStats.distance > 0
              ? `${fmtKm(consStats.distance)} ${t('common.km')}`
              : '—',
          }],
        });
        break;
      }
      case 'cons-min': {
        if (!consStats || (consFills.length === 0 && crossSegments.length === 0)) return;
        const items = consFills.length > 0
          ? [consFills.reduce((m, f) => (f.consumption! < m.consumption! ? f : m))].map(f => ({
              left:  f.date,
              right: `${f.liters.toFixed(2)} ${t('common.liters')}`,
              badge: `${f.odometer} ${t('common.km')}`,
            }))
          : [crossSegments[0]].map(seg => ({
              left:  seg.date,
              right: `${seg.liters.toFixed(2)} ${t('common.liters')}`,
              badge: `${seg.o2} ${t('common.km')}`,
            }));
        setMetricModal({
          title: t('stats.metricMin'),
          icon:  'trending-down-outline',
          rows: [{
            label:      t('stats.metricMin'),
            value:      `${consStats.min.toFixed(1)} ${t('stats.lPer100')}`,
            valueColor: colors.statusOk.text,
          }],
          listTitle: t('stats.metricModalFillsTitle'),
          items,
        });
        break;
      }
      case 'cons-max': {
        if (!consStats || (consFills.length === 0 && crossSegments.length === 0)) return;
        const items = consFills.length > 0
          ? [consFills.reduce((m, f) => (f.consumption! > m.consumption! ? f : m))].map(f => ({
              left:  f.date,
              right: `${f.liters.toFixed(2)} ${t('common.liters')}`,
              badge: `${f.odometer} ${t('common.km')}`,
            }))
          : [crossSegments[crossSegments.length - 1]].map(seg => ({
              left:  seg.date,
              right: `${seg.liters.toFixed(2)} ${t('common.liters')}`,
              badge: `${seg.o2} ${t('common.km')}`,
            }));
        setMetricModal({
          title: t('stats.metricMax'),
          icon:  'trending-up-outline',
          rows: [{
            label:      t('stats.metricMax'),
            value:      `${consStats.max.toFixed(1)} ${t('stats.lPer100')}`,
            valueColor: colors.statusDue.text,
          }],
          listTitle: t('stats.metricModalFillsTitle'),
          items,
        });
        break;
      }
      case 'exp-avg': {
        if (!expMetrics) return;
        if (allTime) {
          if (monthData.length === 0) return;
          setMetricModal({
            title: expAvgLabel,
            icon:  'wallet-outline',
            rows: [
              { label: t('stats.metricModalMonthsCount'), value: String(monthData.length) },
              { label: expAvgLabel, value: formatMoney(expMetrics.avg, currCode) },
            ],
            listTitle: t('stats.metricModalMonthsTitle'),
            items: monthData.map(m => ({
              left:  monthFull(m.ym, locale),
              right: formatMoney(m.total, currCode),
            })),
          });
        } else {
          if (monthExpenses.length === 0) return;
          setMetricModal({
            title: expAvgLabel,
            icon:  'wallet-outline',
            rows: [
              { label: t('stats.catModalCount'), value: String(monthExpenses.length) },
              { label: expAvgLabel, value: formatMoney(expMetrics.avg, currCode) },
            ],
            listTitle: t('stats.catModalRecords'),
            items: monthExpenses.map(e => ({
              left:  e.date,
              right: formatMoney(e.amount, currCode),
              badge: catDisplayName(e.category_id),
            })),
          });
        }
        break;
      }
      case 'exp-total': {
        if (!expMetrics) return;
        if (allTime) {
          if (monthData.length === 0) return;
          setMetricModal({
            title: expTotalLabel,
            icon:  'calculator-outline',
            rows: [
              { label: t('stats.metricModalMonthsCount'), value: String(monthData.length) },
              { label: expTotalLabel, value: formatMoney(expMetrics.total, currCode) },
            ],
            listTitle: t('stats.metricModalMonthsTitle'),
            items: monthData.map(m => ({
              left:  monthFull(m.ym, locale),
              right: formatMoney(m.total, currCode),
            })),
          });
        } else {
          if (monthExpenses.length === 0) return;
          setMetricModal({
            title: expTotalLabel,
            icon:  'calculator-outline',
            rows: [
              { label: t('stats.catModalCount'), value: String(monthExpenses.length) },
              { label: expTotalLabel, value: formatMoney(expMetrics.total, currCode) },
            ],
            listTitle: t('stats.catModalRecords'),
            items: monthExpenses.map(e => ({
              left:  e.date,
              right: formatMoney(e.amount, currCode),
              badge: catDisplayName(e.category_id),
            })),
          });
        }
        break;
      }
      case 'exp-min': {
        if (!expMetrics) return;
        if (allTime) {
          if (monthData.length === 0) return;
          const minM = monthData.reduce((m, d) => (d.total < m.total ? d : m));
          setMetricModal({
            title: expMinLabel,
            icon:  'trending-down-outline',
            rows: [{ label: expMinLabel, value: formatMoney(expMetrics.min, currCode), valueColor: colors.statusOk.text }],
            listTitle: t('stats.metricModalMonthsTitle'),
            items: [{ left: monthFull(minM.ym, locale), right: formatMoney(minM.total, currCode) }],
          });
        } else {
          if (monthExpenses.length === 0) return;
          const minE = monthExpenses.reduce((m, e) => (e.amount < m.amount ? e : m));
          setMetricModal({
            title: expMinLabel,
            icon:  'trending-down-outline',
            rows: [{ label: expMinLabel, value: formatMoney(expMetrics.min, currCode), valueColor: colors.statusOk.text }],
            listTitle: t('stats.catModalRecords'),
            items: [{ left: minE.date, right: formatMoney(minE.amount, currCode), badge: catDisplayName(minE.category_id) }],
          });
        }
        break;
      }
      case 'exp-max': {
        if (!expMetrics) return;
        if (allTime) {
          if (monthData.length === 0) return;
          const maxM = monthData.reduce((m, d) => (d.total > m.total ? d : m));
          setMetricModal({
            title: expMaxLabel,
            icon:  'trending-up-outline',
            rows: [{ label: expMaxLabel, value: formatMoney(expMetrics.max, currCode), valueColor: colors.statusDue.text }],
            listTitle: t('stats.metricModalMonthsTitle'),
            items: [{ left: monthFull(maxM.ym, locale), right: formatMoney(maxM.total, currCode) }],
          });
        } else {
          if (monthExpenses.length === 0) return;
          const maxE = monthExpenses.reduce((m, e) => (e.amount > m.amount ? e : m));
          setMetricModal({
            title: expMaxLabel,
            icon:  'trending-up-outline',
            rows: [{ label: expMaxLabel, value: formatMoney(expMetrics.max, currCode), valueColor: colors.statusDue.text }],
            listTitle: t('stats.catModalRecords'),
            items: [{ left: maxE.date, right: formatMoney(maxE.amount, currCode), badge: catDisplayName(maxE.category_id) }],
          });
        }
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

  // Сумма/расход за весь период — только для режима «за всё время».
  // Для топлива/расходов это сумма всех месяцев; для расхода л/100 — не сумма
  // помесячных средних (это было бы математически неверно), а consStats.avg,
  // который уже посчитан по MONTHS = все месяцы с данными.
  const periodTotal = useMemo(
    () => chartData.reduce((sum, d) => sum + d.value, 0),
    [chartData],
  );

  // Текст суммы/расхода — за выбранный месяц, либо (allTime) за весь период.
  function selectedText(): string {
    if (activeTab === 'consumption') {
      const v = allTime ? consStats.avg : selectedValue;
      return v > 0 ? `${v.toFixed(1)} ${t('stats.lPer100')}` : '—';
    }
    return formatMoney(allTime ? periodTotal : selectedValue, currCode);
  }

  // ── Тренд к предыдущему месяцу набора ───────────────────────────────────────
  // Меньше (трат / расхода) = хорошо (success), больше = плохо (danger) —
  // правило едино для всех трёх вкладок. У первого месяца и в allTime тренд прячем.
  const selIdx    = MONTHS.indexOf(selectedYM);
  const prevYM    = selIdx > 0 ? MONTHS[selIdx - 1] : '';
  const prevValue = selIdx > 0 ? (chartData[selIdx - 1]?.value ?? 0) : 0;
  const showTrend = !allTime && selIdx > 0 && prevValue > 0 && selectedValue > 0 && selectedValue !== prevValue;
  const trendDown = selectedValue < prevValue;
  const trendPct  = showTrend ? Math.round((Math.abs(selectedValue - prevValue) / prevValue) * 100) : 0;
  const trendClr  = trendDown ? colors.statusOk : colors.statusDue;

  // ── Пробег за выбранный месяц (только «Топливо», не в allTime) ─────────────
  // км = maxOdo(этот месяц) − maxOdo(предыдущий месяц набора). Прячем, если:
  // первый месяц набора; нет заправок с пробегом в этом/предыдущем месяце;
  // либо разница ≤ 0 (данные без роста пробега).
  const monthKm = ((): number | null => {
    if (allTime || activeTab !== 'fuel' || selIdx <= 0) return null;
    const cur  = maxOdoMap[selectedYM];
    const prev = maxOdoMap[MONTHS[selIdx - 1]];
    if (cur === undefined || prev === undefined) return null;
    const diff = cur - prev;
    return diff > 0 ? diff : null;
  })();

  // Подсказка для пустого месяца на вкладке «Расход л/100»: нет закрытого
  // отрезка между полными баками (например, последний отрезок ещё не
  // закрыт следующей полной заправкой) — поэтому расход месяца не посчитан.
  // Не показываем, если сегментов вообще нет (пустая история — там нет
  // смысла уточнять «какого именно» месяца не хватает).
  const showNoSegmentHint = activeTab === 'consumption' && !allTime
    && selectedValue <= 0 && allSegments.length > 0;

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
                  <Text style={[s.pillText, s.pillTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{label}</Text>
                </LinearGradient>
              ) : (
                <View style={s.pill}>
                  <Text style={s.pillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Тумблер «За всё время» ───────────────────────────────────────────── */}
      <TouchableOpacity
        style={s.allTimeRow}
        activeOpacity={0.7}
        onPress={() => setAllTime(v => !v)}
        accessibilityRole="switch"
        accessibilityState={{ checked: allTime }}
        accessibilityLabel={t('stats.allTime')}
      >
        <View style={[s.allTimeBox, allTime && s.allTimeBoxActive]}>
          {allTime && <Ionicons name="checkmark" size={11} color="#ffffff" />}
        </View>
        <Text style={s.allTimeText}>{t('stats.allTime')}</Text>
      </TouchableOpacity>

      {/* ── Сумма выбранного месяца (или всего периода) + тренд ─────────────── */}
      <View style={s.summaryRow}>
        <View style={s.periodNavRow}>
          {!allTime && (
            <TouchableOpacity
              style={[s.periodArrow, !canGoBack && s.periodArrowDisabled]}
              onPress={() => goMonth(-1)}
              disabled={!canGoBack}
              accessibilityRole="button"
              accessibilityLabel={t('stats.prevMonthA11y')}
            >
              <Ionicons name="chevron-back" size={16} color={canGoBack ? colors.textSecondary : colors.textWeak} />
            </TouchableOpacity>
          )}
          <Text style={s.summaryLabel}>
            {allTime ? t('stats.allTime') : monthFull(selectedYM, locale)}
          </Text>
          {!allTime && (
            <TouchableOpacity
              style={[s.periodArrow, !canGoForward && s.periodArrowDisabled]}
              onPress={() => goMonth(1)}
              disabled={!canGoForward}
              accessibilityRole="button"
              accessibilityLabel={t('stats.nextMonthA11y')}
            >
              <Ionicons name="chevron-forward" size={16} color={canGoForward ? colors.textSecondary : colors.textWeak} />
            </TouchableOpacity>
          )}
        </View>
        <View style={s.summaryRight}>
          <Text style={s.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{selectedText()}</Text>
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
              {t('stats.kmPerMonth', { km: fmtKm(monthKm) })}
            </Text>
          )}
          {showNoSegmentHint && (
            <Text style={s.monthKm} numberOfLines={2}>
              {t('stats.noClosedSegmentHint')}
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
          (() => {
            // В allTime месяцев может быть сколько угодно — столбики фиксированной
            // ширины внутри горизонтального скролла. Иначе — ровно 6, flex-колонки.
            const bars = chartData.map(({ ym, value }) => {
              // В «За всё время» тап по столбцу не выбирает месяц (там нет
              // смысла — заголовок и сумма уже показывают весь период), поэтому
              // и подсветку выбранного месяца в этом режиме не показываем.
              const isSelected = !allTime && ym === selectedYM;
              // Выбранный пустой месяц показываем маленьким «нубом», чтобы
              // подсветка была видна; невыбранный пустой месяц — без бара.
              const barH = value > 0
                ? Math.max(Math.round((value / maxVal) * BAR_MAX_H), 4)
                : (isSelected ? 4 : 0);

              return (
                <TouchableOpacity
                  key={ym}
                  style={allTime ? [s.barWrapper, s.barWrapperFixed] : s.barWrapper}
                  activeOpacity={0.8}
                  onPress={() => setSelectedYM(ym)}
                  disabled={allTime}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: allTime }}
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
            });

            const labels = chartData.map(({ ym }) => (
              <TouchableOpacity
                key={ym}
                style={allTime ? [s.labelCell, s.labelCellFixed] : s.labelCell}
                activeOpacity={0.8}
                onPress={() => setSelectedYM(ym)}
                disabled={allTime}
                accessibilityRole="button"
                accessibilityState={{ selected: !allTime && ym === selectedYM, disabled: allTime }}
                accessibilityLabel={`${monthFull(ym, locale)}`}
              >
                <Text
                  style={[
                    s.monthLabel,
                    !allTime && ym === selectedYM && { color: colors.accent },
                  ]}
                  numberOfLines={1}
                >
                  {monthAbbr(ym, locale)}
                </Text>
              </TouchableOpacity>
            ));

            if (!allTime) {
              return (
                <>
                  <View style={[s.barsArea, { height: CHART_H }]}>{bars}</View>
                  <View style={s.labelsRow}>{labels}</View>
                </>
              );
            }

            const contentWidth = chartData.length * BAR_COL_W;
            return (
              <ScrollView
                ref={chartScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <View>
                  <View style={[s.barsArea, { height: CHART_H, width: contentWidth }]}>{bars}</View>
                  <View style={[s.labelsRow, { width: contentWidth }]}>{labels}</View>
                </View>
              </ScrollView>
            );
          })()
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
            <Text style={s.metricValue} numberOfLines={1}>
              {consStats.avg > 0 ? `${consStats.avg.toFixed(1)} ${t('stats.lPer100')}` : '—'}
            </Text>
            {/* Уточняет период этого числа — чтобы не путать со средним «за
                всё время» на главном экране (там считается только по всей
                истории, см. dashboard.per100kmAllTime). */}
            <Text style={s.metricSub} numberOfLines={1}>
              {allTime
                ? t('stats.periodAllTime')
                : t('stats.periodLabel', { month: monthFullLower(selectedYM, locale) })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('cons-distance')}>
            <Text style={s.metricLabel}>{allTime ? t('stats.metricDistance') : t('stats.metricDistanceMonth')}</Text>
            <Text style={s.metricValue} numberOfLines={1}>
              {consStats.distance > 0
                ? `${fmtKm(consStats.distance)} ${t('common.km')}`
                : '—'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('cons-min')}>
            <Text style={s.metricLabel}>{t('stats.metricMin')}</Text>
            <Text style={[s.metricValue, { color: colors.statusOk.text }]} numberOfLines={1}>
              {consStats.min > 0 ? `${consStats.min.toFixed(1)} ${t('stats.lPer100')}` : '—'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('cons-max')}>
            <Text style={s.metricLabel}>{t('stats.metricMax')}</Text>
            <Text style={[s.metricValue, { color: colors.statusDue.text }]} numberOfLines={1}>
              {consStats.max > 0 ? `${consStats.max.toFixed(1)} ${t('stats.lPer100')}` : '—'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Метрики расходов 2×2 (только «Расходы») ────────────────────────── */}
      {activeTab === 'expenses' && expMetrics && (
        <View style={s.metricsGrid}>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('exp-avg')}>
            <Text style={s.metricLabel}>{allTime ? t('stats.expMetricAvg') : t('stats.expMetricAvgMonth')}</Text>
            <Text style={s.metricValue} numberOfLines={1}>{formatMoney(expMetrics.avg, currCode)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('exp-total')}>
            <Text style={s.metricLabel}>{allTime ? t('stats.expMetricTotal') : t('stats.expMetricTotalMonth')}</Text>
            <Text style={s.metricValue} numberOfLines={1}>{formatMoney(expMetrics.total, currCode)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('exp-min')}>
            <Text style={s.metricLabel}>{allTime ? t('stats.expMetricMin') : t('stats.expMetricMinMonth')}</Text>
            <Text style={[s.metricValue, { color: colors.statusOk.text }]} numberOfLines={1}>
              {formatMoney(expMetrics.min, currCode)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.metricCell} activeOpacity={0.7} onPress={() => openMetricModal('exp-max')}>
            <Text style={s.metricLabel}>{allTime ? t('stats.expMetricMax') : t('stats.expMetricMaxMonth')}</Text>
            <Text style={[s.metricValue, { color: colors.statusDue.text }]} numberOfLines={1}>
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

    // ── Тумблер «За всё время» ───────────────────────────────────────────────
    allTimeRow: {
      flexDirection:   'row',
      alignItems:      'center',
      alignSelf:       'flex-end',
      gap:             6,
      paddingVertical: 4,
      marginBottom:    14,
    },
    allTimeBox: {
      width:           16,
      height:          16,
      borderRadius:    4,
      borderWidth:      1,
      borderColor:      colors.border,
      backgroundColor:  colors.surface,
      alignItems:       'center',
      justifyContent:   'center',
    },
    allTimeBoxActive: {
      backgroundColor: colors.accent,
      borderColor:     colors.accent,
    },
    allTimeText: { color: colors.textSecondary, ...typography.labelSmall },

    // ── Сумма + тренд ────────────────────────────────────────────────────────
    summaryRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'flex-start',
      marginBottom:   12,
      paddingHorizontal: 2,
    },
    periodNavRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           4,
    },
    periodArrow:         { padding: 4 },
    periodArrowDisabled: { opacity: 0.35 },
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
    // Подпись периода под значением «Средний расход» (cons-avg) — «за период
    // май–окт 2026» / «за всё время».
    metricSub: { color: colors.textMuted, ...typography.labelSmall, marginTop: 4 },

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

    // Область столбиков: flex-row. alignItems: 'stretch' (не 'flex-end') —
    // каждая колонка-TouchableOpacity растягивается на всю высоту графика, а
    // не только на высоту самого бара, иначе по низким/пустым столбцам почти
    // невозможно попасть пальцем. Сам бар внутри колонки всё равно прижат к
    // низу через justifyContent: 'flex-end' у barWrapper — визуально не меняется.
    barsArea: {
      flexDirection: 'row',
      alignItems:    'stretch',
      gap:           4,
    },
    // Каждый столбик: позиционирует бар и подпись, растянут на всю высоту
    // barsArea (см. комментарий выше) — область нажатия на весь столбец.
    barWrapper: {
      flex:           1,
      alignItems:     'center',
      justifyContent: 'flex-end',
      // position: relative по умолчанию в RN — absolute-дочерние позиционируются внутри
    },
    // Режим «за всё время»: фиксированная ширина вместо flex — колонки едут
    // внутри горизонтального ScrollView, а не сжимаются под любое число месяцев.
    barWrapperFixed: { flex: undefined, width: BAR_COL_W },
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
    labelCellFixed: { flex: undefined, width: BAR_COL_W },
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
