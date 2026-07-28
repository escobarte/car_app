/**
 * Репозиторий: REMINDER — регламенты / напоминания об обслуживании.
 */

import { openDatabase, Reminder } from '../database';
import { getCar } from './cars';

/** Сегодня в формате 'YYYY-MM-DD' по локальному времени. */
function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Все регламенты машины. */
export async function getAllReminders(): Promise<Reminder[]> {
  const db = await openDatabase();
  return db.getAllAsync<Reminder>(
    'SELECT * FROM reminder WHERE car_id = 1 ORDER BY id ASC;'
  );
}

/** Один регламент по id. */
export async function getReminderById(id: number): Promise<Reminder | null> {
  const db = await openDatabase();
  return db.getFirstAsync<Reminder>('SELECT * FROM reminder WHERE id = ?;', id);
}

/**
 * Добавить регламент.
 *
 * ТЗ 6.3: новый регламент обязан стартовать «в норме», с полным интервалом
 * впереди. Поэтому точка отсчёта по умолчанию — не ноль:
 *   type='mileage' → last_odometer = текущий пробег машины
 *   type='time'    → last_date     = сегодня
 * Оба поля выставляются всегда (неиспользуемое для данного типа просто
 * не участвует в расчёте) — так регламент останется корректным, если
 * пользователь потом сменит тип при редактировании.
 *
 * Значения можно передать явно — это нужно импорту бэкапа.
 */
export async function addReminder(
  reminder: Omit<Reminder, 'id' | 'last_odometer' | 'last_date'>
          & Partial<Pick<Reminder, 'last_odometer' | 'last_date'>>
): Promise<number> {
  const db = await openDatabase();

  const last_odometer = reminder.last_odometer
    ?? (await getCar())?.current_odometer
    ?? 0;
  const last_date = reminder.last_date ?? todayStr();

  const result = await db.runAsync(
    `INSERT INTO reminder
       (car_id, title, type, interval_km, interval_days, last_odometer, last_date, warn_before)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    reminder.car_id,
    reminder.title,
    reminder.type,
    reminder.interval_km ?? null,
    reminder.interval_days ?? null,
    last_odometer,
    last_date,
    reminder.warn_before
  );
  return result.lastInsertRowId;
}

/**
 * Сбросить регламент после выполнения («Сделано»).
 * Обновляет last_odometer и last_date на текущие значения.
 */
export async function resetReminder(
  id: number,
  currentOdometer: number,
  currentDate: string   // 'YYYY-MM-DD'
): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    `UPDATE reminder
     SET last_odometer = ?, last_date = ?
     WHERE id = ?;`,
    currentOdometer, currentDate, id
  );
}

/** Обновить параметры регламента. */
export async function updateReminder(
  id: number,
  fields: Partial<Omit<Reminder, 'id' | 'car_id'>>
): Promise<void> {
  const db = await openDatabase();
  const entries = Object.entries(fields);
  if (entries.length === 0) return;

  const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
  const values = entries.map(([, val]) => val);

  await db.runAsync(
    `UPDATE reminder SET ${setClauses} WHERE id = ?;`,
    ...values, id
  );
}

/** Удалить регламент по id. */
export async function deleteReminder(id: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM reminder WHERE id = ?;', id);
}
