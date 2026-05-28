/**
 * Утилиты для разработки — НЕ для продакшна.
 * Удалить или убрать из экспорта перед релизом.
 */

import { openDatabase } from './database';

export type CleanupResult = {
  deletedFuel:    number;   // сколько записей удалено
  remainingFuel:  number;   // сколько осталось
  odoReset:       number;   // на что установлен current_odometer
};

/**
 * Удаляет все заправки с одометром > 205 071 (тестовые записи).
 * Сбрасывает current_odometer на 205 071.
 * Безопасно вызывать несколько раз: при отсутствии «лишних» записей ничего не меняет.
 */
export async function cleanupTestData(): Promise<CleanupResult> {
  const db = await openDatabase();

  // Считаем, сколько будет удалено
  const toDelRow = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM fuel_entry WHERE odometer > 205071;'
  );
  const deletedFuel = toDelRow?.cnt ?? 0;

  // Удаляем
  await db.runAsync('DELETE FROM fuel_entry WHERE odometer > 205071;');

  // Сбрасываем пробег
  const TARGET_ODO = 205071;
  await db.runAsync(
    'UPDATE car SET current_odometer = ? WHERE id = 1;',
    TARGET_ODO
  );

  // Сколько записей осталось
  const remainRow = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM fuel_entry;'
  );
  const remainingFuel = remainRow?.cnt ?? 0;

  return { deletedFuel, remainingFuel, odoReset: TARGET_ODO };
}
