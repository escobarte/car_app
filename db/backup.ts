/**
 * Экспорт / импорт базы данных в JSON (раздел 9 ТЗ).
 *
 * Формат файла:
 *   car_backup_YYYY-MM-DD_HHmm.json
 *   { version:1, exportDate, car, settings, categories, reminders,
 *     fuelEntries, expenses, serviceRecords }
 */

import { Platform }        from 'react-native';
import * as FileSystem     from 'expo-file-system/legacy';
import * as Sharing        from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { openDatabase, Car, FuelEntry, Expense, Category, ServiceRecord, Reminder, AppSettings } from './database';

// ─── Типы ────────────────────────────────────────────────────────────────────

export type BackupData = {
  version:        1;
  exportDate:     string;
  car:            Car | null;
  settings:       AppSettings | null;
  categories:     Category[];
  reminders:      Reminder[];
  fuelEntries:    FuelEntry[];
  expenses:       Expense[];
  serviceRecords: ServiceRecord[];
};

export type ImportResult =
  | { ok: true;  counts: { fuel: number; expense: number; service: number; reminder: number; category: number } }
  | { ok: false; code: 'cancelled' | 'invalid_file' | 'restore_failed'; detail?: string };

// ─── Экспорт ─────────────────────────────────────────────────────────────────

/**
 * Собирает все данные из БД и сохраняет JSON.
 *
 * Android: открывает SAF-диалог выбора папки → сохраняет файл туда.
 * Если SAF не поддерживается провайдером (Google Drive и др.) — автоматически
 * переходит на fallback sharing.
 * Fallback (SAF отклонён / ошибка / iOS): открывает Share-диалог.
 *
 * Возвращает имя файла при SAF-сохранении (нужен Alert на вызывающей стороне),
 * или null если использовался sharing (диалог сам является подтверждением).
 */
