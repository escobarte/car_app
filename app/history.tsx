/**
 * Экран История — Этап 3.
 * Разделы ТЗ: 4.2.
 *
 * - Объединённый список: заправки + расходы + service_record
 * - Группировка по месяцам (новые сверху)
 * - Фильтры-таблетки: Все / Заправки / Расходы / Сервис
 * - Иконка + тип, дата, пробег, сумма в валюте авто
 * - Все цвета из theme, весь текст через t()
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '@/constants/theme';
import {
  fuelRepo, expenseRepo, serviceRepo, categoryRepo, carRepo,
  FuelEntry, Expense, ServiceRecord, Category, Car,
} from '@/db';

const { colors, radius, typography } = theme;

// ─── Типы ──────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'fuel' | 'expense' | 'service';

type FuelItem    = { kind: 'fuel';    data: FuelEntry };
type ExpenseItem = { kind: 'expense'; data: Expense; category: Category | undefined };
type ServiceItem = { kind: 'service'; data: ServiceRecord };
type HistoryItem = FuelItem | ExpenseItem | ServiceItem;

type Section = { title: string; data: HistoryItem[] };

// ─── Вспомогательные функции ───────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  MDL: 'L',    USD: '$',   EUR: '€',
  RUB: '₽',    UAH: '₴',  RON: 'lei',
};

function currSymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

/** 'YYYY-MM-DD' → 'DD.MM.YY' */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y.slice(2)}`;
}

/** 'YYYY-MM' + locale → 'Май 2026' / 'May 2026' */
function fmtMonthHeader(yearMonth: string, locale: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

function fmtAmount(amount: number, sym: string): string {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${sym}`;
}

