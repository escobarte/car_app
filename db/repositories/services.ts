/**
 * Репозиторий: SERVICE_RECORD — выполненные работы обслуживания.
 */

import { openDatabase, ServiceRecord } from '../database';
import { recalcCurrentOdometer } from './cars';

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
 * Обновляет пробег машины.
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

  await recalcCurrentOdometer();
  return result.lastInsertRowId;
}

/** Удалить запись обслуживания по id. Пробег машины пересчитывается. */
export async function deleteServiceRecord(id: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM service_record WHERE id = ?;', id);
  await recalcCurrentOdometer();
}
