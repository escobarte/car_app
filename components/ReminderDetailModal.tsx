import { useMemo } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { formatMoney } from '@/constants/currencies';
import { Car, ServiceRecord, Reminder } from '@/db';
import { type ReminderRow, type StatusKind } from '@/utils/reminders';

// ─── Пропсы ───────────────────────────────────────────────────────────────────

type Props = {
  visible:  boolean;
  onClose:  () => void;
  row:      ReminderRow | null;
  history:  ServiceRecord[];
  car:      Car | null;
  onEdit:   (id: number) => void;
  onDelete: (id: number) => void;
  onDone:   (reminder: Reminder) => void;
};

// ─── Компонент ────────────────────────────────────────────────────────────────

export default function ReminderDetailModal({
  visible, onClose, row, history, car, onEdit, onDelete, onDone,
}: Props) {
  const { t } = useTranslation();
  const th = useAppTheme();
  const { colors, radius, typography, gradient } = th;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(th, insets.bottom), [th, insets.bottom]);

  if (!row) return null;
  const { reminder, remaining, unit, status } = row;

  const STATUS_TEXT: Record<StatusKind, string> = {
    due:  colors.statusDue.text,
    soon: colors.statusSoon.text,
    ok:   colors.statusOk.text,
  };

  const remainingText = (() => {
    const n = Math.abs(remaining);
    if (unit === 'km') {
      return remaining <= 0
        ? t('service.overdueKm',    { n })
        : t('service.remainingKm',  { n });
    }
    return remaining <= 0
      ? t('service.overdueDays',  { n })
      : t('service.remainingDays', { n });
  })();

  const intervalText = (() => {
    if (reminder.type === 'mileage') {
      return `${t('service.intervalKm', { n: reminder.interval_km?.toLocaleString() ?? '' })}  ·  ${t('service.warnBeforeKm', { n: reminder.warn_before })}`;
    }
    return `${t('service.intervalDays', { n: reminder.interval_days ?? '' })}  ·  ${t('service.warnBeforeDays', { n: reminder.warn_before })}`;
  })();

  function handleDeletePress() {
    Alert.alert(
      t('reminderDetail.deleteTitle'),
      t('reminderDetail.deleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text:    t('reminderDetail.deleteConfirm'),
          style:   'destructive',
          onPress: () => onDelete(reminder.id!),
        },
      ],
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={s.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        <View style={s.sheet}>
          {/* ── Шапка ──────────────────────────────────────────────────────── */}
          <View style={s.header}>
            <View style={[s.iconWrap, { backgroundColor: colors.statusOk.background }]}>
              <Ionicons name="construct-outline" size={20} color={colors.statusOk.text} />
            </View>
            <Text style={s.title} numberOfLines={1}>{reminder.title}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={s.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* ── Строки деталей ─────────────────────────────────────────── */}
            <View style={s.row}>
              <Text style={s.rowLabel}>{t('reminderDetail.type')}</Text>
              <Text style={s.rowValue}>
                {reminder.type === 'mileage'
                  ? t('reminderDetail.typeMileage')
                  : t('reminderDetail.typeTime')}
              </Text>
            </View>

            <View style={s.row}>
              <Text style={s.rowLabel}>{t('reminderDetail.interval')}</Text>
              <Text style={s.rowValue}>{intervalText}</Text>
            </View>

            <View style={s.row}>
              <Text style={s.rowLabel}>{t('reminderDetail.lastDate')}</Text>
              <Text style={s.rowValue}>{reminder.last_date || '—'}</Text>
            </View>

            {reminder.last_odometer > 0 && (
              <View style={s.row}>
                <Text style={s.rowLabel}>{t('reminderDetail.lastOdo')}</Text>
                <Text style={s.rowValue}>
                  {reminder.last_odometer.toLocaleString()} {t('common.km')}
                </Text>
              </View>
            )}

            <View style={s.row}>
              <Text style={s.rowLabel}>{t('reminderDetail.remaining')}</Text>
              <Text style={[s.rowValue, { color: STATUS_TEXT[status] }]}>
                {remainingText}
              </Text>
            </View>

            {/* ── История этого регламента ────────────────────────────────── */}
            <Text style={s.sectionHeader}>{t('reminderDetail.historyTitle')}</Text>

            {history.length === 0 ? (
              <View style={s.emptyHistory}>
                <Text style={s.emptyText}>{t('reminderDetail.noHistory')}</Text>
              </View>
            ) : (
              <View style={s.historyCard}>
                {history.map((rec, idx) => (
                  <View
                    key={rec.id}
                    style={[s.historyRow, idx < history.length - 1 && s.historyBorder]}
                  >
                    <View style={s.historyLeft}>
                      <Text style={s.historyDate}>{rec.date}</Text>
                      {!!rec.note && (
                        <Text style={s.historyNote} numberOfLines={1}>{rec.note}</Text>
                      )}
                      {rec.odometer > 0 && (
                        <Text style={s.historyMeta}>
                          {rec.odometer.toLocaleString()} {t('common.km')}
                        </Text>
                      )}
                    </View>
                    {rec.cost > 0 && (
                      <Text style={s.historyCost}>
                        {formatMoney(rec.cost, car?.currency ?? '')}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* ── Кнопки действий ────────────────────────────────────────── */}
            <View style={s.actionsRow}>
              <TouchableOpacity
                style={[s.actionBtn, { borderColor: colors.borderAccent }]}
                onPress={() => onEdit(reminder.id!)}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil-outline" size={16} color={colors.accent} />
                <Text style={[s.actionBtnText, { color: colors.accent }]}>
                  {t('reminderDetail.editBtn')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionBtn, { borderColor: colors.statusDue.text }]}
                onPress={handleDeletePress}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={16} color={colors.statusDue.text} />
                <Text style={[s.actionBtnText, { color: colors.statusDue.text }]}>
                  {t('common.delete')}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={s.doneWrapper}
              onPress={() => onDone(reminder)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={gradient.accent.colors}
                start={gradient.accent.start}
                end={gradient.accent.end}
                style={s.doneBtn}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color="#ffffff"
                  style={{ marginRight: 8 }}
                />
                <Text style={s.doneBtnText}>{t('reminderDetail.doneBtn')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Стили ───────────────────────────────────────────────────────────────────

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
      paddingBottom:        Math.max(bottomInset, 16),
      maxHeight:            '90%',
    },

    header: {
      flexDirection: 'row',
      alignItems:    'center',
      marginBottom:  12,
      paddingRight:  36,
    },
    iconWrap: {
      width:          40,
      height:         40,
      borderRadius:   10,
      justifyContent: 'center',
      alignItems:     'center',
      marginRight:    12,
    },
    title:    { color: colors.textPrimary, ...typography.screenTitle, flex: 1 },
    closeBtn: { position: 'absolute', right: 0, top: 8 },

    row: {
      flexDirection:     'row',
      justifyContent:    'space-between',
      alignItems:        'center',
      paddingVertical:   12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap:               16,
    },
    rowLabel: { color: colors.textSecondary, ...typography.cardText, flex: 1 },
    rowValue: {
      color:     colors.textPrimary,
      ...typography.cardTextMedium,
      textAlign: 'right',
      flex:      2,
    },

    sectionHeader: {
      color:         colors.textWeak,
      ...typography.sectionHeader,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop:     20,
      marginBottom:  8,
    },

    emptyHistory: {
      backgroundColor: colors.background,
      borderRadius:    radius.card,
      padding:         16,
      alignItems:      'center',
      marginBottom:    16,
    },
    emptyText: { color: colors.textSecondary, ...typography.cardText },

    historyCard: {
      backgroundColor: colors.background,
      borderRadius:    radius.card,
      marginBottom:    16,
    },
    historyRow: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingVertical:   12,
      paddingHorizontal: 14,
    },
    historyBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    historyLeft:  { flex: 1, marginRight: 8 },
    historyDate:  { color: colors.textPrimary, ...typography.cardText, marginBottom: 2 },
    historyNote:  { color: colors.textSecondary, ...typography.labelSmall },
    historyMeta:  { color: colors.textWeak, ...typography.labelSmall },
    historyCost:  { color: colors.textSecondary, ...typography.label, flexShrink: 0 },

    actionsRow: {
      flexDirection: 'row',
      gap:           10,
      marginTop:     16,
    },
    actionBtn: {
      flex:           1,
      flexDirection:  'row',
      justifyContent: 'center',
      alignItems:     'center',
      gap:            6,
      paddingVertical: 12,
      borderRadius:   radius.card,
      borderWidth:    1,
    },
    actionBtnText: { ...typography.cardText },

    doneWrapper: { marginTop: 10, marginBottom: 4 },
    doneBtn: {
      flexDirection:  'row',
      justifyContent: 'center',
      alignItems:     'center',
      borderRadius:   radius.card,
      paddingVertical: 15,
    },
    doneBtnText: { color: '#ffffff', ...typography.cardTextMedium },
  });
}