// ─── Компонент ─────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';

  const [car,        setCar]        = useState<Car | null>(null);
  const [fuels,      setFuels]      = useState<FuelEntry[]>([]);
  const [expenses,   setExpenses]   = useState<Expense[]>([]);
  const [services,   setServices]   = useState<ServiceRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter,     setFilter]     = useState<FilterType>('all');
  const [loading,    setLoading]    = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        setLoading(true);
        const [carData, fuelData, expData, svcData, catData] = await Promise.all([
          carRepo.getCar(),
          fuelRepo.getAllFuelEntries(),
          expenseRepo.getAllExpenses(),
          serviceRepo.getAllServiceRecords(),
          categoryRepo.getAllCategories(),
        ]);
        if (!active) return;
        setCar(carData);
        setFuels(fuelData);
        setExpenses(expData);
        setServices(svcData);
        setCategories(catData);
        setLoading(false);
      }
      load().catch(console.error);
      return () => { active = false; };
    }, [])
  );

  // ── Объединяем + группируем по месяцам ──────────────────────────────────

  const sym = currSymbol(car?.currency ?? '');

  const sections = useMemo<Section[]>(() => {
    const catMap = new Map(categories.map((c) => [c.id, c]));

    const all: HistoryItem[] = [];

    if (filter === 'all' || filter === 'fuel') {
      fuels.forEach((f) => all.push({ kind: 'fuel', data: f }));
    }
    if (filter === 'all' || filter === 'expense') {
      expenses.forEach((e) =>
        all.push({ kind: 'expense', data: e, category: catMap.get(e.category_id) })
      );
    }
    if (filter === 'all' || filter === 'service') {
      services.forEach((s) => all.push({ kind: 'service', data: s }));
    }

    // Сортировка: дата убывает, при равных — по id убывает
    all.sort((a, b) => {
      if (a.data.date !== b.data.date) return a.data.date < b.data.date ? 1 : -1;
      return b.data.id - a.data.id;
    });

    // Группировка по YYYY-MM
    const grouped = new Map<string, HistoryItem[]>();
    all.forEach((item) => {
      const ym = item.data.date.slice(0, 7);
      let bucket = grouped.get(ym);
      if (!bucket) { bucket = []; grouped.set(ym, bucket); }
      bucket.push(item);
    });

    return Array.from(grouped.entries()).map(([ym, items]) => ({
      title: fmtMonthHeader(ym, locale),
      data:  items,
    }));
  }, [fuels, expenses, services, categories, filter, locale]);

  // ── Фильтры ──────────────────────────────────────────────────────────────

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'all',     label: t('history.filterAll') },
    { key: 'fuel',    label: t('history.filterFuel') },
    { key: 'expense', label: t('history.filterExpense') },
    { key: 'service', label: t('history.filterService') },
  ];

  // ── Рендер строки ─────────────────────────────────────────────────────────

  function renderItem({ item }: { item: HistoryItem }) {
    if (item.kind === 'fuel') {
      const f = item.data;
      return (
        <View style={s.item}>
          <View style={[s.iconWrap, s.iconWrapFuel]}>
            <Ionicons name="water" size={20} color={colors.accent} />
          </View>
          <View style={s.itemBody}>
            <Text style={s.itemTitle}>
              {f.liters.toFixed(1)} {t('addFuel.liters').toLowerCase()}
              {f.is_full_tank === 1 ? ' · ⛽' : ''}
            </Text>
            <Text style={s.itemSub}>
              {fmtDate(f.date)}
              {f.odometer
                ? ` · ${f.odometer.toLocaleString()} ${t('common.km')}`
                : ''}
            </Text>
          </View>
          <Text style={[s.amount, { color: colors.accent }]}>
            {fmtAmount(f.total_cost, sym)}
          </Text>
        </View>
      );
    }

    if (item.kind === 'expense') {
      const e = item.data;
      const cat = item.category;
      const catName = cat
        ? (cat.key ? t(`categories.${cat.key}` as never) : cat.name)
        : '—';
      return (
        <View style={s.item}>
          <View style={[s.iconWrap, s.iconWrapExpense]}>
            <Ionicons name="receipt-outline" size={20} color={colors.statusSoon.text} />
          </View>
          <View style={s.itemBody}>
            <Text style={s.itemTitle}>{catName}</Text>
            <Text style={s.itemSub} numberOfLines={1}>
              {e.description ? `${e.description} · ` : ''}
              {fmtDate(e.date)}
              {e.odometer != null
                ? ` · ${e.odometer.toLocaleString()} ${t('common.km')}`
                : ''}
            </Text>
          </View>
          <Text style={[s.amount, { color: colors.statusSoon.text }]}>
            {fmtAmount(e.amount, sym)}
          </Text>
        </View>
      );
    }

    // service
    const sv = item.data;
    return (
      <View style={s.item}>
        <View style={[s.iconWrap, s.iconWrapService]}>
          <Ionicons name="build-outline" size={20} color={colors.statusOk.text} />
        </View>
        <View style={s.itemBody}>
          <Text style={s.itemTitle}>
            {sv.note || t('history.maintenance')}
          </Text>
          <Text style={s.itemSub}>
            {fmtDate(sv.date)}
            {sv.odometer
              ? ` · ${sv.odometer.toLocaleString()} ${t('common.km')}`
              : ''}
          </Text>
        </View>
        <Text style={[s.amount, { color: colors.statusOk.text }]}>
          {fmtAmount(sv.cost, sym)}
        </Text>
      </View>
    );
  }

  // ── Заголовок экрана + фильтры (ListHeaderComponent) ─────────────────────

  function ListHeader() {
    return (
      <View>
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t('history.title')}</Text>
          {/* пустышка для симметрии */}
          <View style={{ width: 24 }} />
        </View>

        <View style={s.pills}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[s.pill, filter === f.key && s.pillActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.7}
            >
              <Text style={[s.pillText, filter === f.key && s.pillTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // ── Загрузка ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <Text style={s.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  // ── Основной рендер ───────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <SectionList<HistoryItem, Section>
        sections={sections}
        keyExtractor={(item) => `${item.kind}-${item.data.id}`}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <Text style={s.sectionHeader}>{section.title}</Text>
        )}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={<Text style={s.empty}>{t('history.empty')}</Text>}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={s.listContent}
      />
    </View>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center',
            backgroundColor: colors.background },

  listContent: { paddingBottom: 40 },

  // ── Шапка ──────────────────────────────────────────────────────────────
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 16,
    paddingTop:      Platform.OS === 'ios' ? 56 : 48,
    paddingBottom:   12,
  },
  headerTitle: { color: colors.textPrimary, ...typography.screenTitle },

  // ── Фильтры-таблетки ───────────────────────────────────────────────────
  pills: {
    flexDirection:   'row',
    flexWrap:        'wrap',
    paddingHorizontal: 12,
    paddingBottom:   12,
    gap:             8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical:   7,
    borderRadius:      radius.pill,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
  },
  pillActive: {
    borderColor:     colors.borderAccent,
    backgroundColor: colors.activeCard,
  },
  pillText:       { color: colors.textSecondary, ...typography.labelSmall },
  pillTextActive: { color: colors.accent },

  // ── Заголовок секции (месяц) ───────────────────────────────────────────
  sectionHeader: {
    color:            colors.textWeak,
    ...typography.sectionHeader,
    textTransform:    'uppercase',
    paddingHorizontal: 16,
    paddingTop:        20,
    paddingBottom:     8,
  },

  // ── Строка записи ──────────────────────────────────────────────────────
  item: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: colors.background,
  },
  iconWrap: {
    width:          40,
    height:         40,
    borderRadius:   10,
    justifyContent: 'center',
    alignItems:     'center',
    marginRight:    12,
  },
  iconWrapFuel:    { backgroundColor: '#0a1f2e' },
  iconWrapExpense: { backgroundColor: '#241c0a' },
  iconWrapService: { backgroundColor: '#0c2018' },

  itemBody: {
    flex:        1,
    marginRight: 8,
  },
  itemTitle: {
    color:        colors.textPrimary,
    ...typography.cardText,
    marginBottom: 2,
  },
  itemSub: {
    color: colors.textSecondary,
    ...typography.labelSmall,
  },
  amount: {
    ...typography.cardTextMedium,
    textAlign: 'right',
    minWidth:  72,
  },

  // ── Разделитель ────────────────────────────────────────────────────────
  // отступ слева = 16 (padding) + 40 (icon) + 12 (gap) = 68
  separator: {
    height:          1,
    backgroundColor: colors.border,
    marginLeft:      68,
  },

  empty: {
    color:     colors.textWeak,
    ...typography.cardText,
    textAlign: 'center',
    marginTop: 60,
  },
  loadingText: {
    color: colors.textSecondary,
    ...typography.cardText,
  },
});
