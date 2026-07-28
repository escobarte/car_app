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
  /** Базовый пробег (онбординг / ручная правка в настройках). */
  base_odometer: number;
  /** Производное: MAX(base_odometer, все odometer в записях). См. ТЗ 5.1. */
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
  /** Точка старта регламента (момент создания). Неизменна. */
  start_odometer: number;
  start_date: string;
  /** Производные: последняя закрывшая запись SERVICE_RECORD, иначе start_*. */
  last_odometer: number;
  last_date: string;
  warn_before: number;
};

export type AppSettings = {
  id: number;
  language: 'ru' | 'en';
  theme: 'dark' | 'light';
  notifications_enabled: 0 | 1;
  onboarding_completed: 0 | 1;
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
// start_* / last_* в сидах не задаются: их проставляет SQL ниже,
// отталкиваясь от текущего пробега машины и сегодняшней даты (ТЗ 6.3).
type ReminderSeed = Omit<
  Reminder,
  'id' | 'car_id' | 'start_odometer' | 'start_date' | 'last_odometer' | 'last_date'
>;
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

// ─── система миграций ────────────────────────────────────────────────────────

/**
 * Текущая версия схемы. Увеличивать при каждой новой миграции.
 * SCHEMA_VERSION === MIGRATIONS.length.
 */
const SCHEMA_VERSION = 3;

/**
 * Шаги миграции: индекс 0 = переход v0→v1, индекс 1 = v1→v2, и т.д.
 * Правила:
 *  - только ALTER TABLE / CREATE TABLE / CREATE INDEX и идемпотентные UPDATE
 *  - никаких DROP TABLE / удаления данных
 *  - выполняются внутри транзакции; при ошибке — откат и re-throw
 */
type Txn = Parameters<Parameters<SQLite.SQLiteDatabase['withExclusiveTransactionAsync']>[0]>[0];

const MIGRATIONS: Array<(txn: Txn) => Promise<void>> = [
  // ── v0 → v1 : добавляем onboarding_completed ────────────────────────────
  async (txn) => {
    // Проверяем, есть ли уже колонка (защита от повторного запуска)
    const col = await txn.getFirstAsync<{ cid: number }>(
      `SELECT cid FROM pragma_table_info('app_settings') WHERE name='onboarding_completed';`
    );
    if (!col) {
      await txn.execAsync(
        `ALTER TABLE app_settings
         ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;`
      );
    }

    // Считаем пользователя «существующим» если:
    //   – пробег машины > 0 (вводил пробег, но записей ещё нет), ИЛИ
    //   – есть хотя бы одна запись в fuel_entry / expense / service_record
    await txn.runAsync(`
      UPDATE app_settings
      SET    onboarding_completed = 1
      WHERE  id = 1
        AND  onboarding_completed = 0
        AND  (
               EXISTS (SELECT 1 FROM car          WHERE id = 1 AND current_odometer > 0) OR
               EXISTS (SELECT 1 FROM fuel_entry    LIMIT 1)                               OR
               EXISTS (SELECT 1 FROM expense       LIMIT 1)                               OR
               EXISTS (SELECT 1 FROM service_record LIMIT 1)
             );
    `);
  },

  // ── v1 → v2 : базовый пробег машины (ТЗ 5.1) ────────────────────────────
  // До этого current_odometer только рос (syncOdometer поднимал его при
  // каждой записи и никогда не опускал). После удаления записи он оставался
  // завышенным, а регламенты — с неверным статусом. Теперь current_odometer
  // производный: MAX(base_odometer, все odometer в записях).
  async (txn) => {
    const col = await txn.getFirstAsync<{ cid: number }>(
      `SELECT cid FROM pragma_table_info('car') WHERE name='base_odometer';`
    );
    if (!col) {
      await txn.execAsync(
        `ALTER TABLE car ADD COLUMN base_odometer INTEGER NOT NULL DEFAULT 0;`
      );
      // Восстановить настоящий базовый пробег задним числом невозможно:
      // он не хранился. Берём текущий current_odometer — так значение на
      // экране не меняется, и одометр не «просядет» после удаления записи.
      await txn.runAsync(
        `UPDATE car SET base_odometer = current_odometer WHERE id = 1;`
      );
    }
  },

  // ── v2 → v3 : точка старта регламента (ТЗ 6.3) ──────────────────────────
  // Нужна для отката: при удалении записи SERVICE_RECORD, закрывавшей
  // регламент, last_* возвращаются на предыдущую запись, а если её нет —
  // на start_*. Без этих колонок откатывать было бы некуда.
  async (txn) => {
    const col = await txn.getFirstAsync<{ cid: number }>(
      `SELECT cid FROM pragma_table_info('reminder') WHERE name='start_odometer';`
    );
    if (!col) {
      await txn.execAsync(
        `ALTER TABLE reminder ADD COLUMN start_odometer INTEGER NOT NULL DEFAULT 0;`
      );
      await txn.execAsync(
        `ALTER TABLE reminder ADD COLUMN start_date TEXT NOT NULL DEFAULT '1970-01-01';`
      );
      // Настоящую точку старта задним числом не восстановить — она не
      // хранилась. Берём текущие last_*: это лучшее доступное приближение,
      // и статусы регламентов от миграции не меняются.
      await txn.runAsync(
        `UPDATE reminder SET start_odometer = last_odometer, start_date = last_date;`
      );
    }
  },
];

/**
 * Применяет все миграции от текущей user_version до SCHEMA_VERSION.
 * Каждый шаг выполняется в отдельной транзакции; user_version обновляется
 * ПОСЛЕ успешного коммита (PRAGMA не транзакционна).
 * При ошибке любого шага — откат + понятное сообщение в лог + re-throw.
 */
async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;

  if (version >= SCHEMA_VERSION) return;   // уже актуальная схема

  for (let v = version; v < SCHEMA_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    try {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await migrate(txn);
      });
    } catch (err) {
      console.error(`[DB] Миграция v${v}→v${v + 1} откатана:`, err);
      throw err;   // пробрасываем — bootstrap покажет ошибку
    }
    // PRAGMA не участвует в транзакции, ставим после успешного коммита
    await db.execAsync(`PRAGMA user_version = ${v + 1};`);
  }
}

