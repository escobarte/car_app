/**
 * Репозиторий: REMINDER — регламенты / напоминания об обслуживании.
 */

import { openDatabase, Reminder } from '../database';

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

/** Добавить пользовательский регламент. */
export async function addReminder(
  reminder: Omit<Reminder, 'id'>
): Promise<number> {
  const db = await openDatabase();
  const result = await db.runAsync(
    `INSERT INTO reminder
       (car_id, title, type, interval_km, interval_days, last_odometer, last_date, warn_before)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    reminder.car_id,
    reminder.title,
    reminder.type,
    reminder.interval_km ?? null,
    reminder.interval_days ?? null,
    reminder.last_odometer,
    reminder.last_date,
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
