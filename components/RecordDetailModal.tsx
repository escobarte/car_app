/**
 * Модалка деталей записи — переиспользуемый компонент.
 *
 * Показывает полные данные одной записи (заправка / расход / сервис).
 * Используется на экране История (тап по строке) и на Дашборде
 * (блок «Последние транзакции»).
 *
 * Только отображение + опциональные кнопки «Изменить» / «Удалить»
 * (рендерятся, если переданы колбэки). Все цвета из theme, текст через t().
 */

import { useMemo } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { formatMoney } from '@/constants/currencies';
import { FuelEntry, Expense, ServiceRecord, Category } from '@/db';

// ─── Тип записи ──────────────────────────────────────────────────────────────

export type DetailRecord =
  | { kind: 'fuel';    data: FuelEntry }
  | { kind: 'expense'; data: Expense; category?: Category }
  | { kind: 'service'; data: ServiceRecord };

type Row = { label: string; value: string };

// ─── Утилиты ────────────────────────────────────────────────────────────────

function fmtFullDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// ─── Пропсы ───────────────────────────────────────────────────────────────────

type Props = {
  record:   DetailRecord | null;   // null → модалка скрыта
  currCode: string;
  onClose:  () => void;
  onEdit?:  () => void;            // если не передан — кнопка «Изменить» скрыта
  onDelete?: () => void;          // если не передан — кнопка «Удалить» скрыта
};

// ─── Компонент ─────────────────────────────────────────────────────────────────

export default function RecordDetailModal({ record, currCode, onClose, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  const th = useAppTheme();
  const { colors } = th;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(th, insets.bottom), [th, insets.bottom]);

  const visible = record !== null;

  // ── Заголовок + иконка + строки деталей ────────────────────────────────────
  let title  = '';
  let icon: React.ComponentProps<typeof Ionicons>['name'] = 'document-outline';
  let iconBg = colors.surface;
  let iconColor = colors.accent;
  let rows: Row[] = [];

  if (record) {
    if (record.kind === 'fuel') {
      const f = record.data;
      title = t('history.fuel');
      icon = 'water'; iconBg = colors.iconBgFuel; iconColor = colors.accent;
      rows = [
        { label: t('recordDetail.date'),          value: fmtFullDate(f.date) },
        { label: t('recordDetail.odometer'),      value: `${f.odometer.toLocaleString()} ${t('common.km')}` },
        { label: t('recordDetail.liters'),        value: f.liters.toFixed(2) },
        { label: t('recordDetail.total'),         value: formatMoney(f.total_cost, currCode) },
        { label: t('recordDetail.pricePerLiter'), value: formatMoney(f.price_per_liter, currCode) },
        { label: t('recordDetail.fullTank'),      value: f.is_full_tank === 1 ? t('common.yes') : t('common.no') },
      ];
      if (f.consumption != null) {
        rows.push({ label: t('recordDetail.consumption'), value: `${f.consumption.toFixed(1)} ${t('addFuel.per100km')}` });
      }
    } else if (record.kind === 'expense') {
      const e = record.data;
      const cat = record.category;
      const catName = cat ? (cat.key ? t(`categories.${cat.key}` as never) : cat.name) : '—';
      title = t('history.expense');
      icon = 'receipt-outline'; iconBg = colors.iconBgExpense; iconColor = colors.statusSoon.text;
      rows = [
        { label: t('recordDetail.date'),     value: fmtFullDate(e.date) },
        { label: t('recordDetail.category'), value: catName },
      ];
      if (e.description) rows.push({ label: t('recordDetail.description'), value: e.description });
      if (e.odometer != null) {
        rows.push({ label: t('recordDetail.odometer'), value: `${e.odometer.toLocaleString()} ${t('common.km')}` });
      }
      rows.push({ label: t('recordDetail.total'), value: formatMoney(e.amount, currCode) });
    } else {
      const sv = record.data;
      title = t('history.maintenance');
      icon = 'build-outline'; iconBg = colors.iconBgService; iconColor = colors.statusOk.text;
      rows = [
        { label: t('recordDetail.date'),     value: fmtFullDate(sv.date) },
        { label: t('recordDetail.odometer'), value: `${sv.odometer.toLocaleString()} ${t('common.km')}` },
        { label: t('recordDetail.total'),    value: formatMoney(sv.cost, currCode) },
      ];
      if (sv.note) rows.push({ label: t('recordDetail.note'), value: sv.note });
    }
  }

  // ── Рендер ─────────────────────────────────────────────────────────────────
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
          {/* Шапка */}
          <View style={s.header}>
            <View style={[s.iconWrap, { backgroundColor: iconBg }]}>
              <Ionicons name={icon} size={20} color={iconColor} />
            </View>
            <Text style={s.title}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={s.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {rows.map((r, i) => (
              <View key={i} style={[s.row, i === rows.length - 1 && s.rowLast]}>
                <Text style={s.rowLabel}>{r.label}</Text>
                <Text style={s.rowValue} numberOfLines={2}>{r.value}</Text>
              </View>
            ))}

            {(onEdit || onDelete) && (
              <View style={s.actions}>
                {onEdit && (
                  <TouchableOpacity style={[s.actionBtn, s.editBtn]} onPress={onEdit} activeOpacity={0.8}>
                    <Ionicons name="pencil-outline" size={18} color={colors.accent} />
                    <Text style={[s.actionText, { color: colors.accent }]}>{t('historyActions.edit')}</Text>
                  </TouchableOpacity>
                )}
                {onDelete && (
                  <TouchableOpacity style={[s.actionBtn, s.deleteBtn]} onPress={onDelete} activeOpacity={0.8}>
                    <Ionicons name="trash-outline" size={18} color={colors.statusDue.text} />
                    <Text style={[s.actionText, { color: colors.statusDue.text }]}>{t('historyActions.delete')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
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
      paddingBottom:        Math.max(bottomInset, 16),
      maxHeight:            '85%',
    },

    // Шапка
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
    title: {
      color: colors.textPrimary,
      ...typography.screenTitle,
    },
    closeBtn: {
      position: 'absolute',
      right:    0,
      top:      8,
    },

    // Строка «лейбл — значение»
    row: {
      flexDirection:   'row',
      justifyContent:  'space-between',
      alignItems:      'center',
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap:             16,
    },
    rowLast:  { borderBottomWidth: 0 },
    rowLabel: { color: colors.textSecondary, ...typography.cardText },
    rowValue: {
      color:      colors.textPrimary,
      ...typography.cardTextMedium,
      flexShrink: 1,
      textAlign:  'right',
    },

    // Кнопки действий
    actions: {
      flexDirection: 'row',
      gap:           12,
      marginTop:     20,
    },
    actionBtn: {
      flex:            1,
      flexDirection:   'row',
      justifyContent:  'center',
      alignItems:      'center',
      gap:             8,
      paddingVertical: 14,
      borderRadius:    radius.card,
      borderWidth:     1,
    },
    editBtn:    { borderColor: colors.borderAccent },
    deleteBtn:  { borderColor: colors.statusDue.text },
    actionText: { ...typography.cardTextMedium },
  });
}
