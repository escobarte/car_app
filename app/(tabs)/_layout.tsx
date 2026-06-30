/**
 * Нижняя навигация — 5 вкладок.
 *
 *  Home  |  History  |  [+]  |  Service  |  Stats
 *
 * Кнопка [+] приподнята, открывает Action Sheet.
 * Action Sheet → Заправка / Расход / Обслуживание.
 */

import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Tabs, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

// ─── Кнопка «+» в центре таб-бара ──────────────────────────────────────────

type AddBtnProps = {
  onPress:  () => void;
  gradient: AppTheme['gradient'];
};

function AddTabButton({ onPress, gradient }: AddBtnProps) {
  // Контейнер просто центрирует кнопку в табе и НЕ ловит нажатия (pointerEvents="box-none"),
  // чтобы свайпы/тапы вне самого «+» проходили сквозь — иначе из-за `flex: 1`
  // вся центральная колонка таб-бара была touchable, и Action Sheet открывался
  // при любом случайном касании этой зоны.
  return (
    <View style={st.addOuter} pointerEvents="box-none">
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={st.addTouch}
        accessibilityRole="button"
      >
        <LinearGradient
          colors={gradient.accent.colors}
          start={gradient.accent.start}
          end={gradient.accent.end}
          style={st.addGradient}
        >
          <Ionicons name="add" size={30} color="#ffffff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ─── Action Sheet ───────────────────────────────────────────────────────────

type SheetItem = {
  icon:      React.ComponentProps<typeof Ionicons>['name'];
  iconBg:    string;
  iconColor: string;
  label:     string;
  onPress:   () => void;
};

function ActionSheet({
  visible,
  onClose,
  items,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  items:   SheetItem[];
  colors:  AppTheme['colors'];
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* Backdrop */}
      <Pressable
        style={st.backdrop}
        onPress={onClose}
      />

      {/* Sheet — pointerEvents="box-none" ещё один вариант, но Pressable уже закрывает */}
      <View style={[st.sheet, { backgroundColor: colors.surface }]}>
        {/* Handle */}
        <View style={[st.handle, { backgroundColor: colors.border }]} />

        {items.map((item, idx) => (
          <TouchableOpacity
            key={idx}
            style={[
              st.sheetRow,
              idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
            ]}
            onPress={item.onPress}
            activeOpacity={0.7}
          >
            <View style={[st.sheetIcon, { backgroundColor: item.iconBg }]}>
              <Ionicons name={item.icon} size={22} color={item.iconColor} />
            </View>
            <Text style={[st.sheetLabel, { color: colors.textPrimary }]}>
              {item.label}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textWeak} />
          </TouchableOpacity>
        ))}

        {/* Отступ снизу: home indicator iOS / навигационная панель Android */}
        <View style={{ height: Math.max(insets.bottom, 12) }} />
      </View>
    </Modal>
  );
}

// ─── Основной компонент ─────────────────────────────────────────────────────

