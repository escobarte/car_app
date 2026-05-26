/**
 * Репозиторий: FUEL_ENTRY — заправки.
 */

import { openDatabase, FuelEntry } from '../database';
import { syncOdometer } from './cars';

/** Все заправки, от новых к старым. */
export async function getAllFuelEntries(): Promise<FuelEntry[]> {
  const db = await openDatabase();
  return db.getAllAsync<FuelEntry>('SELECT * FROM fuel_entry ORDER BY date DESC, id DESC;');
}

/** Заправки за указанный месяц (формат: 'YYYY-MM'). */
export async function getFuelEntriesByMonth(yearMonth: string): Promise<FuelEntry[]> {
  const db = await openDatabase();
  return db.getAllAsync<FuelEntry>(
    `SELECT * FROM fuel_entry
     WHERE strftime('%Y-%m', date) = ?
     ORDER BY date DESC;`,
    yearMonth
  );
}

/** Последняя заправка с полным баком (нужна для расчёта расхода). */
export async function getLastFullTankEntry(): Promise<FuelEntry | null> {
  const db = await openDatabase();
  return db.getFirstAsync<FuelEntry>(
    `SELECT * FROM fuel_entry
     WHERE is_full_tank = 1
     ORDER BY odometer DESC
     LIMIT 1;`
  );
}

/**
 * Добавить заправку.
 * price_per_liter считается автоматически.
 * Если бак полный — считается consumption.
 * Обновляет пробег машины.
 */
export async function addFuelEntry(
  entry: Omit<FuelEntry, 'id' | 'price_per_liter' | 'consumption'>
): Promise<number> {
  const db = await openDatabase();

  const price_per_liter = parseFloat((entry.total_cost / entry.liters).toFixed(2));

  let consumption: number | null = null;
  if (entry.is_full_tank === 1) {
    const prev = await getLastFullTankEntry();
    if (prev) {
      const distance = entry.odometer - prev.odometer;
      if (distance > 0) {
        consumption = parseFloat(((entry.liters / distance) * 100).toFixed(2));
      }
    }
  }

  const result = await db.runAsync(
    `INSERT INTO fuel_entry
       (car_id, date, odometer, liters, total_cost, price_per_liter, is_full_tank, consumption)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    entry.car_id,
    entry.date,
    entry.odometer,
    entry.liters,
    entry.total_cost,
    price_per_liter,
    entry.is_full_tank,
    consumption
  );

  await syncOdometer(entry.odometer);
  return result.lastInsertRowId;
}

/** Удалить заправку по id. */
export async function deleteFuelEntry(id: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM fuel_entry WHERE id = ?;', id);
}
