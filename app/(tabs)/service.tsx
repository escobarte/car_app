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

import { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { formatMoney } from '@/constants/currencies';
import {
  carRepo, serviceRepo, reminderRepo,
  Car, ServiceRecord, Reminder,
} from '@/db';
import {
  calcReminderRow, STATUS_ORDER,
  type StatusKind, type ReminderRow,
} from '@/utils/reminders';
import MarkDoneSheet from '@/components/MarkDoneSheet';
import ReminderDetailModal from '@/components/ReminderDetailModal';
import SettingsGearBtn from '@/components/SettingsGearBtn';

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function ServiceScreen() {
  const { t } = useTranslation();

  const th = useAppTheme();
  const { colors, radius, typography, gradient } = th;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(th, insets.top), [th, insets.top]);

  // ── Вспомогательные цвета ───────────────────────────────────────────────────

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

  // ── Основные данные ───────────────────────────────────────────────────────
  const [car,     setCar]     = useState<Car | null>(null);
  const [rows,    setRows]    = useState<ReminderRow[]>([]);
  const [history, setHistory] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Bottom-sheet «Отметить выполнение»
  const [doneTarget, setDoneTarget] = useState<Reminder | null>(null);

  // Модалка деталей регламента
  const [selectedRow,   setSelectedRow]   = useState<ReminderRow | null>(null);
  const [showDetail,    setShowDetail]    = useState(false);
  const [detailHistory, setDetailHistory] = useState<ServiceRecord[]>([]);

  // ── Загрузка данных ───────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
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
    setHistory(records.slice(0, 10)); // последние 10
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      loadData()
        .catch(console.error)
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [loadData])
  );

  // ── Обработчики модалки деталей ──────────────────────────────────────────

  async function handleCardPress(row: ReminderRow) {
    setSelectedRow(row);
    const hist = await serviceRepo.getServiceRecordsByReminder(row.reminder.id!);
    setDetailHistory(hist);
    setShowDetail(true);
  }

  function handleDetailEdit(id: number) {
    setShowDetail(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(`/add-reminder?editId=${id}` as any);
  }

  async function handleDetailDelete(id: number) {
    try {
      await reminderRepo.deleteReminder(id);
    } catch (e) {
      console.error('[ServiceScreen] deleteReminder', e);
      return;
    }
    setShowDetail(false);
    setSelectedRow(null);
    loadData().catch(console.error);
  }

  function handleDetailDone(reminder: Reminder) {
    setShowDetail(false);
    setDoneTarget(reminder);
  }

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
          <SettingsGearBtn />
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
              <TouchableOpacity
                key={reminder.id}
                style={s.reminderCard}
                onPress={() => handleCardPress(row)}
                activeOpacity={0.85}
              >
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
                    onPress={() => setDoneTarget(reminder)}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={gradient.accent.colors}
                      start={gradient.accent.start}
                      end={gradient.accent.end}
                      style={s.doneBtn}
                    >
                      <Text style={s.doneBtnText} numberOfLines={1}>{t('service.doneBtn')}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
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
                      {formatMoney(rec.cost, car?.currency ?? '')}
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

      {/* Bottom-Sheet «Отметить выполнение» — единый компонент с Dashboard */}
      <MarkDoneSheet
        reminder={doneTarget}
        car={car}
        onClose={() => setDoneTarget(null)}
        onSaved={() => { loadData().catch(console.error); }}
      />

      {/* Модалка деталей регламента */}
      <ReminderDetailModal
        visible={showDetail}
        onClose={() => setShowDetail(false)}
        row={selectedRow}
        history={detailHistory}
        car={car}
        onEdit={handleDetailEdit}
        onDelete={handleDetailDelete}
        onDone={handleDetailDone}
      />
    </View>
  );
}

// ─── Стили ───────────────────────────────────────────────────────────────────

function makeStyles(th: AppTheme, topInset: number) {
  const { colors, radius, typography } = th;
  return StyleSheet.create({
    // root: фон под status bar + safe-area paddingTop у внешнего контейнера,
    // чтобы при скролле контент не уезжал под полупрозрачный status bar.
    root:  { flex: 1, backgroundColor: colors.background, paddingTop: topInset },
    scroll: { flex: 1 },
    content: {
      padding:       16,
      paddingTop:    16,
      paddingBottom: 40,
    },
    center: {
      flex: 1, justifyContent: 'center', alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: { color: colors.textSecondary, ...typography.cardText },

    // ── Шапка ────────────────────────────────────────────────────────────────
    topRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      marginBottom:   20,
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
  });
}
