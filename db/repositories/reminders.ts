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
type NewReminder =
  Omit<Reminder, 'id' | 'start_odometer' | 'start_date' | 'last_odometer' | 'last_date'>
  & Partial<Pick<Reminder, 'start_odometer' | 'start_date' | 'last_odometer' | 'last_date'>>;

export async function addReminder(reminder: NewReminder): Promise<number> {
  const db = await openDatabase();

  const start_odometer = reminder.start_odometer
    ?? reminder.last_odometer
    ?? (await getCar())?.current_odometer
    ?? 0;
  const start_date = reminder.start_date ?? reminder.last_date ?? todayStr();

  // На старте last_* совпадают со start_*: работ по регламенту ещё не было.
  const last_odometer = reminder.last_odometer ?? start_odometer;
  const last_date     = reminder.last_date     ?? start_date;

  const result = await db.runAsync(
    `INSERT INTO reminder
       (car_id, title, type, interval_km, interval_days,
        start_odometer, start_date, last_odometer, last_date, warn_before)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    reminder.car_id,
    reminder.title,
    reminder.type,
    reminder.interval_km ?? null,
    reminder.interval_days ?? null,
    start_odometer,
    start_date,
    last_odometer,
    last_date,
    reminder.warn_before
  );
  return result.lastInsertRowId;
}

/**
 * Пересчитать last_odometer / last_date регламента из записей об
 * обслуживании (ТЗ 6.3).
 *
 * Берётся последняя запись SERVICE_RECORD, закрывшая этот регламент.
 * Если таких записей не осталось — откат на точку старта (start_*).
 *
 * Вызывается после добавления и удаления записи об обслуживании.
 * Это делает last_* производными: удалили запись, закрывавшую регламент, —
 * он честно возвращается в предыдущее состояние, а статус (он нигде не
 * хранится и считается на лету в utils/reminders.ts) следует автоматически.
 *
 * Идемпотентна.
 */
export async function syncReminderFromRecords(reminderId: number): Promise<void> {
  const db = await openDatabase();

  const last = await db.getFirstAsync<{ odometer: number; date: string }>(
    `SELECT odometer, date FROM service_record
      WHERE reminder_id = ?
      ORDER BY date DESC, odometer DESC, id DESC
      LIMIT 1;`,
    reminderId
  );

  if (last) {
    await db.runAsync(
      `UPDATE reminder SET last_odometer = ?, last_date = ? WHERE id = ?;`,
      last.odometer, last.date, reminderId
    );
  } else {
    await db.runAsync(
      `UPDATE reminder
          SET last_odometer = start_odometer, last_date = start_date
        WHERE id = ?;`,
      reminderId
    );
  }
}

// resetReminder удалён: last_* больше не выставляются вручную из формы
// «Сделано». Они выводятся из записей об обслуживании — см.
// syncReminderFromRecords(), которую дёргают add/deleteServiceRecord.
// Прежний вариант затирал last_* введёнными значениями даже тогда, когда
// добавлялась работа задним числом, и не откатывался при удалении записи.

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
