/**
 * Экран обслуживания — Этап 6.
 * Разделы ТЗ: 4.4, 5.5, 5.6, 6.3.
 * Дизайн: docs/дизайн_система.md.
 *
 * Блоки сверху вниз:
 *  1. Список регламентов — карточка для каждого:
 *     - Заголовок + иконка типа
 *     - Прогресс-бар (цвет по статусу)
 *     - Остаток / просрочка + статус-бейдж
 *     - Интервал + порог предупреждения
 *     - Кнопка «Сделано»
 *  2. Секция «История работ» — последние записи SERVICE_RECORD
 *  3. «+ Добавить регламент» → /add-reminder
 *
 * Модальное окно «Сделано»:
 *  - Дата, пробег, стоимость (необяз.), заметка (необяз.)
 *  - Создаёт SERVICE_RECORD + сбрасывает last_odometer/last_date регламента
 */

import { useCallback, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { theme } from '@/constants/theme';
import { currencySymbol } from '@/constants/currencies';
import {
  carRepo, serviceRepo, reminderRepo,
  Car, ServiceRecord, Reminder,
} from '@/db';
import {
  calcReminderRow, STATUS_ORDER,
  type StatusKind, type ReminderRow,
} from '@/utils/reminders';

const { colors, radius, typography, gradient } = theme;

// ─── Утилиты ────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function toDisplay(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseNum(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

// ─── Вспомогательные цвета ───────────────────────────────────────────────────

const STATUS_TEXT: Record<StatusKind, string> = {
  due:  colors.statusDue.text,
  soon: colors.statusSoon.text,
  ok:   colors.statusOk.text,
};
const STATUS_BG: Record<StatusKind, string> = {
  due:  colors.statusDue.background,
  soon: colors.statusSoon.background,
  ok:   colors.statusOk.background,
};
const STATUS_BAR: Record<StatusKind, string> = {
  due:  colors.statusDue.bar,
  soon: colors.statusSoon.bar,
  ok:   colors.statusOk.bar,
};

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function ServiceScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';

  // ── Основные данные ───────────────────────────────────────────────────────
  const [car,     setCar]     = useState<Car | null>(null);
  const [rows,    setRows]    = useState<ReminderRow[]>([]);
  const [history, setHistory] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Модальное окно «Сделано» ───────────────────────────────────────────────
  const [doneTarget,   setDoneTarget]   = useState<Reminder | null>(null);
  const [doneDate,     setDoneDate]     = useState(new Date());
  const [doneDatePick, setDoneDatePick] = useState(false);
  const [doneOdo,      setDoneOdo]      = useState('');
  const [doneCost,     setDoneCost]     = useState('');
  const [doneNote,     setDoneNote]     = useState('');
  const [doneSaving,   setDoneSaving]   = useState(false);
  const [doneFocused,  setDoneFocused]  = useState<string | null>(null);

  // ── Загрузка данных ───────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);
        const [carData, reminders, records] = await Promise.all([
          carRepo.getCar(),
          reminderRepo.getAllReminders(),
          serviceRepo.getAllServiceRecords(),
        ]);
        if (!active) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const odo = carData?.current_odometer ?? 0;

        const computed = reminders
          .map((r) => calcReminderRow(r, odo, today))
          .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

        setCar(carData);
        setRows(computed);
        setHistory(records.slice(0, 10)); // последние 10
        setLoading(false);
      }

      load().catch(console.error);
      return () => { active = false; };
    }, [])
  );

  // ── Текст остатка ─────────────────────────────────────────────────────────

  function remainingLabel(row: ReminderRow): string {
    const n = Math.abs(row.remaining);
    if (row.unit === 'km') {
      return row.remaining <= 0
        ? t('service.overdueKm',     { n })
        : t('service.remainingKm',   { n });
    }
    return row.remaining <= 0
      ? t('service.overdueDays',  { n })
      : t('service.remainingDays',{ n });
  }

  // ── Текст интервала ───────────────────────────────────────────────────────

  function intervalLabel(row: ReminderRow): string {
    const r = row.reminder;
    if (r.type === 'mileage') {
      return `${t('service.intervalKm', { n: r.interval_km?.toLocaleString() ?? '' })} · ${t('service.warnBeforeKm', { n: r.warn_before })}`;
    }
    return `${t('service.intervalDays', { n: r.interval_days ?? '' })} · ${t('service.warnBeforeDays', { n: r.warn_before })}`;
  }

  // ── Открыть модалку «Сделано» ─────────────────────────────────────────────

  function openDoneModal(reminder: Reminder) {
    setDoneTarget(reminder);
    setDoneDate(new Date());
    setDoneOdo(String(car?.current_odometer ?? ''));
    setDoneCost('');
    setDoneNote('');
    setDoneFocused(null);
  }

  function closeDoneModal() {
    setDoneTarget(null);
  }

  // ── Сохранить «Сделано» ───────────────────────────────────────────────────

  async function handleDoneSave() {
    if (!doneTarget || doneSaving) return;
    setDoneSaving(true);
    try {
      const dateStr = toISO(doneDate);
      const odoNum  = doneOdo.trim() ? parseInt(doneOdo.trim(), 10) : (car?.current_odometer ?? 0);
      const costNum = doneCost.trim() ? parseNum(doneCost) : 0;

      // 1. Создаём запись SERVICE_RECORD
      await serviceRepo.addServiceRecord({
        car_id:      1,
        reminder_id: doneTarget.id,
        date:        dateStr,
        odometer:    isNaN(odoNum) ? 0 : odoNum,
        cost:        isNaN(costNum) ? 0 : costNum,
        note:        doneNote.trim(),
      });

      // 2. Сбрасываем счётчик регламента (ТЗ 6.3)
      await reminderRepo.resetReminder(
        doneTarget.id,
        isNaN(odoNum) ? 0 : odoNum,
        dateStr
      );

      // 3. Обновляем список
      setDoneTarget(null);

      const [carData, reminders, records] = await Promise.all([
        carRepo.getCar(),
        reminderRepo.getAllReminders(),
        serviceRepo.getAllServiceRecords(),
      ]);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const odo = carData?.current_odometer ?? 0;
      const computed = reminders
        .map((r) => calcReminderRow(r, odo, today))
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
      setCar(carData);
      setRows(computed);
      setHistory(records.slice(0, 10));
    } catch (e) {
      console.error('[Service.handleDoneSave]', e);
    } finally {
      setDoneSaving(false);
    }
  }

  // ── Стиль поля ввода в модалке ────────────────────────────────────────────

  function modalInputStyle(field: string) {
    return [s.modalInput, doneFocused === field && s.modalInputFocused];
  }

  const sym = currencySymbol(car?.currency ?? '');

  // ── Загрузка ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <Text style={s.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  // ── Рендер ────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Шапка ──────────────────────────────────────────────────────── */}
        <View style={s.topRow}>
          <Text style={s.screenTitle}>{t('service.title')}</Text>
        </View>

        {/* ── Список регламентов ─────────────────────────────────────────── */}
        {rows.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="construct-outline" size={36} color={colors.textWeak} />
            <Text style={s.emptyText}>{t('service.noReminders')}</Text>
          </View>
        ) : (
          rows.map((row) => {
            const { reminder, progress, status } = row;
            const textColor = STATUS_TEXT[status];
            const bgColor   = STATUS_BG[status];
            const barColor  = STATUS_BAR[status];
            const pctFill   = `${Math.round(progress * 100)}%` as `${number}%`;

            return (
              <View key={reminder.id} style={s.reminderCard}>
                {/* ── Заголовок карточки ────────────────────────────────── */}
                <View style={s.cardHeader}>
                  <View style={s.cardTitleRow}>
                    <Ionicons
                      name={reminder.type === 'mileage' ? 'speedometer-outline' : 'time-outline'}
                      size={18}
                      color={colors.textSecondary}
                      style={{ marginRight: 8 }}
                    />
                    <Text style={s.cardTitle} numberOfLines={1}>
                      {reminder.title}
                    </Text>
                  </View>
                  {/* Статус-бейдж */}
                  <View style={[s.statusBadge, { backgroundColor: bgColor }]}>
                    <Text style={[s.statusText, { color: textColor }]}>
                      {t(`status.${status}`)}
                    </Text>
                  </View>
                </View>

                {/* ── Прогресс-бар ──────────────────────────────────────── */}
                <View style={s.progressTrack}>
                  <View
                    style={[s.progressFill, { width: pctFill, backgroundColor: barColor }]}
                  />
                </View>

                {/* ── Детали ────────────────────────────────────────────── */}
                <View style={s.cardDetails}>
                  <View>
                    <Text style={[s.remainingText, { color: textColor }]}>
                      {remainingLabel(row)}
                    </Text>
                    <Text style={s.intervalText}>{intervalLabel(row)}</Text>
                  </View>

                  {/* Кнопка «Сделано» */}
                  <TouchableOpacity
                    onPress={() => openDoneModal(reminder)}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={gradient.accent.colors}
                      start={gradient.accent.start}
                      end={gradient.accent.end}
                      style={s.doneBtn}
                    >
                      <Text style={s.doneBtnText}>{t('service.doneBtn')}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* ── История работ ─────────────────────────────────────────────── */}
        <Text style={s.sectionHeader}>{t('service.history')}</Text>

        {history.length === 0 ? (
          <View style={s.historyCard}>
            <Text style={s.noHistoryText}>{t('service.noHistory')}</Text>
          </View>
        ) : (
          <View style={s.historyCard}>
            {history.map((rec, idx) => {
              // Имя регламента (если есть связь)
              const reminderTitle = rec.reminder_id
                ? rows.find((r) => r.reminder.id === rec.reminder_id)?.reminder.title
                : null;

              return (
                <View
                  key={rec.id}
                  style={[s.historyRow, idx < history.length - 1 && s.historyBorder]}
                >
                  <View style={s.historyLeft}>
                    <Text style={s.historyTitle} numberOfLines={1}>
                      {rec.note || reminderTitle || '—'}
                    </Text>
                    <Text style={s.historyMeta}>
                      {rec.date}
                      {rec.odometer > 0 ? `  ·  ${rec.odometer.toLocaleString()} ${t('common.km')}` : ''}
                    </Text>
                  </View>
                  {rec.cost > 0 && (
                    <Text style={s.historyCost}>
                      {rec.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sym}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── «+ Добавить регламент» ─────────────────────────────────────── */}
        <TouchableOpacity
          style={s.addReminderBtn}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/add-reminder' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} style={{ marginRight: 6 }} />
          <Text style={s.addReminderText}>{t('service.addReminder')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Модальное окно «Сделано» ───────────────────────────────────────── */}
      <Modal
        visible={doneTarget !== null}
        animationType="slide"
        transparent
        onRequestClose={closeDoneModal}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {/* Заголовок */}
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {t('service.markDoneTitle')}
              </Text>
              <Text style={s.modalSubtitle} numberOfLines={1}>
                {doneTarget?.title ?? ''}
              </Text>
              <TouchableOpacity
                onPress={closeDoneModal}
                style={s.modalCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Дата */}
              <Text style={s.modalFieldLabel}>{t('service.dateField')}</Text>
              <TouchableOpacity
                style={modalInputStyle('date')}
                onPress={() => setDoneDatePick(true)}
                activeOpacity={0.8}
              >
                <View style={s.dateRow}>
                  <Text style={s.modalInputText}>{toDisplay(doneDate, locale)}</Text>
                  <Text style={{ fontSize: 18 }}>📅</Text>
                </View>
              </TouchableOpacity>
              {doneDatePick && (
                <DateTimePicker
                  value={doneDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_: DateTimePickerEvent, d?: Date) => {
                    if (Platform.OS === 'android') setDoneDatePick(false);
                    if (d) setDoneDate(d);
                  }}
                  maximumDate={new Date()}
                />
              )}
              {Platform.OS === 'ios' && doneDatePick && (
                <TouchableOpacity
                  style={s.iosDoneBtn}
                  onPress={() => setDoneDatePick(false)}
                >
                  <Text style={s.iosDoneBtnText}>{t('common.done')}</Text>
                </TouchableOpacity>
              )}

              {/* Пробег */}
              <Text style={s.modalFieldLabel}>{t('service.odoField')}</Text>
              <TextInput
                style={modalInputStyle('odo')}
                value={doneOdo}
                onChangeText={setDoneOdo}
                onFocus={() => setDoneFocused('odo')}
                onBlur={() => setDoneFocused(null)}
                keyboardType="number-pad"
                placeholder={String(car?.current_odometer ?? 0)}
                placeholderTextColor={colors.textWeak}
              />

              {/* Стоимость */}
              <Text style={s.modalFieldLabel}>{t('service.costField')}{sym ? `, ${sym}` : ''}</Text>
              <TextInput
                style={modalInputStyle('cost')}
                value={doneCost}
                onChangeText={setDoneCost}
                onFocus={() => setDoneFocused('cost')}
                onBlur={() => setDoneFocused(null)}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textWeak}
              />

              {/* Заметка */}
              <Text style={s.modalFieldLabel}>{t('service.noteField')}</Text>
              <TextInput
                style={[modalInputStyle('note'), s.modalInputMultiline]}
                value={doneNote}
                onChangeText={setDoneNote}
                onFocus={() => setDoneFocused('note')}
                onBlur={() => setDoneFocused(null)}
                placeholder="…"
                placeholderTextColor={colors.textWeak}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />

              {/* Кнопка подтверждения */}
              <TouchableOpacity
                style={s.confirmWrapper}
                onPress={handleDoneSave}
                disabled={doneSaving}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={gradient.accent.colors}
                  start={gradient.accent.start}
                  end={gradient.accent.end}
                  style={s.confirmBtn}
                >
                  <Text style={s.confirmBtnText}>
                    {doneSaving ? '…' : t('service.confirmDone')}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Стили ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: {
    padding:       16,
    paddingTop:    Platform.OS === 'ios' ? 56 : 48,
    paddingBottom: 40,
  },
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: { color: colors.textSecondary, ...typography.cardText },

  // ── Шапка ────────────────────────────────────────────────────────────────
  topRow: {
    marginBottom: 20,
  },
  screenTitle: {
    color: colors.textPrimary,
    ...typography.screenTitle,
  },

  // ── Карточка регламента ───────────────────────────────────────────────────
  reminderCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.card,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         16,
    marginBottom:    12,
  },
  cardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    flex:          1,
    marginRight:   8,
  },
  cardTitle: {
    color:      colors.textPrimary,
    ...typography.cardTextMedium,
    flex:       1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius:      radius.badge,
    flexShrink:        0,
  },
  statusText: {
    fontSize:   11,
    fontWeight: '500' as const,
  },

  // ── Прогресс-бар ─────────────────────────────────────────────────────────
  progressTrack: {
    height:          6,
    borderRadius:    3,
    backgroundColor: colors.border,
    marginBottom:    12,
    overflow:        'hidden',
  },
  progressFill: {
    height:       6,
    borderRadius: 3,
  },

  // ── Детали карточки ───────────────────────────────────────────────────────
  cardDetails: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  remainingText: {
    fontSize:     14,
    fontWeight:   '500' as const,
    marginBottom: 2,
  },
  intervalText: {
    color:    colors.textWeak,
    fontSize: 11,
    fontWeight: '400' as const,
  },
  doneBtn: {
    paddingHorizontal: 16,
    paddingVertical:    9,
    borderRadius:      radius.badge + 3,
  },
  doneBtnText: {
    color:      '#ffffff',
    fontSize:   13,
    fontWeight: '500' as const,
  },

  // ── Пустое состояние ─────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.card,
    paddingVertical: 40,
    alignItems:      'center',
    gap:             12,
    marginBottom:    16,
  },
  emptyText: {
    color:     colors.textSecondary,
    ...typography.cardText,
    textAlign: 'center',
  },

  // ── История работ ─────────────────────────────────────────────────────────
  sectionHeader: {
    color:         colors.textWeak,
    ...typography.sectionHeader,
    textTransform: 'uppercase',
    marginBottom:  8,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.card,
    paddingVertical: 4,
    marginBottom:    16,
  },
  historyRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingVertical:   13,
    paddingHorizontal: 14,
  },
  historyBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyLeft: { flex: 1, marginRight: 8 },
  historyTitle: {
    color:        colors.textPrimary,
    ...typography.cardText,
    marginBottom: 2,
  },
  historyMeta: {
    color: colors.textSecondary,
    ...typography.label,
  },
  historyCost: {
    color:      colors.textSecondary,
    ...typography.label,
    flexShrink: 0,
  },
  noHistoryText: {
    color:   colors.textSecondary,
    ...typography.cardText,
    padding: 14,
  },

  // ── Кнопка «+ Добавить регламент» ────────────────────────────────────────
  addReminderBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: colors.surface,
    borderRadius:    radius.card,
    borderWidth:     1,
    borderColor:     colors.border,
    paddingVertical: 14,
    marginBottom:    8,
  },
  addReminderText: {
    color:      colors.accent,
    ...typography.cardText,
  },

  // ── Модальное окно «Сделано» ──────────────────────────────────────────────
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent:  'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    padding:         20,
    paddingBottom:   Platform.OS === 'ios' ? 36 : 20,
    maxHeight:       '85%',
  },
  modalHeader: {
    marginBottom: 20,
    paddingRight: 36, // для кнопки закрытия
  },
  modalTitle: {
    color:        colors.textPrimary,
    ...typography.screenTitle,
    marginBottom: 2,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    ...typography.label,
  },
  modalCloseBtn: {
    position: 'absolute',
    right:    0,
    top:      0,
  },
  modalFieldLabel: {
    color:         colors.textSecondary,
    ...typography.labelSmall,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop:     12,
    marginBottom:  6,
  },
  modalInput: {
    backgroundColor:   colors.background,
    borderRadius:      radius.card,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingHorizontal: 16,
    paddingVertical:   13,
    color:             colors.textPrimary,
    ...typography.cardText,
  },
  modalInputFocused: { borderColor: colors.borderAccent },
  modalInputMultiline: { minHeight: 68, paddingTop: 12 },
  modalInputText:  { color: colors.textPrimary, ...typography.cardText },

  dateRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },

  iosDoneBtn: {
    alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 4, marginBottom: 4,
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
