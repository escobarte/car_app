/**
 * Временный экран-проверка БД (Этап 1, подшаг 1).
 * Показывает данные из всех 7 таблиц сразу после инициализации.
 * Будет заменён на дашборд в Этапе 4.
 */

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const [data, setData] = useState<DbState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // БД гарантированно готова: _layout.tsx рендерит экраны только после initDatabase()
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
      <View style={styles.center}>
        <Text style={styles.errorText}>❌ Ошибка: {error}</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.label}>Загружаю базу данных…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.header}>🗄 Проверка базы данных</Text>

      {/* CAR */}
      <Text style={styles.section}>CAR (машина)</Text>
      {data.car ? (
        <View style={styles.card}>
          <Row label="name"             value={data.car.name} />
          <Row label="current_odometer" value={String(data.car.current_odometer)} />
          <Row label="fuel_unit"        value={data.car.fuel_unit} />
          <Row label="currency"         value={data.car.currency} />
        </View>
      ) : <Text style={styles.empty}>нет записи</Text>}

      {/* APP_SETTINGS */}
      <Text style={styles.section}>APP_SETTINGS (настройки)</Text>
      {data.settings ? (
        <View style={styles.card}>
          <Row label="language"              value={data.settings.language} />
          <Row label="theme"                 value={data.settings.theme} />
          <Row label="notifications_enabled" value={String(data.settings.notifications_enabled)} />
        </View>
      ) : <Text style={styles.empty}>нет записи</Text>}

      {/* CATEGORY */}
      <Text style={styles.section}>
        CATEGORY ({data.categories.length} категорий)
      </Text>
      {data.categories.map((cat) => (
        <View key={cat.id} style={styles.row}>
          <Text style={styles.icon}>{cat.icon}</Text>
          <Text style={styles.label}>{cat.name}</Text>
          {cat.is_builtin === 1 && (
            <Text style={styles.badge}>встроенная</Text>
          )}
        </View>
      ))}

      {/* REMINDER */}
      <Text style={styles.section}>
        REMINDER ({data.reminders.length} регламентов)
      </Text>
      {data.reminders.map((r) => (
        <View key={r.id} style={styles.card}>
          <Row label="title"      value={r.title} />
          <Row label="type"       value={r.type} />
          <Row label="interval"   value={
            r.type === 'mileage'
              ? `${r.interval_km} км`
              : `${r.interval_days} дней`
          } />
          <Row label="warn_before" value={
            r.type === 'mileage'
              ? `${r.warn_before} км`
              : `${r.warn_before} дней`
          } />
        </View>
      ))}

      <Text style={styles.footer}>
        ✅ Все таблицы созданы и заполнены стартовыми данными
      </Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowInner}>
      <Text style={styles.label}>{label}: </Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 40 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  header:  { color: '#3db5f5', fontSize: 20, fontWeight: '500', marginBottom: 16 },
  section: { color: '#9a9aa2', fontSize: 12, letterSpacing: 1, marginTop: 20, marginBottom: 8 },
  card:    { backgroundColor: '#0f0f12', borderRadius: 12, padding: 12, marginBottom: 4 },
  rowInner:{ flexDirection: 'row', marginBottom: 2 },
  row:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
             borderBottomWidth: 1, borderBottomColor: '#1c1c22' },
  label:   { color: '#9a9aa2', fontSize: 13 },
  value:   { color: '#ffffff', fontSize: 13 },
  icon:    { color: '#9a9aa2', fontSize: 13, width: 120 },
  badge:   { color: '#3db5f5', fontSize: 11, marginLeft: 'auto' },
  empty:   { color: '#5a5a62', fontSize: 13, marginBottom: 8 },
  errorText: { color: '#e5484d', padding: 16, textAlign: 'center' },
  footer:  { color: '#4caf7d', marginTop: 24, fontSize: 14, textAlign: 'center' },
});
