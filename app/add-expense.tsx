/**
 * Форма добавления расхода — Этап 5.
 * Разделы ТЗ: 4.3, 5.3.
 *
 * Сверху вниз:
 *  1. Шапка ← + заголовок
 *  2. Сетка категорий 4 колонки; последняя — «+ Добавить» (заглушка)
 *  3. Поля: сумма, описание, дата, пробег (необяз.)
 *  4. Кнопка сохранения (LinearGradient)
 *
 * Все цвета из theme, весь текст через t().
 */

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '@/constants/theme';
import { currencySymbol } from '@/constants/currencies';
import { carRepo, categoryRepo, Category } from '@/db';
import { addExpense } from '@/db/repositories/expenses';

const { colors, radius, typography, gradient } = theme;

// ─── Константы сетки (нужны и в компоненте, и в StyleSheet) ────────────────
const GRID_PAD = 16;   // горизонтальный padding экрана
const GRID_GAP = 8;    // отступ между ячейками
const GRID_COLS = 4;

// ─── Утилиты ────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function toDisplay(d: Date): string {
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

/** Принимает '25,9' или '25.9' → 25.9 */
function parseNum(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

// ─── Маппинг иконок Tabler → Ionicons ──────────────────────────────────────
// CATEGORY.icon хранит имена иконок из Tabler Icons.
// @expo/vector-icons поставляет Ionicons, поэтому делаем статический маппинг.

const TABLER_TO_IONICONS: Record<string, string> = {
  'file-text':       'document-text-outline',   // documents
  'spray':           'water-outline',            // chemistry
  'settings-2':      'hammer-outline',           // tuning
  'puzzle':          'extension-puzzle-outline', // accessories
  'device-speaker':  'phone-portrait-outline',   // electronics
  'tool':            'build-outline',            // service
  'armchair':        'home-outline',             // comfort
  'engine':          'settings-outline',         // parts
  'clipboard-check': 'clipboard-outline',        // gov_inspection
  'alert-octagon':   'alert-circle-outline',     // fines
  'parking':         'car-outline',              // parking
  'wheel':           'reload-circle-outline',    // tires
};

function getCatIcon(tablerName: string): React.ComponentProps<typeof Ionicons>['name'] {
  return (TABLER_TO_IONICONS[tablerName] ?? 'help-circle-outline') as
    React.ComponentProps<typeof Ionicons>['name'];
}

// ─── Компонент ─────────────────────────────────────────────────────────────

export default function AddExpenseScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  // Ширина ячейки = (экран − 2×padding − 3×gap) / 4
  const cellW = Math.floor(
    (width - GRID_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS
  );

  // ── Данные из БД ─────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([]);
  const [currCode,   setCurrCode]   = useState('');
  const [currentOdo, setCurrentOdo] = useState<number | null>(null);

  // ── Поля формы ───────────────────────────────────────────────────────────
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [amount,        setAmount]        = useState('');
  const [description,   setDescription]  = useState('');
  const [dateObj,       setDateObj]       = useState(new Date());
  const [showPicker,    setShowPicker]    = useState(false);
  const [odometer,      setOdometer]      = useState('');

  // ── UI-состояние ─────────────────────────────────────────────────────────
  const [focused, setFocused] = useState<string | null>(null);
  const [errors,  setErrors]  = useState<{ category?: string; amount?: string }>({});
  const [saving,  setSaving]  = useState(false);

  // ── Загрузка ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [cats, car] = await Promise.all([
        categoryRepo.getAllCategories(),
        carRepo.getCar(),
      ]);
      setCategories(cats);
      setCurrCode(car?.currency ?? '');
      setCurrentOdo(car?.current_odometer ?? null);
    }
    load().catch(console.error);
  }, []);

  // ── Валидация ─────────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: typeof errors = {};
    if (!selectedCatId) {
      errs.category = t('addExpense.errorCategory');
    }
    const num = parseNum(amount);
    if (isNaN(num) || num <= 0) {
      errs.amount = t('addExpense.errorAmount');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Сохранение ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!validate() || saving || !selectedCatId) return;
    setSaving(true);
    try {
      const raw = odometer.trim();
      const odoNum = raw ? parseInt(raw, 10) : null;
      await addExpense({
        car_id:      1,
        category_id: selectedCatId,
        date:        toISO(dateObj),
        odometer:    odoNum != null && !isNaN(odoNum) ? odoNum : null,
        amount:      parseNum(amount),
        description: description.trim(),
      });
      router.back();
    } catch (e) {
      console.error('[AddExpense]', e);
      setSaving(false);
    }
  }

  // ── DatePicker ────────────────────────────────────────────────────────────
  function onDateChange(_: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) setDateObj(selected);
  }

  // ── Стиль поля ввода ──────────────────────────────────────────────────────
  function inputStyle(field: string, hasError = false) {
    return [
      s.input,
      focused === field ? s.inputFocused : undefined,
      hasError          ? s.inputError   : undefined,
    ];
  }

  const sym = currencySymbol(currCode);

  // ── Рендер ───────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Шапка ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('addExpense.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Сетка категорий ───────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>{t('addExpense.category')}</Text>

        <View style={s.grid}>
          {categories.map((cat) => {
            const active = selectedCatId === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[s.catCell, { width: cellW }, active && s.catCellActive]}
                onPress={() => {
                  setSelectedCatId(cat.id);
                  setErrors((prev) => ({ ...prev, category: undefined }));
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={getCatIcon(cat.icon)}
                  size={22}
                  color={active ? colors.accent : colors.textSecondary}
                />
                <Text
                  style={[s.catLabel, active && s.catLabelActive]}
                  numberOfLines={2}
                >
                  {cat.key ? t(`categories.${cat.key}` as never) : cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Заглушка «+ Добавить категорию» */}
          <TouchableOpacity
            style={[s.catCell, s.catCellAdd, { width: cellW }]}
            onPress={() => {/* TODO Этап 9: управление категориями */}}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.textWeak} />
            <Text style={s.catLabelAdd} numberOfLines={2}>
              {t('categories.addNew')}
            </Text>
          </TouchableOpacity>
        </View>

        {errors.category && (
          <Text style={s.errorText}>{errors.category}</Text>
        )}

        {/* ── Сумма ─────────────────────────────────────────────────────── */}
        <Text style={s.fieldLabel}>
          {t('addExpense.amount')}{sym ? `, ${sym}` : ''}
        </Text>
        <TextInput
          style={inputStyle('amount', !!errors.amount)}
          value={amount}
          onChangeText={(v) => {
            setAmount(v);
            if (errors.amount) setErrors((p) => ({ ...p, amount: undefined }));
          }}
          onFocus={() => setFocused('amount')}
          onBlur={()  => setFocused(null)}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.textWeak}
        />
        {errors.amount && (
          <Text style={s.errorText}>{errors.amount}</Text>
        )}

        {/* ── Описание ─────────────────────────────────────────────────── */}
        <Text style={s.fieldLabel}>{t('addExpense.description')}</Text>
        <TextInput
          style={[inputStyle('description'), s.inputMultiline]}
          value={description}
          onChangeText={setDescription}
          onFocus={() => setFocused('description')}
          onBlur={()  => setFocused(null)}
          placeholder="…"
          placeholderTextColor={colors.textWeak}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
        />

        {/* ── Дата ─────────────────────────────────────────────────────── */}
        <Text style={s.fieldLabel}>{t('addExpense.date')}</Text>
        <TouchableOpacity
          style={inputStyle('date')}
          onPress={() => setShowPicker(true)}
          activeOpacity={0.8}
        >
          <View style={s.dateRow}>
            <Text style={s.inputText}>{toDisplay(dateObj)}</Text>
            <Text style={s.dateIcon}>📅</Text>
          </View>
        </TouchableOpacity>

        {showPicker && (
          <DateTimePicker
            value={dateObj}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}
        {Platform.OS === 'ios' && showPicker && (
          <TouchableOpacity style={s.doneBtn} onPress={() => setShowPicker(false)}>
            <Text style={s.doneBtnText}>{t('common.done')}</Text>
          </TouchableOpacity>
        )}

        {/* ── Пробег (необязательно) ─────────────────────────────────── */}
        <Text style={s.fieldLabel}>{t('addExpense.odometer')}</Text>
        <TextInput
          style={inputStyle('odometer')}
          value={odometer}
          onChangeText={setOdometer}
          onFocus={() => setFocused('odometer')}
          onBlur={()  => setFocused(null)}
          keyboardType="number-pad"
          placeholder={currentOdo != null ? String(currentOdo) : '—'}
          placeholderTextColor={colors.textWeak}
        />

        {/* ── Кнопка сохранения ───────────────────────────────────────── */}
        <TouchableOpacity
          style={s.saveWrapper}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={saving}
        >
          <LinearGradient
            colors={gradient.accent.colors}
            start={gradient.accent.start}
            end={gradient.accent.end}
            style={s.saveBtn}
          >
            <Text style={s.saveBtnText}>
              {saving ? '…' : t('addExpense.saveBtn')}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },

  // ── Шапка ──────────────────────────────────────────────────────────────
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingTop:        Platform.OS === 'ios' ? 56 : 48,
    paddingBottom:     16,
    paddingHorizontal: 20,
    backgroundColor:   colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn:      { width: 36 },
  backIcon:     { color: colors.accent, fontSize: 32, lineHeight: 36, fontWeight: '300' },
  headerTitle:  { flex: 1, textAlign: 'center', color: colors.textPrimary, ...typography.screenTitle },
  headerSpacer: { width: 36 },

  content: {
    paddingHorizontal: GRID_PAD,
    paddingTop:        20,
    paddingBottom:     40,
  },

  // ── Сетка категорий ────────────────────────────────────────────────────
  sectionLabel: {
    color:         colors.textSecondary,
    ...typography.labelSmall,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom:  10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           GRID_GAP,
    marginBottom:  4,
  },
  catCell: {
    height:          76,
    backgroundColor: colors.surface,
    borderRadius:    radius.card,
    borderWidth:     1,
    borderColor:     colors.border,
    justifyContent:  'center',
    alignItems:      'center',
    padding:         6,
    gap:             5,
  },
  catCellActive: {
    borderColor:     colors.borderAccent,
    backgroundColor: colors.activeCard,
  },
  catCellAdd: {
    // React Native не поддерживает borderStyle: 'dashed' на всех платформах
    // для скруглённых углов — используем пониженную прозрачность цвета границы
    borderColor:     colors.textWeak,
    backgroundColor: colors.background,
  },
  catLabel: {
    color:      colors.textSecondary,
    fontSize:   10,
    fontWeight: '400' as const,
    textAlign:  'center',
    lineHeight: 13,
  },
  catLabelActive: { color: colors.accent },
  catLabelAdd:    { color: colors.textWeak },

  // ── Поля ввода ─────────────────────────────────────────────────────────
  fieldLabel: {
    color:        colors.textSecondary,
    ...typography.labelSmall,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop:    16,
    marginBottom:  6,
  },
  input: {
    backgroundColor:   colors.surface,
    borderRadius:      radius.card,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingHorizontal: 16,
    paddingVertical:   14,
    color:             colors.textPrimary,
    ...typography.cardText,
    marginBottom:      2,
  },
  inputFocused:   { borderColor: colors.borderAccent },
  inputError:     { borderColor: colors.statusDue.text },
  inputMultiline: { minHeight: 72, paddingTop: 12 },

  // Дата (Pressable → показываем как input)
  dateRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  inputText: { color: colors.textPrimary, ...typography.cardText },
  dateIcon:  { fontSize: 18 },

  // iOS "Готово" после spinner
  doneBtn:     { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 6, marginBottom: 4 },
  doneBtnText: { color: colors.accent, ...typography.cardTextMedium },

  // Ошибка под полем
  errorText: {
    color:     colors.statusDue.text,
    ...typography.labelSmall,
    marginTop: 2,
    marginBottom: 4,
  },

  // ── Кнопка сохранения ─────────────────────────────────────────────────
  saveWrapper: { marginTop: 28 },
  saveBtn: {
    borderRadius:    radius.card,
    paddingVertical: 16,
    alignItems:      'center',
  },
  saveBtnText: { color: '#ffffff', ...typography.cardTextMedium },
});
