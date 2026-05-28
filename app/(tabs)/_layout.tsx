/**
 * Навигация — нижняя панель вкладок.
 * Структура по ТЗ раздел 4: 4 вкладки + центральная кнопка «+».
 *
 * Этапы реализации:
 *  1–5  — index (Дашборд) уже готов
 *  6    — service (Обслуживание) — этот этап
 *  3    — history (История) — доступна через кнопку на дашборде
 *  8    — stats (Статистика) — заглушка
 *  9    — полировка навигации, центральная кнопка «+»
 */

import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '@/constants/theme';

const { colors } = theme;

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown:             false,
        tabBarActiveTintColor:   colors.accent,
        tabBarInactiveTintColor: colors.iconInactive,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor:  colors.border,
          borderTopWidth:  1,
        },
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '400',
        },
      }}
    >
      {/* ── 1. Главная (Дашборд) ─────────────────────────────────────────── */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      {/* ── 2. Обслуживание (Этап 6) ─────────────────────────────────────── */}
      <Tabs.Screen
        name="service"
        options={{
          title: t('nav.service'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct-outline" size={size} color={color} />
          ),
        }}
      />

      {/* ── 3. Explore — временная заглушка, убирается на Этапе 9 ─────────── */}
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
  );
}
