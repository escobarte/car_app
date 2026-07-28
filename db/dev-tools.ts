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
 */
export async function cleanupTestData(): Promise<CleanupResult> {
  const db = await openDatabase();

  const toDelRow = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM fuel_entry WHERE odometer > 205071;'
  );
  const deletedFuel = toDelRow?.cnt ?? 0;

  await db.runAsync('DELETE FROM fuel_entry WHERE odometer > 205071;');

  const TARGET_ODO = 205071;
  // base_odometer тоже: current_odometer производный, его перетёр бы
  // следующий пересчёт (carRepo.recalcCurrentOdometer).
  await db.runAsync(
    'UPDATE car SET base_odometer = ?, current_odometer = ? WHERE id = 1;',
    TARGET_ODO, TARGET_ODO
  );

  const remainRow = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM fuel_entry;'
  );
  const remainingFuel = remainRow?.cnt ?? 0;

  return { deletedFuel, remainingFuel, odoReset: TARGET_ODO };
}

// ─── Аномальные записи заправок ──────────────────────────────────────────────

export type AnomalousFuelEntry = {
  id:         number;
  date:       string;
  odometer:   number;
  liters:     number;
  total_cost: number;
  consumption: number | null;
  reason:     string;   // почему помечена как аномальная
};

/**
 * Ищет аномальные записи заправок:
 *  1. Расход топлива > 20 л/100км (явная ошибка ввода)
 *  2. Расстояние между двумя последовательными ПОЛНЫМИ баками < 50 км
 *     (такие короткие пробеги дают бессмысленный расчёт расхода)
 */
export async function getAnomalousFuelEntries(): Promise<AnomalousFuelEntry[]> {
  const db = await openDatabase();

  const result: AnomalousFuelEntry[] = [];

  // 1. Расход > 20 л/100км
  const highCons = await db.getAllAsync<{
    id: number; date: string; odometer: number;
    liters: number; total_cost: number; consumption: number;
  }>(
    `SELECT id, date, odometer, liters, total_cost, consumption
     FROM fuel_entry
     WHERE consumption IS NOT NULL AND consumption > 20
     ORDER BY date DESC;`
  );
  for (const row of highCons) {
    result.push({ ...row, reason: `расход ${row.consumption.toFixed(1)} л/100км > 20` });
  }

  // 2. Пробег между соседними полными баками < 50 км
  const fullTanks = await db.getAllAsync<{
    id: number; date: string; odometer: number;
    liters: number; total_cost: number; consumption: number | null;
  }>(
    `SELECT id, date, odometer, liters, total_cost, consumption
     FROM fuel_entry
     WHERE is_full_tank = 1
     ORDER BY odometer ASC;`
  );
  for (let i = 1; i < fullTanks.length; i++) {
    const gap = fullTanks[i].odometer - fullTanks[i - 1].odometer;
    if (gap < 50) {
      // Добавляем «меньшую» из двух записей, чтобы не создавать дублей
      const entry = fullTanks[i - 1];
      // Не добавлять, если уже есть в result (по id)
      if (!result.some(r => r.id === entry.id)) {
        result.push({ ...entry, reason: `разрыв до след. полн. бака ${gap} км < 50` });
      }
    }
  }

  // Сортируем по дате (новые сначала)
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

/**
 * Удаляет заправки по массиву id.
 * Возвращает количество удалённых.
 */
export async function deleteAnomalousFuelEntries(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await openDatabase();
  const placeholders = ids.map(() => '?').join(', ');
  const res = await db.runAsync(
    `DELETE FROM fuel_entry WHERE id IN (${placeholders});`,
    ...ids
  );
  return res.changes;
}
