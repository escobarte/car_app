/**
 * Репозиторий: SERVICE_RECORD — выполненные работы обслуживания.
 */

import { openDatabase, ServiceRecord } from '../database';
import { recalcCurrentOdometer } from './cars';
import { syncReminderFromRecords } from './reminders';

/** Все записи обслуживания, от новых к старым. */
export async function getAllServiceRecords(): Promise<ServiceRecord[]> {
  const db = await openDatabase();
  return db.getAllAsync<ServiceRecord>(
    'SELECT * FROM service_record ORDER BY date DESC, id DESC;'
  );
}

/** Записи обслуживания по конкретному регламенту. */
export async function getServiceRecordsByReminder(
  reminderId: number
): Promise<ServiceRecord[]> {
  const db = await openDatabase();
  return db.getAllAsync<ServiceRecord>(
    `SELECT * FROM service_record
     WHERE reminder_id = ?
     ORDER BY date DESC;`,
    reminderId
  );
}

/**
 * Добавить запись об обслуживании.
 * Обновляет пробег машины и, если запись закрывает регламент,
 * пересчитывает его last_odometer / last_date (ТЗ 6.3).
 */
export async function addServiceRecord(
  entry: Omit<ServiceRecord, 'id'>
): Promise<number> {
  const db = await openDatabase();
  const result = await db.runAsync(
    `INSERT INTO service_record (car_id, reminder_id, date, odometer, cost, note)
     VALUES (?, ?, ?, ?, ?, ?);`,
    entry.car_id,
    entry.reminder_id ?? null,
    entry.date,
    entry.odometer,
    entry.cost,
    entry.note
  );

  if (entry.reminder_id != null) {
    await syncReminderFromRecords(entry.reminder_id);
  }

  await recalcCurrentOdometer();
  return result.lastInsertRowId;
}

/**
 * Удалить запись обслуживания по id.
 *
 * Если запись закрывала регламент, его last_odometer / last_date
 * откатываются на предыдущую запись, а при её отсутствии — на точку
 * старта регламента (ТЗ 6.3). Статус пересчитывается следом: он
 * производный от last_* и текущего пробега.
 */
export async function deleteServiceRecord(id: number): Promise<void> {
  const db = await openDatabase();

  // reminder_id читаем ДО удаления — потом строки уже не будет
  const row = await db.getFirstAsync<{ reminder_id: number | null }>(
    'SELECT reminder_id FROM service_record WHERE id = ?;',
    id
  );

  await db.runAsync('DELETE FROM service_record WHERE id = ?;', id);

  if (row?.reminder_id != null) {
    await syncReminderFromRecords(row.reminder_id);
  }

  await recalcCurrentOdometer();
}
