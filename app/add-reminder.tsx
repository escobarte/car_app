/**
 * Форма добавления нового регламента — Этап 6.
 * Разделы ТЗ: 4.4, 5.6.
 *
 * Поля:
 *  1. Название (обязательно)
 *  2. Тип: По пробегу / По времени (переключатель)
 *  3. Интервал: км (mileage) или дней (time)
 *  4. Предупреждать за: км или дней
 *  5. Кнопка сохранения
 */

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';

import { theme } from '@/constants/theme';
import { reminderRepo } from '@/db';

const { colors, radius, typography, gradient } = theme;

type ReminderType = 'mileage' | 'time';

export default function AddReminderScreen() {
  const { t } = useTranslation();

  // ── Поля формы ────────────────────────────────────────────────────────────
  const [name,       setName]       = useState('');
  const [type,       setType]       = useState<ReminderType>('mileage');
  const [interval,   setInterval]   = useState('');
  const [warnBefore, setWarnBefore] = useState('');

  // ── UI-состояние ─────────────────────────────────────────────────────────
  const [focused, setFocused] = useState<string | null>(null);
  const [errors,  setErrors]  = useState<{
    name?: string;
    interval?: string;
    warn?: string;
  }>({});
  const [saving, setSaving] = useState(false);

  // ── Валидация ────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!name.trim()) {
      errs.name = t('addReminder.errorName');
    }
    const iv = parseInt(interval.trim(), 10);
    if (isNaN(iv) || iv <= 0) {
      errs.interval = t('addReminder.errorInterval');
    }
    const wb = parseInt(warnBefore.trim(), 10);
    if (isNaN(wb) || wb < 0) {
      errs.warn = t('addReminder.errorWarn');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Сохранение ───────────────────────────────────────────────────────────

  async function handleSave() {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      const iv = parseInt(interval.trim(), 10);
      const wb = parseInt(warnBefore.trim(), 10);
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const todayStr = `${y}-${m}-${d}`;

      await reminderRepo.addReminder({
        car_id:        1,
        title:         name.trim(),
        type,
        interval_km:   type === 'mileage' ? iv   : null,
        interval_days: type === 'time'    ? iv   : null,
        last_odometer: 0,
        last_date:     todayStr,
        warn_before:   wb,
      });
      router.back();
    } catch (e) {
      console.error('[AddReminder]', e);
      setSaving(false);
    }
  }

  // ── Стиль поля ─────────────────────────────────────────────────────────────

  function inputStyle(field: string, hasError = false) {
    return [
      s.input,
      focused === field  ? s.inputFocused : undefined,
      hasError            ? s.inputError  : undefined,
    ];
  }

  // ── Рендер ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Шапка ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('addReminder.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Название ─────────────────────────────────────────────────── */}
        <Text style={s.fieldLabel}>{t('addReminder.name')}</Text>
        <TextInput
          style={inputStyle('name', !!errors.name)}
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
          }}
          onFocus={() => setFocused('name')}
          onBlur={()  => setFocused(null)}
          placeholder={t('addReminder.namePlaceholder')}
          placeholderTextColor={colors.textWeak}
          returnKeyType="next"
        />
        {errors.name && <Text style={s.errorText}>{errors.name}</Text>}

        {/* ── Тип регламента ────────────────────────────────────────────── */}
        <Text style={s.fieldLabel}>{t('addReminder.typeLabel')}</Text>
        <View style={s.typeRow}>
          <TouchableOpacity
            style={[s.typeBtn, type === 'mileage' && s.typeBtnActive]}
            onPress={() => setType('mileage')}
            activeOpacity={0.8}
          >
            <Text style={[s.typeBtnText, type === 'mileage' && s.typeBtnTextActive]}>
              {t('addReminder.typeMileage')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.typeBtn, type === 'time' && s.typeBtnActive]}
            onPress={() => setType('time')}
            activeOpacity={0.8}
          >
            <Text style={[s.typeBtnText, type === 'time' && s.typeBtnTextActive]}>
              {t('addReminder.typeTime')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Интервал ─────────────────────────────────────────────────── */}
        <Text style={s.fieldLabel}>
          {type === 'mileage'
            ? t('addReminder.intervalKm')
            : t('addReminder.intervalDays')}
        </Text>
        <TextInput
          style={inputStyle('interval', !!errors.interval)}
          value={interval}
          onChangeText={(v) => {
            setInterval(v);
            if (errors.interval) setErrors((p) => ({ ...p, interval: undefined }));
          }}
          onFocus={() => setFocused('interval')}
          onBlur={()  => setFocused(null)}
          keyboardType="number-pad"
          placeholder={type === 'mileage' ? '8000' : '365'}
          placeholderTextColor={colors.textWeak}
          returnKeyType="next"
        />
        {errors.interval && <Text style={s.errorText}>{errors.interval}</Text>}

        {/* ── Предупреждать за ─────────────────────────────────────────── */}
        <Text style={s.fieldLabel}>
          {t('addReminder.warnBefore')}
          {' — '}
          {type === 'mileage'
            ? t('addReminder.warnKm')
            : t('addReminder.warnDays')}
        </Text>
        <TextInput
          style={inputStyle('warn', !!errors.warn)}
          value={warnBefore}
          onChangeText={(v) => {
            setWarnBefore(v);
            if (errors.warn) setErrors((p) => ({ ...p, warn: undefined }));
          }}
          onFocus={() => setFocused('warn')}
          onBlur={()  => setFocused(null)}
          keyboardType="number-pad"
          placeholder={type === 'mileage' ? '500' : '14'}
          placeholderTextColor={colors.textWeak}
        />
        {errors.warn && <Text style={s.errorText}>{errors.warn}</Text>}

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
              {saving ? '…' : t('addReminder.saveBtn')}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Стили ───────────────────────────────────────────────────────────────────

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
  headerTitle:  {
    flex: 1, textAlign: 'center',
    color: colors.textPrimary, ...typography.screenTitle,
  },
  headerSpacer: { width: 36 },

  content: {
    paddingHorizontal: 16,
    paddingTop:        20,
    paddingBottom:     48,
  },

  // ── Поля ввода ──────────────────────────────────────────────────────────
  fieldLabel: {
    color:         colors.textSecondary,
    ...typography.labelSmall,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop:     16,
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
  inputFocused: { borderColor: colors.borderAccent },
  inputError:   { borderColor: colors.statusDue.text },

  // ── Переключатель типа ──────────────────────────────────────────────────
  typeRow: {
    flexDirection: 'row',
    gap:           8,
  },
  typeBtn: {
    flex:              1,
    paddingVertical:   13,
    borderRadius:      radius.card,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
    alignItems:        'center',
  },
  typeBtnActive: {
    borderColor:     colors.borderAccent,
    backgroundColor: colors.activeCard,
  },
  typeBtnText: {
    color:      colors.textSecondary,
    ...typography.cardText,
  },
  typeBtnTextActive: { color: colors.accent },

  // ── Ошибка ─────────────────────────────────────────────────────────────
  errorText: {
    color:     colors.statusDue.text,
    ...typography.labelSmall,
    marginTop: 2,
    marginBottom: 4,
  },

  // ── Кнопка сохранения ───────────────────────────────────────────────────
  saveWrapper: { marginTop: 32 },
  saveBtn: {
    borderRadius:    radius.card,
    paddingVertical: 16,
    alignItems:      'center',
  },
  saveBtnText: { color: '#ffffff', ...typography.cardTextMedium },
});
