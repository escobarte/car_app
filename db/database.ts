/**
 * Центральный модуль базы данных.
 *
 * - openDatabase()  — открывает или создаёт файл БД на устройстве.
 * - initDatabase()  — создаёт таблицы и заполняет стартовые данные
 *                     (машина, настройки, встроенные категории, регламенты).
 *   Безопасно вызывать при каждом старте: IF NOT EXISTS / INSERT OR IGNORE
 *   гарантируют, что данные не задвоятся.
 */

import * as SQLite from 'expo-sqlite';
import { ALL_SCHEMAS } from './schema';

// ─── типы TypeScript для каждой таблицы ────────────────────────────────────

export type Car = {
  id: number;
  name: string;
  current_odometer: number;
  fuel_unit: string;
  currency: string;
};

export type FuelEntry = {
  id: number;
  car_id: number;
  date: string;           // 'YYYY-MM-DD'
  odometer: number;
  liters: number;
  total_cost: number;
  price_per_liter: number;
  is_full_tank: 0 | 1;
  consumption: number | null;
};

export type Expense = {
  id: number;
  car_id: number;
  category_id: number;
  date: string;
  odometer: number | null;
  amount: number;
  description: string;
};

export type Category = {
  id: number;
  key: string;            // '' у пользовательских, ключ перевода у встроенных
  name: string;
  icon: string;
  is_builtin: 0 | 1;
};

export type ServiceRecord = {
  id: number;
  car_id: number;
  reminder_id: number | null;
  date: string;
  odometer: number;
  cost: number;
  note: string;
};

export type Reminder = {
  id: number;
  car_id: number;
  title: string;
  type: 'mileage' | 'time';
  interval_km: number | null;
  interval_days: number | null;
  last_odometer: number;
  last_date: string;
  warn_before: number;
};

export type AppSettings = {
  id: number;
  language: 'ru' | 'en';
  theme: 'dark' | 'light';
  notifications_enabled: 0 | 1;
};

// ─── встроенные категории (раздел 7.1 ТЗ) ──────────────────────────────────

const BUILTIN_CATEGORIES: Omit<Category, 'id'>[] = [
  { key: 'documents',     name: 'Документы',  icon: 'file-text',       is_builtin: 1 },
  { key: 'chemistry',     name: 'Химия',      icon: 'spray',           is_builtin: 1 },
  { key: 'tuning',        name: 'Тюнинг',     icon: 'settings-2',      is_builtin: 1 },
  { key: 'accessories',   name: 'Аксессуары', icon: 'puzzle',          is_builtin: 1 },
  { key: 'electronics',   name: 'Электроника',icon: 'device-speaker',  is_builtin: 1 },
  { key: 'service',       name: 'Сервис',     icon: 'tool',            is_builtin: 1 },
  { key: 'comfort',       name: 'Комфорт',    icon: 'armchair',        is_builtin: 1 },
  { key: 'parts',         name: 'Запчасти',   icon: 'engine',          is_builtin: 1 },
  { key: 'gov_inspection',name: 'Гос. ТО',    icon: 'clipboard-check', is_builtin: 1 },
  { key: 'fines',         name: 'Штрафы',     icon: 'alert-octagon',   is_builtin: 1 },
  { key: 'parking',       name: 'Парковка',   icon: 'parking',         is_builtin: 1 },
  { key: 'tires',         name: 'Шины',       icon: 'wheel',           is_builtin: 1 },
];

// Стартовые регламенты (раздел 7.2 ТЗ), привязываются к car_id = 1
type ReminderSeed = Omit<Reminder, 'id' | 'car_id' | 'last_odometer' | 'last_date'>;
const REMINDER_SEEDS: ReminderSeed[] = [
  { title: 'Замена масла', type: 'mileage', interval_km: 8000, interval_days: null, warn_before: 500  },
  { title: 'Гос. ТО',     type: 'time',    interval_km: null,  interval_days: 365,  warn_before: 25   },
  { title: 'Мойка',       type: 'time',    interval_km: null,  interval_days: 14,   warn_before: 3    },
  { title: 'Дворники',    type: 'time',    interval_km: null,  interval_days: 365,  warn_before: 30   },
];

// ─── открытие БД ────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

/** Возвращает уже открытую БД или открывает новую. */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('car_app.db');
  return _db;
}

// ─── инициализация ──────────────────────────────────────────────────────────

/**
 * Создаёт таблицы и стартовые данные.
 * Вызывать один раз при старте приложения.
 * Безопасно вызывать повторно — дубликатов не создаст.
 *
 * @param deviceLanguage — язык телефона ('ru' | 'en').
 *   Используется только при ПЕРВОМ запуске для записи в APP_SETTINGS.
 *   На последующих запусках INSERT OR IGNORE эту строку пропускает.
 */
export async function initDatabase(deviceLanguage: 'ru' | 'en' = 'ru'): Promise<void> {
  const db = await openDatabase();

  // 1. Создаём все таблицы
  for (const sql of ALL_SCHEMAS) {
    await db.execAsync(sql);
  }

  // 2. Стартовая запись машины (id = 1, вставляется только при первом запуске)
  await db.runAsync(
    `INSERT OR IGNORE INTO car (id, name, current_odometer, fuel_unit, currency)
     VALUES (1, 'Моя машина', 0, 'литр', 'MDL');`
  );

  // 3. Стартовые настройки (id = 1) — язык берётся с устройства при первом запуске
  await db.runAsync(
    `INSERT OR IGNORE INTO app_settings (id, language, theme, notifications_enabled)
     VALUES (1, ?, 'dark', 1);`,
    deviceLanguage
  );

  // 4. Встроенные категории (12 штук)
  for (const cat of BUILTIN_CATEGORIES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO category (key, name, icon, is_builtin)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM category WHERE key = ? AND is_builtin = 1);`,
      cat.key, cat.name, cat.icon, cat.is_builtin, cat.key
    );
  }

  // 5. Стартовые регламенты (привязаны к машине id=1)
  for (const r of REMINDER_SEEDS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO reminder
         (car_id, title, type, interval_km, interval_days, last_odometer, last_date, warn_before)
       SELECT 1, ?, ?, ?, ?, 0, date('now'), ?
       WHERE NOT EXISTS (SELECT 1 FROM reminder WHERE car_id = 1 AND title = ?);`,
      r.title, r.type, r.interval_km, r.interval_days, r.warn_before, r.title
    );
  }
}