export default function TabLayout() {
  const { t } = useTranslation();
  const th = useAppTheme();
  const { colors, gradient } = th;
  const insets = useSafeAreaInsets();

  const [sheetVisible, setSheetVisible] = useState(false);

  function openSheet() { setSheetVisible(true);  }
  function closeSheet() { setSheetVisible(false); }

  const sheetItems: SheetItem[] = [
    {
      icon:      'water-outline',
      iconBg:    colors.iconBgFuel,
      iconColor: colors.accent,
      label:     t('addFuel.title'),
      onPress:   () => { closeSheet(); router.push('/add-fuel' as never); },
    },
    {
      icon:      'receipt-outline',
      iconBg:    colors.iconBgExpense,
      iconColor: colors.statusSoon.text,
      label:     t('addExpense.title'),
      onPress:   () => { closeSheet(); router.push('/add-expense' as never); },
    },
    {
      icon:      'construct-outline',
      iconBg:    colors.iconBgService,
      iconColor: colors.statusOk.text,
      label:     t('addReminder.title'),
      onPress:   () => { closeSheet(); router.push('/add-reminder' as never); },
    },
  ];

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown:             false,
          tabBarActiveTintColor:   colors.accent,
          tabBarInactiveTintColor: colors.iconInactive,
          tabBarStyle: {
            backgroundColor: colors.surfaceSecondary,
            borderTopColor:  colors.border,
            borderTopWidth:  1,
            // На Android edge-to-edge системная панель навигации (жесты/3 кнопки)
            // отъедает место снизу — компенсируем через insets.bottom,
            // иначе таб-бар «прижимается» к низу и кнопки попадают на жесты.
            height:          60 + insets.bottom,
            paddingBottom:   8  + insets.bottom,
            overflow:        'visible',   // кнопка «+» выходит за рамки таб-бара
          },
          tabBarLabelStyle: {
            fontSize:   11,
            fontWeight: '400',
          },
        }}
      >
        {/* ── 1. Главная ─────────────────────────────────────────────── */}
        <Tabs.Screen
          name="index"
          options={{
            title: t('nav.home'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
          }}
        />

        {/* ── 2. История ─────────────────────────────────────────────── */}
        <Tabs.Screen
          name="history"
          options={{
            title: t('nav.history'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time-outline" size={size} color={color} />
            ),
          }}
        />

        {/* ── 3. «+» (центральная кнопка) ────────────────────────────── */}
        <Tabs.Screen
          name="add"
          options={{
            title:          '',
            tabBarLabel:    () => null,
            tabBarIcon:     () => null,
            tabBarButton:   () => (
              <AddTabButton onPress={openSheet} gradient={gradient} />
            ),
          }}
        />

        {/* ── 4. Обслуживание ────────────────────────────────────────── */}
        <Tabs.Screen
          name="service"
          options={{
            title: t('nav.service'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="construct-outline" size={size} color={color} />
            ),
          }}
        />

        {/* ── 5. Статистика ──────────────────────────────────────────── */}
        <Tabs.Screen
          name="explore"
          options={{
            title: t('nav.stats'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="bar-chart-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* Action Sheet — над всем UI, включая таб-бар */}
      <ActionSheet
        visible={sheetVisible}
        onClose={closeSheet}
        items={sheetItems}
        colors={colors}
      />
    </>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  // Контейнер «+» — раскрывается на всю ячейку таб-бара только для центровки;
  // не ловит pointer-события (см. pointerEvents="box-none" в JSX).
  addOuter: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'visible',
  },
  // Touch-зона ограничена самой кнопкой 58×58.
  addTouch: {
    width:        58,
    height:       58,
    borderRadius: 16,
    // Немного приподнята над таб-баром
    transform:    [{ translateY: -14 }],
  },
  addGradient: {
    width:          58,
    height:         58,
    borderRadius:   16,
    justifyContent: 'center',
    alignItems:     'center',
    // Тень (iOS / Android)
    shadowColor:    '#1a8fd6',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.45,
    shadowRadius:   10,
    elevation:      10,
  },

  // Backdrop
  backdrop: {
    position: 'absolute',
    top:      0,
    bottom:   0,
    left:     0,
    right:    0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  // Sheet
  sheet: {
    position:            'absolute',
    bottom:              0,
    left:                0,
    right:               0,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    paddingTop:           12,
    paddingHorizontal:    16,
  },
  handle: {
    width:        36,
    height:       4,
    borderRadius: 2,
    alignSelf:    'center',
    marginBottom: 12,
  },

  // Sheet row
  sheetRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 14,
    gap:             14,
  },
  sheetIcon: {
    width:          44,
    height:         44,
    borderRadius:   12,
    justifyContent: 'center',
    alignItems:     'center',
  },
  sheetLabel: {
    flex:       1,
    fontSize:   16,
    fontWeight: '400',
  },
});
