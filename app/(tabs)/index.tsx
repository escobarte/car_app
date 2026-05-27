/**
 * Временный экран-проверка БД + i18n (Этап 1, подшаги 1–4).
 * Все цвета — через theme. Все тексты — через useTranslation (t).
 * Будет заменён дашбордом в Этапе 4.
 */

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { theme } from '@/constants/theme';
import {
  carRepo,
  categoryRepo,
  reminderRepo,
  settingsRepo,
  Car,
  Category,
  Reminder,
  AppSettings,
} from '@/db';

type DbState = {
  car: Car | null;
  categories: Category[];
  reminders: Reminder[];
  settings: AppSettings | null;
};

export default function DbCheckScreen() {
  const { t } = useTranslation();
  const [data, setData] = useState<DbState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [car, categories, reminders, settings] = await Promise.all([
          carRepo.getCar(),
          categoryRepo.getAllCategories(),
          reminderRepo.getAllReminders(),
          settingsRepo.getSettings(),
        ]);
        setData({ car, categories, reminders, settings });
      } catch (e: unknown) {
        setError(String(e));
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>{t('common.error')}: {error}</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={s.center}>
        <Text style={s.textSecondary}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      {/* Заголовок — из словаря */}
      <Text style={s.header}>{t('dbCheck.title')}</Text>

      {/* CAR */}
      <Text style={s.section}>{t('dbCheck.sectionCar')}</Text>
      {data.car ? (
        <View style={s.card}>
          <Row label="name"             value={data.car.name} />
          <Row label="current_odometer" value={String(data.car.current_odometer)} />
          <Row label="fuel_unit"        value={data.car.fuel_unit} />
          <Row label="currency"         value={data.car.currency} />
        </View>
      ) : <Text style={s.empty}>нет записи</Text>}

      {/* APP_SETTINGS */}
      <Text style={s.section}>{t('dbCheck.sectionSettings')}</Text>
      {data.settings ? (
        <View style={s.card}>
          <Row label="language"              value={data.settings.language} />
          <Row label="theme"                 value={data.settings.theme} />
          <Row label="notifications_enabled" value={String(data.settings.notifications_enabled)} />
        </View>
      ) : <Text style={s.empty}>нет записи</Text>}

      {/* CATEGORY — название через t('categories.<key>') */}
      <Text style={s.section}>
        {t('dbCheck.sectionCategories', { count: data.categories.length })}
      </Text>
      {data.categories.map((cat) => (
        <View key={cat.id} style={s.listRow}>
          <Text style={s.iconCol}>{cat.icon}</Text>
          {/* Встроенные: имя из словаря по ключу; пользовательские: имя из БД */}
          <Text style={s.textPrimary}>
            {cat.key ? t(`categories.${cat.key}` as never) : cat.name}
          </Text>
          {cat.is_builtin === 1 && (
            <Text style={s.badge}>{t('dbCheck.builtin')}</Text>
          )}
        </View>
      ))}

      {/* REMINDER */}
      <Text style={s.section}>
        {t('dbCheck.sectionReminders', { count: data.reminders.length })}
      </Text>
      {data.reminders.map((r) => (
        <View key={r.id} style={s.card}>
          <Row label="title"       value={r.title} />
          <Row label="type"        value={r.type} />
          <Row label="interval"    value={
            r.type === 'mileage'
              ? `${r.interval_km} ${t('common.km')}`
              : `${r.interval_days} ${t('common.days_many')}`
          } />
          <Row label="warn_before" value={
            r.type === 'mileage'
              ? `${r.warn_before} ${t('common.km')}`
              : `${r.warn_before} ${t('common.days_many')}`
          } />
        </View>
      ))}

      <Text style={s.footer}>{t('dbCheck.footer')}</Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.rowInner}>
      <Text style={s.textSecondary}>{label}: </Text>
      <Text style={s.textPrimary}>{value}</Text>
    </View>
  );
}

// ── Стили через theme — без единого хардкода цвета ──────────────────────────
const { colors, radius, typography } = theme;

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.background },
  content:     { padding: 16, paddingBottom: 40 },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center',
                 backgroundColor: colors.background },

  header:      { color: colors.accent, ...typography.screenTitle, marginBottom: 16 },
  section:     { color: colors.textWeak, ...typography.sectionHeader,
                 marginTop: 20, marginBottom: 8, textTransform: 'uppercase' },

  card:        { backgroundColor: colors.surface, borderRadius: radius.card,
                 padding: 12, marginBottom: 4 },
  rowInner:    { flexDirection: 'row', marginBottom: 2 },

  listRow:     { flexDirection: 'row', alignItems: 'center',
                 paddingVertical: 6, borderBottomWidth: 1,
                 borderBottomColor: colors.border },

  textPrimary:   { color: colors.textPrimary,   ...typography.cardText },
  textSecondary: { color: colors.textSecondary, ...typography.cardText },
  iconCol:       { color: colors.textSecondary, ...typography.cardText, width: 130 },
  badge:         { color: colors.accent, ...typography.labelSmall, marginLeft: 'auto' },
  empty:         { color: colors.textWeak, ...typography.cardText, marginBottom: 8 },

  errorText:   { color: colors.statusDue.text, padding: 16, textAlign: 'center' },
  footer:      { color: colors.statusOk.text,  marginTop: 24,
                 ...typography.label, textAlign: 'center' },
});
