/**
 * Универсальная нижняя модалка для статистических данных дашборда.
 * Стиль идентичен RecordDetailModal: оверлей, шторка, шапка с иконкой.
 * Используется для 3 карточек: расходы за месяц, цена, расход топлива.
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
import { Ionicons } from '@expo/vector-icons';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

// ─── Типы ────────────────────────────────────────────────────────────────────

export type StatRow = {
  label:       string;
  value:       string;
  valueColor?: string;
};

export type StatItem = {
  left:        string;    // дата или порядковый признак
  right:       string;    // значение
  badge?:      string;    // «лучший» / «худший»
  badgeColor?: string;
};

type Props = {
  visible:      boolean;
  onClose:      () => void;
  title:        string;
  icon:         React.ComponentProps<typeof Ionicons>['name'];
  iconBg:       string;
  iconColor:    string;
  rows:         StatRow[];
  listTitle?:   string;   // заголовок секции со списком
  items?:       StatItem[];
  actionLabel?: string;
  onAction?:    () => void;
};

// ─── Компонент ───────────────────────────────────────────────────────────────

export default function DashStatModal({
  visible, onClose, title, icon, iconBg, iconColor,
  rows, listTitle, items, actionLabel, onAction,
}: Props) {
  const th = useAppTheme();
  const { colors } = th;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(th, insets.bottom), [th, insets.bottom]);

  const hasItems  = !!items?.length;
  const hasAction = !!(actionLabel && onAction);

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

          {/* ── Шапка ────────────────────────────────────────────────────── */}
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

            {/* ── Строки статистики ─────────────────────────────────────── */}
            {rows.map((r, i) => {
              const isLast = !hasItems && !hasAction && i === rows.length - 1;
              return (
                <View key={i} style={[s.row, isLast && s.rowLast]}>
                  <Text style={s.rowLabel}>{r.label}</Text>
                  <Text
                    style={[s.rowValue, r.valueColor ? { color: r.valueColor } : undefined]}
                    numberOfLines={1}
                  >
                    {r.value}
                  </Text>
                </View>
              );
            })}

            {/* ── Список элементов (расход топлива) ────────────────────── */}
            {hasItems && listTitle && (
              <Text style={s.listTitle}>{listTitle}</Text>
            )}
            {hasItems && items!.map((item, i) => {
              const isLast = !hasAction && i === items!.length - 1;
              return (
                <View key={i} style={[s.listRow, isLast && s.rowLast]}>
                  <Text style={s.listLeft}>{item.left}</Text>
                  {item.badge ? (
                    <View style={[s.badge, { backgroundColor: item.badgeColor ? `${item.badgeColor}22` : colors.border }]}>
                      <Text style={[s.badgeText, item.badgeColor ? { color: item.badgeColor } : { color: colors.textMuted }]}>
                        {item.badge}
                      </Text>
                    </View>
                  ) : (
                    <View />
                  )}
                  <Text style={s.listRight}>{item.right}</Text>
                </View>
              );
            })}

            {/* ── Кнопка действия (→ Статистика) ───────────────────────── */}
            {hasAction && (
              <TouchableOpacity
                style={[s.actionBtn, { borderColor: colors.borderAccent }]}
                onPress={onAction}
                activeOpacity={0.8}
              >
                <Ionicons name="bar-chart-outline" size={18} color={colors.accent} />
                <Text style={[s.actionText, { color: colors.accent }]}>{actionLabel}</Text>
              </TouchableOpacity>
            )}

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
      maxHeight:            '85%',
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
    title:    { color: colors.textPrimary, ...typography.screenTitle },
    closeBtn: { position: 'absolute', right: 0, top: 8 },

    row: {
      flexDirection:     'row',
      justifyContent:    'space-between',
      alignItems:        'center',
      paddingVertical:   13,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap:               16,
    },
    rowLast:  { borderBottomWidth: 0 },
    rowLabel: { color: colors.textSecondary, ...typography.cardText, flex: 1 },
    rowValue: { color: colors.textPrimary, ...typography.cardTextMedium, textAlign: 'right' },

    listTitle: {
      color:         colors.textWeak,
      ...typography.sectionHeader,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop:     16,
      marginBottom:  4,
    },
    listRow: {
      flexDirection:     'row',
      alignItems:        'center',
      paddingVertical:   11,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap:               8,
    },
    listLeft:  { color: colors.textSecondary, ...typography.cardText, flex: 1 },
    listRight: { color: colors.textPrimary, ...typography.cardTextMedium },
    badge: {
      paddingHorizontal: 7,
      paddingVertical:   2,
      borderRadius:      radius.badge,
    },
    badgeText: { fontSize: 11, fontWeight: '500' as const },

    actionBtn: {
      flexDirection:   'row',
      justifyContent:  'center',
      alignItems:      'center',
      gap:             8,
      paddingVertical: 14,
      borderRadius:    radius.card,
      borderWidth:     1,
      marginTop:       20,
    },
    actionText: { ...typography.cardTextMedium },
  });
}
