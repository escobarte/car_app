/**
 * Репозиторий: EXPENSE — прочие расходы.
 */

import { openDatabase, Expense } from '../database';
import { syncOdometer } from './cars';

/** Все расходы, от новых к старым. */
export async function getAllExpenses(): Promise<Expense[]> {
  const db = await openDatabase();
  return db.getAllAsync<Expense>('SELECT * FROM expense ORDER BY date DESC, id DESC;');
}

/** Расходы за месяц (формат: 'YYYY-MM'). */
export async function getExpensesByMonth(yearMonth: string): Promise<Expense[]> {
  const db = await openDatabase();
  return db.getAllAsync<Expense>(
    `SELECT * FROM expense
     WHERE strftime('%Y-%m', date) = ?
     ORDER BY date DESC;`,
    yearMonth
  );
}

/** Расходы по категории. */
export async function getExpensesByCategory(categoryId: number): Promise<Expense[]> {
  const db = await openDatabase();
  return db.getAllAsync<Expense>(
    'SELECT * FROM expense WHERE category_id = ? ORDER BY date DESC;',
    categoryId
  );
}

/** Добавить расход. Обновляет пробег машины, если передан одометр. */
export async function addExpense(
  entry: Omit<Expense, 'id'>
): Promise<number> {
  const db = await openDatabase();
  // null передаётся элементом массива — надёжнее variadic при null в expo-sqlite
  const result = await db.runAsync(
    `INSERT INTO expense (car_id, category_id, date, odometer, amount, description)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [entry.car_id, entry.category_id, entry.date, entry.odometer ?? null, entry.amount, entry.description]
  );

  if (entry.odometer != null) {
    await syncOdometer(entry.odometer);
  }

  return result.lastInsertRowId;
}

/** Обновить расход. */
export async function updateExpense(
  id: number,
  fields: Partial<Omit<Expense, 'id' | 'car_id'>>
): Promise<void> {
  const db = await openDatabase();
  const entries = Object.entries(fields);
  if (entries.length === 0) return;

  const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
  const values = entries.map(([, val]) => val);

  await db.runAsync(
    `UPDATE expense SET ${setClauses} WHERE id = ?;`,
    ...values, id
  );
}

/** Получить расход по id. */
export async function getExpenseById(id: number): Promise<Expense | null> {
  const db = await openDatabase();
  return db.getFirstAsync<Expense>('SELECT * FROM expense WHERE id = ?;', id);
}

/** Удалить расход по id. */
export async function deleteExpense(id: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM expense WHERE id = ?;', id);
}
