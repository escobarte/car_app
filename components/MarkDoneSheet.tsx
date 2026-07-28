/**
 * Bottom-Sheet «Отметить выполнение» — единая форма для всего приложения.
 *
 * Используется в двух местах:
 *  - Dashboard (тап по карточке напоминания)
 *  - Service tab (кнопка «Сделано» на карточке регламента)
 *
 * Логика:
 *  1. Создаёт ServiceRecord (попадает в Историю).
 *  2. Сбрасывает Reminder: last_odometer / last_date обновляются —
 *     карточка перестаёт быть «просроченной».
 *  3. Вызывает onSaved, чтобы вызывающий экран перезагрузил данные.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { currencySymbol } from '@/constants/currencies';
import { serviceRepo, Reminder, Car } from '@/db';

// ─── Утилиты ────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function toDisplay(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function parseNum(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

// ─── Пропсы ────────────────────────────────────────────────────────────────

type Props = {
  reminder: Reminder | null;     // null → лист скрыт
  car:      Car | null;
  onClose:  () => void;
  onSaved:  () => void;
};

// ─── Компонент ─────────────────────────────────────────────────────────────

export default function MarkDoneSheet({ reminder, car, onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';

  const th = useAppTheme();
  const { colors, gradient } = th;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(th, insets.bottom), [th, insets.bottom]);

  const visible = reminder !== null;

  // ── Состояние полей ──────────────────────────────────────────────────────
  // Дата и пробег обязательны (ТЗ 6.3), поэтому оба стартуют пустыми:
  // date === null означает «пользователь ещё не выбрал». Раньше поле
  // молча подставляло сегодня, а пустой пробег — текущий пробег машины,
  // и регламент закрывался значениями, которых пользователь не вводил.
  const [date,      setDate]      = useState<Date | null>(null);
  const [datePick,  setDatePick]  = useState(false);
  const [odo,       setOdo]       = useState('');
  const [cost,      setCost]      = useState('');
  const [note,      setNote]      = useState('');
  const [saving,    setSaving]    = useState(false);
  const [focused,   setFocused]   = useState<string | null>(null);
  const [odoError,  setOdoError]  = useState('');
  const [dateError, setDateError] = useState('');

  // Каждый раз при открытии — сбрасываем поля.
  useEffect(() => {
    if (visible) {
      setDate(null);
      setOdo('');
      setCost('');
      setNote('');
      setFocused(null);
      setOdoError('');
      setDateError('');
    }
  }, [visible]);

  // ── Сохранение ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!reminder || saving) return;

    // ── Валидация: дата и пробег обязательны (ТЗ 6.3) ──────────────────────
    // Проверяем оба поля до выхода, чтобы пользователь увидел все ошибки
    // сразу, а не по одной на каждое нажатие.
    let ok = true;

    if (!date) {
      setDateError(t('service.dateRequired'));
      ok = false;
    }

    const odoTrimmed = odo.trim();
    const parsedOdo  = parseInt(odoTrimmed, 10);
    if (!odoTrimmed) {
      setOdoError(t('service.odoRequired'));
      ok = false;
    } else if (isNaN(parsedOdo) || parsedOdo < (car?.current_odometer ?? 0)) {
      setOdoError(t('common.errorOdometer'));
      ok = false;
    }

    if (!ok || !date) return;

    setSaving(true);
    try {
      const costNum = cost.trim() ? parseNum(cost) : 0;

      // last_odometer / last_date регламента пересчитает сам репозиторий
      // из записей об обслуживании — см. syncReminderFromRecords().
      await serviceRepo.addServiceRecord({
        car_id:      1,
        reminder_id: reminder.id,
        date:        toISO(date),
        odometer:    parsedOdo,
        cost:        isNaN(costNum) ? 0 : costNum,
        note:        note.trim(),
      });

      onSaved();
      onClose();
    } catch (e) {
      console.error('[MarkDoneSheet.handleSave]', e);
    } finally {
      setSaving(false);
    }
  }

  // ── Хелперы рендера ──────────────────────────────────────────────────────
  function inputStyle(field: string) {
    return [s.input, focused === field && s.inputFocused];
  }

  const sym = currencySymbol(car?.currency ?? '');

  // ── Рендер ───────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* KeyboardAvoidingView поднимает лист над клавиатурой:
          iOS 'padding' добавляет отступ снизу, Android 'height' сжимает контейнер —
          в обоих случаях flex-end лист уезжает вверх, поля остаются видимыми. */}
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={s.sheet}>
          {/* Шапка */}
          <View style={s.header}>
            <Text style={s.title}>{t('service.markDoneTitle')}</Text>
            <Text style={s.subtitle} numberOfLines={1}>
              {reminder?.title ?? ''}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={s.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
          >
            {/* Дата */}
            <Text style={s.fieldLabel}>{t('service.dateField')}</Text>
            <TouchableOpacity
              style={[inputStyle('date'), dateError ? s.inputError : undefined]}
              onPress={() => { setDatePick(true); if (dateError) setDateError(''); }}
              activeOpacity={0.8}
            >
              <View style={s.dateRow}>
                <Text style={date ? s.inputText : s.inputPlaceholder}>
                  {date ? toDisplay(date, locale) : t('service.datePlaceholder')}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
            {!!dateError && <Text style={s.errorText}>{dateError}</Text>}
            {datePick && (
              <DateTimePicker
                value={date ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_: DateTimePickerEvent, d?: Date) => {
                  if (Platform.OS === 'android') setDatePick(false);
                  if (d) { setDate(d); setDateError(''); }
                }}
                maximumDate={new Date()}
              />
            )}
            {Platform.OS === 'ios' && datePick && (
              <TouchableOpacity
                style={s.iosDoneBtn}
                onPress={() => {
                  // iOS-спиннер не шлёт onChange, если колесо не крутили.
                  // Тап по «Готово» — явное действие, поэтому фиксируем
                  // показанное значение, иначе дата осталась бы пустой.
                  setDate((prev) => prev ?? new Date());
                  setDateError('');
                  setDatePick(false);
                }}
              >
                <Text style={s.iosDoneBtnText}>{t('common.done')}</Text>
              </TouchableOpacity>
            )}

            {/* Пробег */}
            <Text style={s.fieldLabel}>{t('service.odoField')}</Text>
            <TextInput
              style={[inputStyle('odo'), odoError ? s.inputError : undefined]}
              value={odo}
              onChangeText={(v) => { setOdo(v); if (odoError) setOdoError(''); }}
              onFocus={() => setFocused('odo')}
              onBlur={() => setFocused(null)}
              keyboardType="number-pad"
              placeholder={String(car?.current_odometer ?? 0)}
              placeholderTextColor={colors.textWeak}
            />
            {!!odoError && <Text style={s.errorText}>{odoError}</Text>}

            {/* Стоимость */}
            <Text style={s.fieldLabel}>
              {t('service.costField')}{sym ? `, ${sym}` : ''}
            </Text>
            <TextInput
              style={inputStyle('cost')}
              value={cost}
              onChangeText={setCost}
              onFocus={() => setFocused('cost')}
              onBlur={() => setFocused(null)}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textWeak}
            />

            {/* Заметка */}
            <Text style={s.fieldLabel}>{t('service.noteField')}</Text>
            <TextInput
              style={[inputStyle('note'), s.inputMultiline]}
              value={note}
              onChangeText={setNote}
              onFocus={() => setFocused('note')}
              onBlur={() => setFocused(null)}
              placeholder="…"
              placeholderTextColor={colors.textWeak}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />

            {/* Кнопка подтверждения */}
            <TouchableOpacity
              style={s.confirmWrapper}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={gradient.accent.colors}
                start={gradient.accent.start}
                end={gradient.accent.end}
                style={s.confirmBtn}
              >
                <Text style={s.confirmBtnText}>
                  {saving ? '…' : t('service.confirmDone')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

function makeStyles(th: AppTheme, bottomInset: number) {
  const { colors, radius, typography } = th;
  return StyleSheet.create({
    overlay: {
      flex:            1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent:  'flex-end',
    },
    sheet: {
      backgroundColor:      colors.surface,
      borderTopLeftRadius:  20,
      borderTopRightRadius: 20,
      padding:              20,
      // safe-area: home indicator (iOS) и gesture/nav bar (Android edge-to-edge)
      paddingBottom:        Math.max(bottomInset, 16),
      maxHeight:            '85%',
    },
    header: {
      marginBottom: 20,
      paddingRight: 36,
    },
    title: {
      color:        colors.textPrimary,
      ...typography.screenTitle,
      marginBottom: 2,
    },
    subtitle: {
      color: colors.textSecondary,
      ...typography.label,
    },
    closeBtn: {
      position: 'absolute',
      right:    0,
      top:      0,
    },
    fieldLabel: {
      color:         colors.textSecondary,
      ...typography.labelSmall,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop:     12,
      marginBottom:  6,
    },
    input: {
      backgroundColor:   colors.background,
      borderRadius:      radius.card,
      borderWidth:       1,
      borderColor:       colors.border,
      paddingHorizontal: 16,
      paddingVertical:   13,
      color:             colors.textPrimary,
      ...typography.cardText,
    },
    inputFocused:    { borderColor: colors.borderAccent },
    inputError:      { borderColor: colors.statusDue.text },
    inputMultiline:  { minHeight: 68, paddingTop: 12 },
    errorText: {
      color:     colors.statusDue.text,
      fontSize:  12,
      marginTop: 4,
      marginBottom: 4,
    },
    inputText:        { color: colors.textPrimary, ...typography.cardText },
    inputPlaceholder: { color: colors.textWeak,    ...typography.cardText },
    dateRow: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
    },
    iosDoneBtn: {
      alignSelf:         'flex-end',
      paddingHorizontal: 16,
      paddingVertical:   4,
      marginBottom:      4,
    },
    iosDoneBtnText: { color: colors.accent, ...typography.cardTextMedium },
    confirmWrapper: { marginTop: 20 },
    confirmBtn: {
      borderRadius:    radius.card,
      paddingVertical: 16,
      alignItems:      'center',
    },
    confirmBtnText: { color: '#ffffff', ...typography.cardTextMedium },
  });
}
