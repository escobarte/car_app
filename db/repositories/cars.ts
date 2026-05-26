/**
 * Репозиторий: CAR — одна запись о машине.
 */

import { openDatabase, Car } from '../database';

/** Получить данные машины (всегда id = 1). */
export async function getCar(): Promise<Car | null> {
  const db = await openDatabase();
  return db.getFirstAsync<Car>('SELECT * FROM car WHERE id = 1;');
}

/**
 * Обновить поля машины.
 * Можно передать любое подмножество полей.
 */
export async function updateCar(fields: Partial<Omit<Car, 'id'>>): Promise<void> {
  const db = await openDatabase();
  const entries = Object.entries(fields);
  if (entries.length === 0) return;

  const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
  const values = entries.map(([, val]) => val);

  await db.runAsync(
    `UPDATE car SET ${setClauses} WHERE id = 1;`,
    ...values
  );
}

/**
 * Обновить пробег машины, если новый пробег больше текущего.
 * Вызывается автоматически при любой новой записи с пробегом.
 */
export async function syncOdometer(newOdometer: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    `UPDATE car SET current_odometer = ?
     WHERE id = 1 AND ? > current_odometer;`,
    newOdometer, newOdometer
  );
}
