/**
 * SQL-схема всех 7 таблиц приложения.
 * Каждая таблица создаётся только если её ещё нет (IF NOT EXISTS).
 * SQLite хранит bool как INTEGER (0 = false, 1 = true),
 * float как REAL, дату как TEXT в формате ISO 8601 ('YYYY-MM-DD').
 */

export const CREATE_TABLE_CAR = `
  CREATE TABLE IF NOT EXISTS car (
    id               INTEGER PRIMARY KEY NOT NULL,
    name             TEXT    NOT NULL DEFAULT 'Моя машина',
    -- Базовый пробег: введён в онбординге или вручную в настройках.
    -- Отправная точка, ниже которой current_odometer не опускается.
    base_odometer    INTEGER NOT NULL DEFAULT 0,
    -- Производное значение: MAX(base_odometer, все odometer в записях).
    -- Пересчитывается carRepo.recalcCurrentOdometer(), руками не писать.
    current_odometer INTEGER NOT NULL DEFAULT 0,
    fuel_unit        TEXT    NOT NULL DEFAULT 'литр',
    currency         TEXT    NOT NULL DEFAULT 'MDL'
  );
`;

export const CREATE_TABLE_FUEL_ENTRY = `
  CREATE TABLE IF NOT EXISTS fuel_entry (
    id              INTEGER PRIMARY KEY NOT NULL,
    car_id          INTEGER NOT NULL REFERENCES car(id),
    date            TEXT    NOT NULL,
    odometer        INTEGER NOT NULL,
    liters          REAL    NOT NULL,
    total_cost      REAL    NOT NULL,
    price_per_liter REAL    NOT NULL,
    is_full_tank    INTEGER NOT NULL DEFAULT 1,
    consumption     REAL
  );
`;

export const CREATE_TABLE_EXPENSE = `
  CREATE TABLE IF NOT EXISTS expense (
    id          INTEGER PRIMARY KEY NOT NULL,
    car_id      INTEGER NOT NULL REFERENCES car(id),
    category_id INTEGER NOT NULL REFERENCES category(id),
    date        TEXT    NOT NULL,
    odometer    INTEGER,
    amount      REAL    NOT NULL,
    description TEXT    NOT NULL DEFAULT ''
  );
`;

export const CREATE_TABLE_CATEGORY = `
  CREATE TABLE IF NOT EXISTS category (
    id         INTEGER PRIMARY KEY NOT NULL,
    key        TEXT    NOT NULL DEFAULT '',
    name       TEXT    NOT NULL,
    icon       TEXT    NOT NULL DEFAULT 'tag',
    is_builtin INTEGER NOT NULL DEFAULT 0
  );
`;

export const CREATE_TABLE_SERVICE_RECORD = `
  CREATE TABLE IF NOT EXISTS service_record (
    id          INTEGER PRIMARY KEY NOT NULL,
    car_id      INTEGER NOT NULL REFERENCES car(id),
    reminder_id INTEGER REFERENCES reminder(id),
    date        TEXT    NOT NULL,
    odometer    INTEGER NOT NULL DEFAULT 0,
    cost        REAL    NOT NULL DEFAULT 0,
    note        TEXT    NOT NULL DEFAULT ''
  );
`;

export const CREATE_TABLE_REMINDER = `
  CREATE TABLE IF NOT EXISTS reminder (
    id            INTEGER PRIMARY KEY NOT NULL,
    car_id        INTEGER NOT NULL REFERENCES car(id),
    title         TEXT    NOT NULL,
    type          TEXT    NOT NULL CHECK(type IN ('mileage', 'time')),
    interval_km   INTEGER,
    interval_days INTEGER,
    -- Точка старта регламента (момент создания, ТЗ 6.3). Неизменна.
    -- Нужна, чтобы откатить last_* при удалении единственной записи
    -- об обслуживании: иначе возвращать было бы некуда.
    start_odometer INTEGER NOT NULL DEFAULT 0,
    start_date     TEXT   NOT NULL DEFAULT (date('now')),
    -- Производные: последняя закрывшая регламент запись SERVICE_RECORD,
    -- либо start_*, если таких записей нет.
    -- Пересчитываются reminderRepo.syncReminderFromRecords().
    last_odometer INTEGER NOT NULL DEFAULT 0,
    last_date     TEXT    NOT NULL DEFAULT (date('now')),
    warn_before   INTEGER NOT NULL DEFAULT 0
  );
`;

export const CREATE_TABLE_APP_SETTINGS = `
  CREATE TABLE IF NOT EXISTS app_settings (
    id                    INTEGER PRIMARY KEY NOT NULL,
    language              TEXT    NOT NULL DEFAULT 'ru',
    theme                 TEXT    NOT NULL DEFAULT 'dark',
    notifications_enabled INTEGER NOT NULL DEFAULT 1,
    onboarding_completed  INTEGER NOT NULL DEFAULT 0
  );
`;

/** Все CREATE-запросы в правильном порядке (с учётом FK-зависимостей) */
export const ALL_SCHEMAS = [
  CREATE_TABLE_CAR,
  CREATE_TABLE_CATEGORY,       // expense ссылается на category → сначала category
  CREATE_TABLE_FUEL_ENTRY,
  CREATE_TABLE_EXPENSE,
  CREATE_TABLE_REMINDER,       // service_record ссылается на reminder → сначала reminder
  CREATE_TABLE_SERVICE_RECORD,
  CREATE_TABLE_APP_SETTINGS,
];
