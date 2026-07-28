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

import { useEffect, useMemo, useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { reminderRepo, carRepo, settingsRepo } from '@/db';
import { scheduleReminderNotifications } from '@/notifications/engine';
import DashStatModal, { StatRow } from '@/components/DashStatModal';

type ReminderType = 'mileage' | 'time';

export default function AddReminderScreen() {
  const { t, i18n } = useTranslation();

  const th = useAppTheme();
  const { colors, radius, typography, gradient } = th;
  const s = useMemo(() => makeStyles(th), [th]);

  // ── Режим редактирования ──────────────────────────────────────────────────
  const params = useLocalSearchParams<{ editId?: string }>();
  const editId = params.editId ? parseInt(params.editId, 10) : null;
  const isEdit = editId !== null && !isNaN(editId);

  // ── Поля формы ────────────────────────────────────────────────────────────
  const [name,       setName]       = useState('');
  const [type,       setType]       = useState<ReminderType>('mileage');
  const [interval,   setInterval]   = useState('');
  const [warnBefore, setWarnBefore] = useState('');

  // ── UI-состояние ─────────────────────────────────────────────────────────
  const [focused,     setFocused]     = useState<string | null>(null);
  const [errors,      setErrors]      = useState<{
    name?: string;
    interval?: string;
    warn?: string;
  }>({});
  const [saving,      setSaving]      = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [confirmRows, setConfirmRows] = useState<StatRow[]>([]);
  const [confirmTitle, setConfirmTitle] = useState('');

  // ── Загрузка данных при редактировании ────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    reminderRepo.getReminderById(editId!).then(r => {
      if (!r) { setLoadingEdit(false); return; }
      setName(r.title);
      setType(r.type as ReminderType);
      setInterval(String(r.type === 'mileage' ? (r.interval_km ?? '') : (r.interval_days ?? '')));
      setWarnBefore(String(r.warn_before));
      setLoadingEdit(false);
    }).catch(e => {
      console.error('[AddReminder] load edit', e);
      setLoadingEdit(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      if (isEdit) {
        await reminderRepo.updateReminder(editId!, {
          title:         name.trim(),
          type,
          interval_km:   type === 'mileage' ? iv   : null,
          interval_days: type === 'time'    ? iv   : null,
          warn_before:   wb,
        });
      } else {
        // last_odometer / last_date не передаём: репозиторий сам ставит
        // текущий пробег и сегодняшнюю дату, чтобы новый регламент
        // стартовал «в норме» с полным интервалом (ТЗ 6.3).
        await reminderRepo.addReminder({
          car_id:        1,
          title:         name.trim(),
          type,
          interval_km:   type === 'mileage' ? iv   : null,
          interval_days: type === 'time'    ? iv   : null,
          warn_before:   wb,
        });
      }

      // Расписание уведомлений пересобираем сразу: оно зависит от статусов
      // регламентов, а те только что изменились. Без этого новый регламент
      // молчал бы до ближайшего пересчёта одометра или рестарта приложения.
      // Не блокируем показ модалки: сбой планировщика не должен «съесть»
      // уже сохранённый регламент.
      scheduleReminderNotifications()
        .catch((e) => console.error('[notif] reschedule after reminder save', e));

      // ── Модалка-подтверждение ────────────────────────────────────────────
      const [car, settings] = await Promise.all([
        carRepo.getCar().catch(() => null),
        settingsRepo.getSettings().catch(() => null),
      ]);
      const notifOn   = settings?.notifications_enabled === 1;
      const locale    = i18n.language === 'ru' ? 'ru-RU' : 'en-US';
      const currentOdo = car?.current_odometer ?? 0;

      const rows: StatRow[] = [];

      rows.push({
        label: t('addReminder.confirmInterval'),
        value: type === 'mileage'
          ? t('addReminder.confirmEveryKm',   { n: iv.toLocaleString() })
          : t('addReminder.confirmEveryDays', { n: String(iv) }),
      });

      rows.push({
        label: t('addReminder.confirmWarn'),
        value: type === 'mileage'
          ? t('addReminder.confirmWarnKm',   { n: wb.toLocaleString() })
          : t('addReminder.confirmWarnDays', { n: String(wb) }),
      });

      if (type === 'mileage') {
        const warnOdo = currentOdo + iv - wb;
        rows.push({
          label: t('addReminder.confirmFireLabel'),
          value: t('addReminder.confirmFireOdo', { n: warnOdo.toLocaleString() }),
        });
      } else {
        // Вычисляем дату первого уведомления относительно сегодня
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const fireDays = iv - wb;
        const fireBase = fireDays > 0
          ? new Date(todayStart.getTime() + fireDays * 86_400_000)
          : new Date(todayStart);
        fireBase.setHours(9, 0, 0, 0);
        if (fireBase.getTime() <= Date.now()) {
          fireBase.setDate(fireBase.getDate() + 1);
        }
        const dateStr = fireBase
          .toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
          .replace(/\s*г\.\s*$/, '');
        rows.push({
          label: t('addReminder.confirmFireLabel'),
          value: t('addReminder.confirmFireTime', { date: dateStr }),
        });
      }

      if (!notifOn) {
        rows.push({
          label:      '',
          value:      t('addReminder.confirmNoNotif'),
          valueColor: colors.statusDue.text,
        });
      }

      setConfirmTitle(name.trim());
      setConfirmRows(rows);
    } catch (e) {
      console.error('[AddReminder]', e);
      setSaving(false);
    }
  }

  function handleConfirmClose() {
    router.back();
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

  if (loadingEdit) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={s.fieldLabel}>{t('common.loading')}</Text>
      </View>
    );
  }

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
        <Text style={s.headerTitle}>
          {isEdit ? t('addReminder.editTitle') : t('addReminder.title')}
        </Text>
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
              {saving ? '…' : (isEdit ? t('addReminder.editSaveBtn') : t('addReminder.saveBtn'))}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Подтверждение сохранения ──────────────────────────────────────── */}
      <DashStatModal
        visible={confirmRows.length > 0}
        onClose={handleConfirmClose}
        title={confirmTitle}
        icon="alarm-outline"
        iconBg={colors.activeCard}
        iconColor={colors.accent}
        rows={confirmRows}
        actionLabel={t('addReminder.confirmOk')}
        actionIcon="checkmark-circle-outline"
        onAction={handleConfirmClose}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Стили ───────────────────────────────────────────────────────────────────

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
}
