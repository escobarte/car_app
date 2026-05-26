/**
 * Репозиторий: CATEGORY — справочник категорий расходов.
 */

import { openDatabase, Category } from '../database';

/** Все категории (встроенные + пользовательские). */
export async function getAllCategories(): Promise<Category[]> {
  const db = await openDatabase();
  return db.getAllAsync<Category>(
    'SELECT * FROM category ORDER BY is_builtin DESC, name ASC;'
  );
}

/** Одна категория по id. */
export async function getCategoryById(id: number): Promise<Category | null> {
  const db = await openDatabase();
  return db.getFirstAsync<Category>('SELECT * FROM category WHERE id = ?;', id);
}

/** Добавить пользовательскую категорию. */
export async function addCategory(
  name: string,
  icon: string
): Promise<number> {
  const db = await openDatabase();
  const result = await db.runAsync(
    `INSERT INTO category (key, name, icon, is_builtin) VALUES ('', ?, ?, 0);`,
    name, icon
  );
  return result.lastInsertRowId;
}

/** Изменить название и/или иконку любой категории. */
export async function updateCategory(
  id: number,
  fields: { name?: string; icon?: string }
): Promise<void> {
  const db = await openDatabase();
  const entries = Object.entries(fields);
  if (entries.length === 0) return;

  const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
  const values = entries.map(([, val]) => val);

  await db.runAsync(
    `UPDATE category SET ${setClauses} WHERE id = ?;`,
    ...values, id
  );
}

/**
 * Удалить пользовательскую категорию.
 * Возвращает 'deleted' | 'builtin' | 'has_expenses'.
 * - builtin:      встроенную удалять нельзя.
 * - has_expenses: на категорию ссылаются расходы — удалять нельзя.
 */
export async function deleteCategory(
  id: number
): Promise<'deleted' | 'builtin' | 'has_expenses'> {
  const db = await openDatabase();

  const cat = await getCategoryById(id);
  if (!cat) return 'deleted'; // уже не существует
  if (cat.is_builtin === 1) return 'builtin';

  const linked = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM expense WHERE category_id = ?;',
    id
  );
  if (linked && linked.cnt > 0) return 'has_expenses';

  await db.runAsync('DELETE FROM category WHERE id = ?;', id);
  return 'deleted';
}
