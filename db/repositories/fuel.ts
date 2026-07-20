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
 * Сумма литров неполных заправок строго МЕЖДУ двумя пробегами (fromOdo, toOdo).
 * §6.2: эти литры сожжены на интервале между полными баками и идут в числитель.
 */
async function sumPartialLitersBetween(
  carId: number, fromOdo: number, toOdo: number
): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ liters: number }>(
    `SELECT COALESCE(SUM(liters), 0) AS liters FROM fuel_entry
      WHERE car_id = ? AND is_full_tank = 0 AND odometer > ? AND odometer < ?;`,
    [carId, fromOdo, toOdo]
  );
  return row?.liters ?? 0;
}

/**
 * Сумма литров неполных заправок с пробегом строго больше odo — для живого
 * предпросмотра расхода в форме (следующий полный бак ещё не сохранён).
 */
export async function getPartialLitersSince(carId: number, odo: number): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ liters: number }>(
    `SELECT COALESCE(SUM(liters), 0) AS liters FROM fuel_entry
      WHERE car_id = ? AND is_full_tank = 0 AND odometer > ?;`,
    [carId, odo]
  );
  return row?.liters ?? 0;
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

  // Расход (§6.2, полная формула). Только для полного бака и при наличии
  // предыдущего полного бака. В числитель — литры этого полного бака ПЛЮС
  // литры всех неполных заправок строго между предыдущим и текущим полным.
  let consumption: number | null = null;
  if (entry.is_full_tank === 1) {
    const prev = await getLastFullTankEntry();
    if (prev) {
      const distance = entry.odometer - prev.odometer;
      if (distance > 0) {
        const partialLiters = await sumPartialLitersBetween(
          entry.car_id, prev.odometer, entry.odometer
        );
        const totalLiters = entry.liters + partialLiters;
        consumption = parseFloat(((totalLiters / distance) * 100).toFixed(2));
      }
    }
  }

  // null передаётся как элемент массива — надёжнее variadic при null в expo-sqlite
  const result = await db.runAsync(
    `INSERT INTO fuel_entry
       (car_id, date, odometer, liters, total_cost, price_per_liter, is_full_tank, consumption)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      entry.car_id,
      entry.date,
      entry.odometer,
      entry.liters,
      entry.total_cost,
      price_per_liter,
      entry.is_full_tank,
      consumption,
    ]
  );

  await syncOdometer(entry.odometer);
  return result.lastInsertRowId;
}

/** Удалить заправку по id. */
export async function deleteFuelEntry(id: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM fuel_entry WHERE id = ?;', id);
}

/** Получить заправку по id. */
export async function getFuelEntryById(id: number): Promise<FuelEntry | null> {
  const db = await openDatabase();
  return db.getFirstAsync<FuelEntry>('SELECT * FROM fuel_entry WHERE id = ?;', id);
}

/** Обновить поля заправки. Пересчёт consumption не производится автоматически. */
export async function updateFuelEntry(
  id: number,
  fields: Partial<Omit<FuelEntry, 'id' | 'car_id'>>
): Promise<void> {
  const db = await openDatabase();
  const entries = Object.entries(fields);
  if (entries.length === 0) return;

  const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
  const values = entries.map(([, val]) => val);

  await db.runAsync(
    `UPDATE fuel_entry SET ${setClauses} WHERE id = ?;`,
    ...values, id
  );
}

/**
 * Разовый пересчёт consumption у ВСЕХ полных баков по полной формуле §6.2
 * (миграция для записей, сохранённых по старой упрощённой формуле).
 *
 * Для каждого полного бака: литры_всего = литры полного + сумма литров
 * неполных строго между предыдущим и текущим полным; consumption =
 * литры_всего / пройдено × 100. У первого полного (без предыдущего) — null.
 * У неполных баков consumption не трогается (остаётся null).
 *
 * Идемпотентна: повторный вызов даёт тот же результат.
 * Возвращает число обновлённых записей (у которых значение изменилось).
 */
export async function recalcAllFullTankConsumption(): Promise<number> {
  const db = await openDatabase();
  const fulls = await db.getAllAsync<FuelEntry>(
    `SELECT * FROM fuel_entry WHERE is_full_tank = 1 ORDER BY car_id ASC, odometer ASC, id ASC;`
  );

  let updated = 0;
  const prevOdoByCar: Record<number, number> = {};

  for (const f of fulls) {
    const prevOdo = prevOdoByCar[f.car_id];
    let consumption: number | null = null;

    if (prevOdo !== undefined) {
      const distance = f.odometer - prevOdo;
      if (distance > 0) {
        const partialLiters = await sumPartialLitersBetween(f.car_id, prevOdo, f.odometer);
        const totalLiters = f.liters + partialLiters;
        consumption = parseFloat(((totalLiters / distance) * 100).toFixed(2));
      }
    }

    if (f.consumption !== consumption) {
      await db.runAsync('UPDATE fuel_entry SET consumption = ? WHERE id = ?;', [consumption, f.id]);
      updated++;
    }
    prevOdoByCar[f.car_id] = f.odometer;
  }

  return updated;
}
