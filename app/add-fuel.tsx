/**
 * Экран добавления / редактирования заправки — Этап 2.
 * Разделы ТЗ: 4.3, 5.2, 6.1, 6.2.
 *
 * Режимы:
 *  - Добавление: /add-fuel
 *  - Редактирование: /add-fuel?editId=<id>
 *
 * Все цвета из theme, весь текст через t().
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { formatMoney } from '@/constants/currencies';
import { carRepo } from '@/db';
import {
  addFuelEntry,
  getLastFullTankEntry,
  getFuelEntryById,
  updateFuelEntry,
} from '@/db/repositories/fuel';

// ─── Утилиты ────────────────────────────────────────────────────────────────

/** new Date() → 'YYYY-MM-DD' */
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** new Date() → '27.05.2026' */
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

// ─── Компонент ──────────────────────────────────────────────────────────────

export default function AddFuelScreen() {
  const { t } = useTranslation();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEdit = !!editId;

  const th = useAppTheme();
  const { colors, radius, typography, gradient } = th;
  const s = useMemo(() => makeStyles(th), [th]);

  // ── Поля формы ────────────────────────────────────────────────────────────
  const [dateObj,     setDateObj]     = useState(new Date());
  const [showPicker,  setShowPicker]  = useState(false);
  const [odometer,    setOdometer]    = useState('');
  const [liters,      setLiters]      = useState('');
  const [totalCost,   setTotalCost]   = useState('');
  const [isFullTank,  setIsFullTank]  = useState(true);
  const [focused,     setFocused]     = useState<string | null>(null);
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  // ── Данные из БД ──────────────────────────────────────────────────────────
  const [currency,        setCurrency]        = useState('MDL');
  const [currentOdometer, setCurrentOdometer] = useState(0);
  const [lastFullOdo,     setLastFullOdo]     = useState<number | null>(null);
  const [saving,          setSaving]          = useState(false);
  const [loadingEdit,     setLoadingEdit]     = useState(isEdit);

  useEffect(() => {
    async function load() {
      const [car, lastFull] = await Promise.all([
        carRepo.getCar(),
        getLastFullTankEntry(),
      ]);
      if (car) {
        setCurrency(car.currency);
        setCurrentOdometer(car.current_odometer);
        if (!isEdit) {
          // При добавлении — одометр по умолчанию = текущий
          setOdometer(String(car.current_odometer));
        }
      }
      if (lastFull) setLastFullOdo(lastFull.odometer);

      // Загрузка существующей записи для редактирования
      if (isEdit && editId) {
        const entry = await getFuelEntryById(Number(editId));
        if (entry) {
          setDateObj(fromISO(entry.date));
          setOdometer(String(entry.odometer));
          setLiters(String(entry.liters));
          setTotalCost(String(entry.total_cost));
          setIsFullTank(entry.is_full_tank === 1);
        }
      }

      setLoadingEdit(false);
    }
    load().catch(console.error);
  }, [isEdit, editId]);

  // ── Живые вычисления ──────────────────────────────────────────────────────
  const litersNum = parseNum(liters);
  const costNum   = parseNum(totalCost);
  const odoNum    = parseInt(odometer, 10);

  const okLiters = !isNaN(litersNum) && litersNum > 0;
  const okCost   = !isNaN(costNum)   && costNum   > 0;
  const okOdo    = !isNaN(odoNum)    && odoNum    > 0;

  /** Цена за литр — считается всегда (6.1) */
  const pricePerLiter: number | null =
    okLiters && okCost ? costNum / litersNum : null;

  /** Расход — только полный бак, нужен предыдущий одометр (6.2) */
  const canCalcConsumption =
    isFullTank &&
    lastFullOdo !== null &&
    okOdo &&
    odoNum > lastFullOdo &&
    okLiters;

  const previewConsumption: string | null = canCalcConsumption
    ? ((litersNum / (odoNum - lastFullOdo!)) * 100).toFixed(2)
    : null;

  // ── Валидация ─────────────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!okLiters) errs.liters = t('addFuel.errorLiters');
    if (!okCost)   errs.totalCost = t('addFuel.errorCost');
    // При редактировании не проверяем минимум одометра строго
    if (!okOdo || (!isEdit && odoNum < currentOdometer)) {
      errs.odometer = t('addFuel.errorOdometer');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Сохранение ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      if (isEdit && editId) {
        // Пересчитываем price_per_liter
        const ppl = okLiters && okCost
          ? parseFloat((costNum / litersNum).toFixed(2))
          : undefined;
        await updateFuelEntry(Number(editId), {
          date:          toISO(dateObj),
          odometer:      odoNum,
          liters:        litersNum,
          total_cost:    costNum,
          price_per_liter: ppl,
          is_full_tank:  isFullTank ? 1 : 0,
        });
      } else {
        await addFuelEntry({
          car_id:       1,
          date:         toISO(dateObj),
          odometer:     odoNum,
          liters:       litersNum,
          total_cost:   costNum,
          is_full_tank: isFullTank ? 1 : 0,
        });
      }
      router.back();
    } catch (e) {
      console.error('[AddFuel]', e);
      setSaving(false);
    }
  }

  // ── Date picker ───────────────────────────────────────────────────────────
  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected && event.type !== 'dismissed') setDateObj(selected);
  }

  // ── Стили ввода (фокус / ошибка) ─────────────────────────────────────────
  function inputStyle(field: string) {
    return [
      s.input,
      focused === field  ? s.inputFocused : undefined,
      errors[field]      ? s.inputError   : undefined,
    ];
  }

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
        <Text style={s.headerTitle}>{t('addFuel.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      {/* ── Форма ─────────────────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Дата */}
        <Text style={s.label}>{t('addFuel.date')}</Text>
        <Pressable
          style={[s.input, s.dateRow, focused === 'date' && s.inputFocused]}
          onPress={() => { setFocused('date'); setShowPicker(true); }}
        >
          <Text style={s.inputText}>{toDisplay(dateObj)}</Text>
          <Text style={s.dateIcon}>📅</Text>
        </Pressable>

        {showPicker && (
          <>
            <DateTimePicker
              value={dateObj}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onDateChange}
              maximumDate={new Date()}
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={s.doneBtn}
                onPress={() => { setShowPicker(false); setFocused(null); }}
              >
                <Text style={s.doneBtnText}>{t('common.done')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Пробег */}
        <Text style={s.label}>{t('addFuel.odometer')}, {t('common.km')}</Text>
        <TextInput
          style={inputStyle('odometer')}
          value={odometer}
          onChangeText={(v) => { setOdometer(v); setErrors((p) => ({ ...p, odometer: '' })); }}
          onFocus={() => setFocused('odometer')}
          onBlur={() => setFocused(null)}
          keyboardType="number-pad"
          placeholder={String(currentOdometer)}
          placeholderTextColor={colors.textWeak}
          selectionColor={colors.accent}
        />
        {errors.odometer ? <Text style={s.errorText}>{errors.odometer}</Text> : null}

        {/* Литры */}
        <Text style={s.label}>{t('addFuel.liters')}</Text>
        <TextInput
          style={inputStyle('liters')}
          value={liters}
          onChangeText={(v) => { setLiters(v); setErrors((p) => ({ ...p, liters: '' })); }}
          onFocus={() => setFocused('liters')}
          onBlur={() => setFocused(null)}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.textWeak}
          selectionColor={colors.accent}
        />
        {errors.liters ? <Text style={s.errorText}>{errors.liters}</Text> : null}

        {/* Сумма */}
        <Text style={s.label}>{t('addFuel.totalCost')}, {currency}</Text>
        <TextInput
          style={inputStyle('totalCost')}
          value={totalCost}
          onChangeText={(v) => { setTotalCost(v); setErrors((p) => ({ ...p, totalCost: '' })); }}
          onFocus={() => setFocused('totalCost')}
          onBlur={() => setFocused(null)}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.textWeak}
          selectionColor={colors.accent}
        />
        {errors.totalCost ? <Text style={s.errorText}>{errors.totalCost}</Text> : null}

        {/* Полный бак */}
        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>{t('addFuel.fullTank')}</Text>
          <Switch
            value={isFullTank}
            onValueChange={setIsFullTank}
            trackColor={{ false: colors.surfaceSecondary, true: colors.accent }}
            thumbColor={colors.textPrimary}
          />
        </View>

        {/* ── Блок превью (живой расчёт) ────────────────────────────────── */}
        <View style={s.preview}>
          <Text style={s.previewTitle}>{t('addFuel.preview')}</Text>

          {/* Цена за литр */}
          <View style={s.previewRow}>
            <Text style={s.previewLabel}>{t('addFuel.pricePerLiter')}</Text>
            <Text style={[s.previewValue, !pricePerLiter && s.previewDim]}>
              {pricePerLiter != null ? formatMoney(pricePerLiter, currency) : '—'}
            </Text>
          </View>

          {/* Расход */}
          <View style={s.previewRow}>
            <Text style={s.previewLabel}>{t('addFuel.consumption')}</Text>
            {!isFullTank ? (
              <Text style={s.previewSkip}>{t('addFuel.notFullTankSkip')}</Text>
            ) : lastFullOdo === null ? (
              <Text style={s.previewDim}>{t('addFuel.firstFullTank')}</Text>
            ) : (
              <Text style={[s.previewValue, !previewConsumption && s.previewDim]}>
                {previewConsumption
                  ? `${previewConsumption} ${t('addFuel.per100km')}`
                  : '—'}
              </Text>
            )}
          </View>
        </View>

        {/* ── Кнопка сохранения (градиент из дизайн-системы) ───────────── */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
          style={s.saveBtnWrapper}
        >
          <LinearGradient
            colors={gradient.accent.colors}
            start={gradient.accent.start}
            end={gradient.accent.end}
            style={s.saveBtn}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.saveBtnText}>
                  {isEdit ? t('common.save') : t('addFuel.saveBtn')}
                </Text>
            }
          </LinearGradient>
        </TouchableOpacity>

        {/* Нижний отступ для iOS home indicator */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

function makeStyles(th: AppTheme) {
  const { colors, radius, typography } = th;
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // Шапка
    header: {
      flexDirection:  'row',
      alignItems:     'center',
      paddingTop:     Platform.OS === 'ios' ? 56 : 48,
      paddingBottom:  16,
      paddingHorizontal: 20,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 36,
    },
    backIcon: {
      color:    colors.accent,
      fontSize: 32,
      lineHeight: 36,
      fontWeight: '300',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      color:    colors.textPrimary,
      ...typography.screenTitle,
    },
    headerSpacer: { width: 36 },

    // Прокрутка
    scroll:   { flex: 1 },
    content:  { padding: 20 },

    // Лейбл поля
    label: {
      color:        colors.textSecondary,
      ...typography.labelSmall,
      marginBottom: 6,
      marginTop:    4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    // Поле ввода
    input: {
      backgroundColor: colors.surface,
      borderRadius:    radius.card,
      borderWidth:     1,
      borderColor:     colors.border,
      paddingHorizontal: 16,
      paddingVertical:   14,
      color:           colors.textPrimary,
      ...typography.cardText,
      marginBottom:    4,
    },
    inputFocused: { borderColor: colors.borderAccent },
    inputError:   { borderColor: colors.statusDue.text },

    // Дата (pressable)
    dateRow: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
    },
    inputText: {
      color: colors.textPrimary,
      ...typography.cardText,
    },
    dateIcon: { fontSize: 18 },

    // iOS "Готово" после spinner
    doneBtn: {
      alignSelf:   'flex-end',
      paddingHorizontal: 16,
      paddingVertical:   6,
      marginBottom: 4,
    },
    doneBtnText: {
      color: colors.accent,
      ...typography.cardTextMedium,
    },

    // Сообщение об ошибке
    errorText: {
      color:       colors.statusDue.text,
      ...typography.labelSmall,
      marginBottom: 8,
      marginLeft:   4,
    },

    // Тумблер «Полный бак»
    toggleRow: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius:   radius.card,
      borderWidth:    1,
      borderColor:    colors.border,
      paddingHorizontal: 16,
      paddingVertical:   12,
      marginTop:      12,
      marginBottom:   4,
    },
    toggleLabel: {
      color: colors.textPrimary,
      ...typography.cardText,
    },

    // Блок превью
    preview: {
      backgroundColor: colors.surface,
      borderRadius:    radius.card,
      borderWidth:     1,
      borderColor:     colors.borderAccent,
      padding:         16,
      marginTop:       16,
      marginBottom:    24,
      gap:             10,
    },
    previewTitle: {
      color:        colors.textSecondary,
      ...typography.sectionHeader,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    previewRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
    },
    previewLabel: {
      color: colors.textSecondary,
      ...typography.label,
    },
    previewValue: {
      color: colors.accent,
      ...typography.cardTextMedium,
    },
    previewDim: {
      color: colors.textWeak,
      ...typography.label,
    },
    previewSkip: {
      color: colors.textMuted,
      ...typography.label,
      fontStyle: 'italic',
    },

    // Кнопка сохранения
    saveBtnWrapper: { borderRadius: radius.card, overflow: 'hidden' },
    saveBtn: {
      borderRadius:  radius.card,
      paddingVertical: 16,
      alignItems:    'center',
      justifyContent: 'center',
    },
    saveBtnText: {
      color:    '#ffffff',
      ...typography.cardTextMedium,
      letterSpacing: 0.5,
    },
  });
}
