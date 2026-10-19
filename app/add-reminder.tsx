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
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { reminderRepo, carRepo, settingsRepo, Car } from '@/db';
import { scheduleReminderNotifications } from '@/notifications/engine';
import { NO_ODOMETER } from '@/utils/reminders';
import DashStatModal, { StatRow } from '@/components/DashStatModal';
import { KEYBOARD_AVOIDING_BEHAVIOR, useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';

type ReminderType = 'mileage' | 'time';

// ─── Утилиты ────────────────────────────────────────────────────────────────

/** new Date() → 'YYYY-MM-DD' */
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

export default function AddReminderScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';

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

  // «Когда сделано в последний раз» — start_date/start_odometer (ТЗ 5.6).
  // По умолчанию — сегодня/текущий пробег (совпадает со старым поведением,
  // если пользователь поля не трогает), но можно указать прошлую точку —
  // например, замену масла, сделанную до того, как завели регламент.
  const [lastDoneDate, setLastDoneDate] = useState(new Date());
  const [datePick,     setDatePick]     = useState(false);
  const [lastOdo,      setLastOdo]      = useState('');

  // «Пробег при последнем выполнении» для type='time' — отдельное от lastOdo
  // состояние: необязательное информационное поле (не участвует в расчёте
  // срока/статуса), по умолчанию пустое, а не текущий пробег. Пустое значение
  // сохраняется как NO_ODOMETER (utils/reminders.ts) — колонка start_odometer/
  // last_odometer в БД остаётся NOT NULL, без миграции схемы.
  const [lastDoneOdoInfo, setLastDoneOdoInfo] = useState('');

  // ── UI-состояние ─────────────────────────────────────────────────────────
  const [car,         setCar]         = useState<Car | null>(null);
  const [focused,     setFocused]     = useState<string | null>(null);
  const [errors,      setErrors]      = useState<{
    name?: string;
    interval?: string;
    warn?: string;
    lastOdo?: string;
    lastOdoInfo?: string;
  }>({});
  const [saving,      setSaving]      = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [confirmRows, setConfirmRows] = useState<StatRow[]>([]);
  const [confirmTitle, setConfirmTitle] = useState('');

  const { scrollRef, onFieldFocus } = useKeyboardAwareScroll();

  // ── Загрузка машины (для дефолта/проверки «пробег при последней замене») ──
  useEffect(() => {
    carRepo.getCar().then((c) => {
      setCar(c);
      if (!isEdit) setLastOdo(String(c?.current_odometer ?? 0));
    }).catch((e) => console.error('[AddReminder] load car', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Загрузка данных при редактировании ────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    reminderRepo.getReminderById(editId!).then(r => {
      if (!r) { setLoadingEdit(false); return; }
      setName(r.title);
      setType(r.type as ReminderType);
      setInterval(String(r.type === 'mileage' ? (r.interval_km ?? '') : (r.interval_days ?? '')));
      setWarnBefore(String(r.warn_before));
      // Показываем ТЕКУЩЕЕ «последний раз сделано» (last_*, а не «застывшее»
      // start_*): если по регламенту уже есть реальные записи обслуживания,
      // last_* отражает именно их. Сохраняется это всё равно в start_* —
      // syncReminderFromRecords() сам решит, учитывать правку или нет
      // (см. комментарий в db/repositories/reminders.ts).
      setLastDoneDate(new Date(r.last_date + 'T00:00:00'));
      setLastOdo(String(r.last_odometer));
      // Необязательное поле только для type='time' — у регламента, заведённого
      // как mileage, здесь всегда «не указано», даже если last_odometer на
      // нём есть (это значение из ДРУГОГО поля, под другим пробегом).
      setLastDoneOdoInfo(
        r.type === 'time' && r.last_odometer !== NO_ODOMETER
          ? String(r.last_odometer)
          : ''
      );
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
    // «Пробег при последней замене» — допустим ниже текущего (замена была
    // в прошлом), но не выше: нельзя заменить масло на пробеге больше,
    // чем машина успела проехать к сегодняшнему дню.
    if (type === 'mileage') {
      const lo = parseInt(lastOdo.trim(), 10);
      const currentOdo = car?.current_odometer ?? 0;
      if (!lastOdo.trim() || isNaN(lo) || lo < 0 || lo > currentOdo) {
        errs.lastOdo = t('addReminder.errorLastOdo');
      }
    } else {
      // «Пробег при последнем выполнении» для type='time' — необязательное
      // поле, то же ограничение диапазона применяется, только если его
      // вообще заполнили.
      const trimmed = lastDoneOdoInfo.trim();
      if (trimmed) {
        const lo = parseInt(trimmed, 10);
        const currentOdo = car?.current_odometer ?? 0;
        if (isNaN(lo) || lo < 0 || lo > currentOdo) {
          errs.lastOdoInfo = t('addReminder.errorLastOdo');
        }
      }
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

      // start_date — всегда «когда сделано в последний раз» (для time это
      // и есть точка отсчёта интервала; для mileage используется только
      // вместе с start_odometer). Для mileage start_odometer обязателен; для
      // time он чисто информационный (в расчёт срока/статуса не входит —
      // utils/reminders.ts) и необязателен — пустое поле уходит как
      // NO_ODOMETER.
      const start_date     = toISO(lastDoneDate);
      const lastOdoInfoTrim = lastDoneOdoInfo.trim();
      const start_odometer = type === 'mileage'
        ? parseInt(lastOdo.trim(), 10)
        : (lastOdoInfoTrim ? parseInt(lastOdoInfoTrim, 10) : NO_ODOMETER);

      if (isEdit) {
        await reminderRepo.updateReminder(editId!, {
          title:         name.trim(),
          type,
          interval_km:   type === 'mileage' ? iv   : null,
          interval_days: type === 'time'    ? iv   : null,
          warn_before:   wb,
          start_date,
          start_odometer,
        });
      } else {
        // start_date/start_odometer переданы с формы — регламент может
        // стартовать не «в норме», а сразу «скоро»/«пора», если пользователь
        // указал прошлую дату/пробег последней замены. Если поля не трогали,
        // они равны сегодня/текущему пробегу — поведение как раньше (ТЗ 6.3).
        await reminderRepo.addReminder({
          car_id:        1,
          title:         name.trim(),
          type,
          interval_km:   type === 'mileage' ? iv   : null,
          interval_days: type === 'time'    ? iv   : null,
          warn_before:   wb,
          start_date,
          start_odometer,
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
      const [freshCar, settings] = await Promise.all([
        carRepo.getCar().catch(() => null),
        settingsRepo.getSettings().catch(() => null),
      ]);
      const notifOn    = settings?.notifications_enabled === 1;
      const currentOdo = freshCar?.current_odometer ?? 0;

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
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
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
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
          onFocus={(e) => { setFocused('name'); onFieldFocus(e); }}
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

        {/* ── Когда сделано в последний раз (start_date/start_odometer) ──── */}
        {type === 'time' ? (
          <>
            <Text style={s.fieldLabel}>{t('addReminder.lastDoneTime')}</Text>
            <TouchableOpacity
              style={[inputStyle('lastDate'), s.dateRow]}
              onPress={() => { setFocused('lastDate'); setDatePick(true); }}
              activeOpacity={0.8}
            >
              <Text style={s.inputText}>{toDisplay(lastDoneDate, locale)}</Text>
              <Text style={s.dateIcon}>📅</Text>
            </TouchableOpacity>

            {/* Необязательное — чисто информационное, в расчёт срока/статуса
                не входит (utils/reminders.ts). Пустое значение допустимо. */}
            <Text style={s.fieldLabel}>{t('addReminder.lastDoneTimeOdo')}</Text>
            <TextInput
              style={inputStyle('lastOdoInfo', !!errors.lastOdoInfo)}
              value={lastDoneOdoInfo}
              onChangeText={(v) => {
                setLastDoneOdoInfo(v);
                if (errors.lastOdoInfo) setErrors((p) => ({ ...p, lastOdoInfo: undefined }));
              }}
              onFocus={(e) => { setFocused('lastOdoInfo'); onFieldFocus(e); }}
              onBlur={()  => setFocused(null)}
              keyboardType="number-pad"
              placeholder="—"
              placeholderTextColor={colors.textWeak}
            />
            {errors.lastOdoInfo && <Text style={s.errorText}>{errors.lastOdoInfo}</Text>}
          </>
        ) : (
          <>
            <Text style={s.fieldLabel}>{t('addReminder.lastDoneMileageDate')}</Text>
            <TouchableOpacity
              style={[inputStyle('lastDate'), s.dateRow]}
              onPress={() => { setFocused('lastDate'); setDatePick(true); }}
              activeOpacity={0.8}
            >
              <Text style={s.inputText}>{toDisplay(lastDoneDate, locale)}</Text>
              <Text style={s.dateIcon}>📅</Text>
            </TouchableOpacity>

            <Text style={s.fieldLabel}>{t('addReminder.lastDoneMileageOdo')}</Text>
            <TextInput
              style={inputStyle('lastOdo', !!errors.lastOdo)}
              value={lastOdo}
              onChangeText={(v) => {
                setLastOdo(v);
                if (errors.lastOdo) setErrors((p) => ({ ...p, lastOdo: undefined }));
              }}
              onFocus={(e) => { setFocused('lastOdo'); onFieldFocus(e); }}
              onBlur={()  => setFocused(null)}
              keyboardType="number-pad"
              placeholder={String(car?.current_odometer ?? 0)}
              placeholderTextColor={colors.textWeak}
            />
            {errors.lastOdo && <Text style={s.errorText}>{errors.lastOdo}</Text>}
          </>
        )}

        {datePick && (
          <DateTimePicker
            value={lastDoneDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event: DateTimePickerEvent, d?: Date) => {
              if (Platform.OS === 'android') setDatePick(false);
              if (d && event.type !== 'dismissed') setLastDoneDate(d);
            }}
            maximumDate={new Date()}
          />
        )}
        {Platform.OS === 'ios' && datePick && (
          <TouchableOpacity
            style={s.doneBtn}
            onPress={() => { setDatePick(false); setFocused(null); }}
          >
            <Text style={s.doneBtnText}>{t('common.done')}</Text>
          </TouchableOpacity>
        )}

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
          onFocus={(e) => { setFocused('interval'); onFieldFocus(e); }}
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
          onFocus={(e) => { setFocused('warn'); onFieldFocus(e); }}
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

    // ── Дата «когда сделано в последний раз» ────────────────────────────────
    dateRow: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
    },
    inputText: { color: colors.textPrimary, ...typography.cardText },
    dateIcon:  { fontSize: 18 },
    doneBtn: {
      alignSelf:         'flex-end',
      paddingHorizontal: 16,
      paddingVertical:   4,
      marginBottom:      4,
    },
    doneBtnText: { color: colors.accent, ...typography.cardTextMedium },

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
