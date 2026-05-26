/**
 * Репозиторий: APP_SETTINGS — настройки приложения (одна запись, id = 1).
 */

import { openDatabase, AppSettings } from '../database';

/** Получить настройки приложения. */
export async function getSettings(): Promise<AppSettings | null> {
  const db = await openDatabase();
  return db.getFirstAsync<AppSettings>('SELECT * FROM app_settings WHERE id = 1;');
}

/**
 * Обновить одно или несколько полей настроек.
 * Пример: updateSettings({ language: 'en' })
 */
export async function updateSettings(
  fields: Partial<Omit<AppSettings, 'id'>>
): Promise<void> {
  const db = await openDatabase();
  const entries = Object.entries(fields);
  if (entries.length === 0) return;

  const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
  const values = entries.map(([, val]) => val);

  await db.runAsync(
    `UPDATE app_settings SET ${setClauses} WHERE id = 1;`,
    ...values
  );
}