export async function exportDatabase(): Promise<string | null> {
  const db = await openDatabase();

  const [car, settings, categories, reminders, fuelEntries, expenses, serviceRecords] =
    await Promise.all([
      db.getFirstAsync<Car>('SELECT * FROM car WHERE id = 1;'),
      db.getFirstAsync<AppSettings>('SELECT * FROM app_settings WHERE id = 1;'),
      db.getAllAsync<Category>('SELECT * FROM category ORDER BY id;'),
      db.getAllAsync<Reminder>('SELECT * FROM reminder ORDER BY id;'),
      db.getAllAsync<FuelEntry>('SELECT * FROM fuel_entry ORDER BY id;'),
      db.getAllAsync<Expense>('SELECT * FROM expense ORDER BY id;'),
      db.getAllAsync<ServiceRecord>('SELECT * FROM service_record ORDER BY id;'),
    ]);

  const backup: BackupData = {
    version:    1,
    exportDate: new Date().toISOString(),
    car, settings, categories, reminders, fuelEntries, expenses, serviceRecords,
  };

  const now      = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const hh       = String(now.getHours()).padStart(2, '0');
  const mm       = String(now.getMinutes()).padStart(2, '0');
  const fileName = `car_backup_${datePart}_${hh}${mm}.json`;
  const content  = JSON.stringify(backup, null, 2);

  // ── Android: SAF ────────────────────────────────────────────────────────────
  if (Platform.OS === 'android') {
    const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (perm.granted) {
      try {
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          perm.directoryUri,
          fileName,
          'application/json',
        );
        await FileSystem.writeAsStringAsync(fileUri, content, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        return fileName;
      } catch {
        // Провайдер не поддерживает запись через SAF (например, Google Drive).
        // Автоматически переходим на sharing — ошибку не показываем.
      }
    }
    // Папка не выбрана или SAF-запись не поддерживается → sharing
  }

  // ── Fallback: sharing (iOS, SAF отклонён или недоступен) ───────────────────
  const tempUri = (FileSystem.cacheDirectory ?? '') + fileName;
  await FileSystem.writeAsStringAsync(tempUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');

  await Sharing.shareAsync(tempUri, {
    mimeType:    'application/json',
    dialogTitle: 'Export data',
    UTI:         'public.json',
  });

  return null;
}

// ─── Импорт ──────────────────────────────────────────────────────────────────

/**
 * Открывает file picker, читает JSON, валидирует структуру и заливает данные в БД.
 * Возвращает ImportResult.
 * При ошибке внутри транзакции withExclusiveTransactionAsync автоматически откатывает изменения.
 */
export async function importDatabase(): Promise<ImportResult> {
  // 1. Выбрать файл
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', '*/*'],
    copyToCacheDirectory: true,
  });

  if (picked.canceled || picked.assets.length === 0) {
    return { ok: false, code: 'cancelled' };
  }

  const fileUri = picked.assets[0].uri;

  // 2. Прочитать, распарсить, валидировать структуру
  let backup: BackupData;
  try {
    const raw = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(raw) as BackupData;

    if (parsed.version !== 1)                  throw new Error('Unknown backup version');
    if (!Array.isArray(parsed.categories))     throw new Error('Missing categories');
    if (!Array.isArray(parsed.reminders))      throw new Error('Missing reminders');
    if (!Array.isArray(parsed.fuelEntries))    throw new Error('Missing fuelEntries');
    if (!Array.isArray(parsed.expenses))       throw new Error('Missing expenses');
    if (!Array.isArray(parsed.serviceRecords)) throw new Error('Missing serviceRecords');

    backup = parsed;
  } catch (e) {
    return { ok: false, code: 'invalid_file', detail: String(e) };
  }

  // 3. Восстановить данные в транзакции (withExclusiveTransactionAsync откатывает при throw)
  const db = await openDatabase();

  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      // Очищаем все данные (порядок важен из-за возможных FK)
      await txn.execAsync(`
        DELETE FROM service_record;
        DELETE FROM expense;
        DELETE FROM fuel_entry;
        DELETE FROM reminder;
        DELETE FROM category;
      `);

      // Обновляем машину и настройки (они уже существуют с id=1)
      if (backup.car) {
        await txn.runAsync(
          `UPDATE car SET name=?, current_odometer=?, fuel_unit=?, currency=? WHERE id=1;`,
          backup.car.name, backup.car.current_odometer,
          backup.car.fuel_unit, backup.car.currency,
        );
      }
      if (backup.settings) {
        await txn.runAsync(
          `UPDATE app_settings SET language=?, theme=?, notifications_enabled=? WHERE id=1;`,
          backup.settings.language, backup.settings.theme,
          backup.settings.notifications_enabled,
        );
      }
      // Импорт означает что пользователь уже работал с приложением
      await txn.runAsync(`UPDATE app_settings SET onboarding_completed = 1 WHERE id = 1;`);

      // Категории — сохраняем оригинальные id
      for (const c of backup.categories) {
        await txn.runAsync(
          `INSERT INTO category (id, key, name, icon, is_builtin) VALUES (?,?,?,?,?);`,
          c.id, c.key, c.name, c.icon, c.is_builtin,
        );
      }

      // Регламенты
      for (const r of backup.reminders) {
        await txn.runAsync(
          `INSERT INTO reminder
             (id, car_id, title, type, interval_km, interval_days, last_odometer, last_date, warn_before)
           VALUES (?,?,?,?,?,?,?,?,?);`,
          r.id, r.car_id, r.title, r.type,
          r.interval_km ?? null, r.interval_days ?? null,
          r.last_odometer, r.last_date, r.warn_before,
        );
      }

      // Заправки
      for (const f of backup.fuelEntries) {
        await txn.runAsync(
          `INSERT INTO fuel_entry
             (id, car_id, date, odometer, liters, total_cost, price_per_liter, is_full_tank, consumption)
           VALUES (?,?,?,?,?,?,?,?,?);`,
          f.id, f.car_id, f.date, f.odometer, f.liters,
          f.total_cost, f.price_per_liter, f.is_full_tank, f.consumption ?? null,
        );
      }

      // Расходы
      for (const e of backup.expenses) {
        await txn.runAsync(
          `INSERT INTO expense
             (id, car_id, category_id, date, odometer, amount, description)
           VALUES (?,?,?,?,?,?,?);`,
          e.id, e.car_id, e.category_id, e.date,
          e.odometer ?? null, e.amount, e.description,
        );
      }

      // Записи обслуживания
      for (const s of backup.serviceRecords) {
        await txn.runAsync(
          `INSERT INTO service_record
             (id, car_id, reminder_id, date, odometer, cost, note)
           VALUES (?,?,?,?,?,?,?);`,
          s.id, s.car_id, s.reminder_id ?? null,
          s.date, s.odometer, s.cost, s.note,
        );
      }

      // Сбрасываем auto-increment, но только если таблица sqlite_sequence существует.
      // В чистой БД (без AUTOINCREMENT-вставок) она может отсутствовать.
      const hasSeqTable = await txn.getFirstAsync<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence';`,
      );
      if (hasSeqTable) {
        await txn.execAsync(`
          UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM category)       WHERE name='category';
          UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM reminder)       WHERE name='reminder';
          UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM fuel_entry)     WHERE name='fuel_entry';
          UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM expense)        WHERE name='expense';
          UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM service_record) WHERE name='service_record';
        `);
      }
    });
  } catch (e) {
    return { ok: false, code: 'restore_failed', detail: String(e) };
  }

  return {
    ok: true,
    counts: {
      fuel:     backup.fuelEntries.length,
      expense:  backup.expenses.length,
      service:  backup.serviceRecords.length,
      reminder: backup.reminders.length,
      category: backup.categories.length,
    },
  };
}
