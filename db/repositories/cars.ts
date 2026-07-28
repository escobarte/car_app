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
 * Задать базовый пробег (онбординг, ручная правка в настройках)
 * и сразу пересчитать current_odometer.
 */
export async function setBaseOdometer(value: number): Promise<number> {
  const db = await openDatabase();
  await db.runAsync('UPDATE car SET base_odometer = ? WHERE id = 1;', value);
  return recalcCurrentOdometer();
}

// ─── Пересчёт одометра (ТЗ 5.1) ──────────────────────────────────────────────

/**
 * Слушатель, который дёргается после каждого пересчёта одометра.
 * Через него пере-оцениваются статусы регламентов (ТЗ 6.3): сами статусы
 * нигде не хранятся и считаются на лету в utils/reminders.ts, но от них
 * зависит расписание уведомлений — его надо пересобрать.
 *
 * Регистрируется один раз в app/_layout.tsx. Сделано колбэком, а не прямым
 * импортом, чтобы слой БД не зависел от notifications/engine (тот сам
 * импортирует @/db — получился бы цикл).
 */
let onRecalculated: ((odometer: number) => void) | null = null;

export function setOdometerRecalcListener(fn: ((odometer: number) => void) | null): void {
  onRecalculated = fn;
}

/**
 * Пересчитать CAR.current_odometer = максимум из базового пробега машины
 * и всех odometer в fuel_entry / expense / service_record.
 *
 * Вызывается после КАЖДОГО добавления, редактирования и удаления записи.
 * В отличие от прежнего syncOdometer, который умел только повышать пробег,
 * этот пересчёт возвращает одометр вниз, когда запись с максимальным
 * пробегом удалена или отредактирована.
 *
 * Возвращает новое значение current_odometer.
 */
export async function recalcCurrentOdometer(): Promise<number> {
  const db = await openDatabase();

  await db.runAsync(`
    UPDATE car
    SET current_odometer = (
      SELECT MAX(v) FROM (
        SELECT base_odometer                     AS v FROM car            WHERE id     = 1
        UNION ALL
        SELECT COALESCE(MAX(odometer), 0)        AS v FROM fuel_entry     WHERE car_id = 1
        UNION ALL
        -- expense.odometer NULLable: записи без пробега в максимум не идут
        SELECT COALESCE(MAX(odometer), 0)        AS v FROM expense        WHERE car_id = 1
        UNION ALL
        SELECT COALESCE(MAX(odometer), 0)        AS v FROM service_record WHERE car_id = 1
      )
    )
    WHERE id = 1;
  `);

  const row = await db.getFirstAsync<{ current_odometer: number }>(
    'SELECT current_odometer FROM car WHERE id = 1;'
  );
  const odometer = row?.current_odometer ?? 0;

  onRecalculated?.(odometer);
  return odometer;
}