// ─── инициализация ──────────────────────────────────────────────────────────

/**
 * Создаёт таблицы, запускает миграции, заполняет стартовые данные.
 * Вызывать один раз при старте. Безопасно повторно — дубликатов не создаст.
 *
 * @param deviceLanguage — язык телефона; используется только при первом запуске.
 */
export async function initDatabase(deviceLanguage: 'ru' | 'en' = 'ru', isClean = false): Promise<void> {
  const db = await openDatabase();

  // 1. Создаём таблицы (IF NOT EXISTS — идемпотентно)
  for (const sql of ALL_SCHEMAS) {
    await db.execAsync(sql);
  }

  // 2. Миграции схемы (до чтения onboarding_completed и вставки данных)
  await runMigrations(db);

  // 3. Стартовая запись машины (id = 1, только при первом запуске)
  await db.runAsync(
    `INSERT OR IGNORE INTO car (id, name, base_odometer, current_odometer, fuel_unit, currency)
     VALUES (1, 'Моя машина', 0, 0, 'литр', 'MDL');`
  );

  // 4. Стартовые настройки (id = 1) — язык берётся с устройства
  await db.runAsync(
    `INSERT OR IGNORE INTO app_settings (id, language, theme, notifications_enabled)
     VALUES (1, ?, 'dark', 1);`,
    deviceLanguage
  );

  // 5. Встроенные категории (12 штук)
  for (const cat of BUILTIN_CATEGORIES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO category (key, name, icon, is_builtin)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM category WHERE key = ? AND is_builtin = 1);`,
      cat.key, cat.name, cat.icon, cat.is_builtin, cat.key
    );
  }

  // 6. Стартовые регламенты — только для варианта data
  if (!isClean) {
    for (const r of REMINDER_SEEDS) {
      await db.runAsync(
        `INSERT OR IGNORE INTO reminder
           (car_id, title, type, interval_km, interval_days,
            start_odometer, start_date, last_odometer, last_date, warn_before)
         -- ТЗ 6.3: новый регламент стартует «в норме», с полным интервалом,
         -- поэтому отсчёт идёт от текущего пробега, а не от нуля.
         SELECT 1, ?, ?, ?, ?,
                (SELECT current_odometer FROM car WHERE id = 1), date('now'),
                (SELECT current_odometer FROM car WHERE id = 1), date('now'), ?
         WHERE NOT EXISTS (SELECT 1 FROM reminder WHERE car_id = 1 AND title = ?);`,
        r.title, r.type, r.interval_km, r.interval_days, r.warn_before, r.title
      );
    }
  }
}
