/**
 * Форма добавления / редактирования расхода — Этап 5.
 * Разделы ТЗ: 4.3, 5.3.
 *
 * Режимы:
 *  - Добавление: /add-expense
 *  - Редактирование: /add-expense?editId=<id>
 *
 * Сверху вниз:
 *  1. Шапка ← + заголовок
 *  2. Сетка категорий 4 колонки; последняя — «+ Добавить» (→ /categories)
 *  3. Поля: сумма, описание, дата, пробег (необяз.)
 *  4. Кнопка сохранения (LinearGradient)
 *
 * Все цвета из theme, весь текст через t().
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { currencySymbol } from '@/constants/currencies';
import { resolveIcon } from '@/utils/icons';
import { carRepo, categoryRepo, Category } from '@/db';
import {
  addExpense,
  getExpenseById,
  updateExpense,
} from '@/db/repositories/expenses';

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

/** 'YYYY-MM-DD' → Date */
function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Принимает '25,9' или '25.9' → 25.9 */
function parseNum(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

function getCatIcon(icon: string): React.ComponentProps<typeof Ionicons>['name'] {
  return resolveIcon(icon) as React.ComponentProps<typeof Ionicons>['name'];
}

// ─── Компонент ─────────────────────────────────────────────────────────────

export default function AddExpenseScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEdit = !!editId;

  const th = useAppTheme();
  const { colors, radius, typography, gradient } = th;
  const s = useMemo(() => makeStyles(th), [th]);

  // Ширина ячейки = (экран − 2×padding − 3×gap) / 4
  const cellW = Math.floor(
    (width - GRID_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS
  );

  // ── Данные из БД ─────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([]);
  const [currCode,   setCurrCode]   = useState('');
  const [currentOdo, setCurrentOdo] = useState<number | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);

  // ── Поля формы ───────────────────────────────────────────────────────────
  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [amount,        setAmount]        = useState('');
  const [description,   setDescription]  = useState('');
  const [dateObj,       setDateObj]       = useState(new Date());
  const [showPicker,    setShowPicker]    = useState(false);
  const [odometer,      setOdometer]      = useState('');

  // ── UI-состояние ─────────────────────────────────────────────────────────
  const [focused, setFocused] = useState<string | null>(null);
  const [errors,  setErrors]  = useState<{ category?: string; amount?: string; odometer?: string }>({});
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

      // Загрузка существующей записи для редактирования
      if (isEdit && editId) {
        const entry = await getExpenseById(Number(editId));
        if (entry) {
          setSelectedCatId(entry.category_id);
          setAmount(String(entry.amount));
          setDescription(entry.description ?? '');
          setDateObj(fromISO(entry.date));
          setOdometer(entry.odometer != null ? String(entry.odometer) : '');
        }
      }

      setLoadingEdit(false);
    }
    load().catch(console.error);
  }, [isEdit, editId]);

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
    // Пробег необязателен, но если заполнен и меньше текущего — ошибка
    const rawOdo = odometer.trim();
    if (rawOdo && !isEdit) {
      const odoNum = parseInt(rawOdo, 10);
      if (isNaN(odoNum) || (currentOdo !== null && odoNum < currentOdo)) {
        errs.odometer = t('common.errorOdometer');
      }
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
      const odo = odoNum != null && !isNaN(odoNum) ? odoNum : null;

      if (isEdit && editId) {
        await updateExpense(Number(editId), {
          category_id: selectedCatId,
          date:        toISO(dateObj),
          odometer:    odo,
          amount:      parseNum(amount),
          description: description.trim(),
        });
      } else {
        await addExpense({
          car_id:      1,
          category_id: selectedCatId,
          date:        toISO(dateObj),
          odometer:    odo,
          amount:      parseNum(amount),
          description: description.trim(),
        });
      }
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

  // ── Загрузка данных редактирования ────────────────────────────────────────
  if (loadingEdit) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

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

          {/* «+ Добавить категорию» → экран управления категориями */}
          <TouchableOpacity
            style={[s.catCell, s.catCellAdd, { width: cellW }]}
            onPress={() => router.push('/categories' as never)}
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
          style={inputStyle('odometer', !!errors.odometer)}
          value={odometer}
          onChangeText={(v) => { setOdometer(v); if (errors.odometer) setErrors((p) => ({ ...p, odometer: undefined })); }}
          onFocus={() => setFocused('odometer')}
          onBlur={()  => setFocused(null)}
          keyboardType="number-pad"
          placeholder={currentOdo != null ? String(currentOdo) : '—'}
          placeholderTextColor={colors.textWeak}
        />
        {errors.odometer && (
          <Text style={s.errorText}>{errors.odometer}</Text>
        )}

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
              {saving ? '…' : (isEdit ? t('common.save') : t('addExpense.saveBtn'))}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

function makeStyles(th: AppTheme) {
  const { colors, radius, typography } = th;
  return StyleSheet.create({
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
}
