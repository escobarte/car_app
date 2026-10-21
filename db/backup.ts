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
import { recalcCurrentOdometer } from './repositories/cars';
import { recalcAllFullTankConsumption } from './repositories/fuel';

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

export type ExportResult =
  | { ok: true;  fileName: string }
  | { ok: false; code: 'cancelled' | 'failed'; detail?: string };

// ─── Экспорт ─────────────────────────────────────────────────────────────────

/** Собирает все данные из БД в формат бэкапа + готовое имя файла. */
async function buildBackupPayload(): Promise<{ fileName: string; content: string }> {
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

  return { fileName, content };
}

/**
 * Экспорт в папку, выбранную пользователем (Android, Storage Access
 * Framework) — единственное действие, без скрытого перехода на sharing.
 *
 * Раньше ошибка записи через SAF (createFileAsync/writeAsStringAsync) тихо
 * глушилась в пустом catch, и код автоматически открывал системное меню
 * «поделиться» с файлом из кэша — пользователь после выбора папки и выдачи
 * разрешения неожиданно видел Share-sheet, а в выбранной папке файла не
 * оказывалось (запись в неё реально не удалась, но об этом не сообщалось).
 * Это и была причина баг-репорта. Теперь: либо чёткий успех, либо явная
 * ошибка (`ExportResult`) — никакого автоматического sharing.
 *
 * Дополнительно перечитываем записанный файл и сравниваем длину с исходным
 * содержимым: известная проблема нестабильных SAF-провайдеров (например,
 * Google Drive) — createFileAsync/writeAsStringAsync иногда не бросают
 * исключение, а файл в папке всё равно оказывается пустым или усечённым.
 * Без перечитывания такой случай выглядел бы как успех.
 */
export async function exportDatabaseToFolder(): Promise<ExportResult> {
  if (Platform.OS !== 'android') {
    // SAF — платформенная технология Android; на iOS такого выбора папки
    // в принципе нет (там только exportDatabaseViaShare).
    return { ok: false, code: 'failed', detail: 'StorageAccessFramework is Android-only' };
  }

  let fileName: string;
  let content: string;
  try {
    ({ fileName, content } = await buildBackupPayload());
  } catch (e) {
    return { ok: false, code: 'failed', detail: String(e) };
  }

  const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perm.granted) {
    return { ok: false, code: 'cancelled' };
  }

  try {
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      perm.directoryUri,
      fileName,
      'application/json',
    );
    await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Проверка: перечитываем и сравниваем длину (не просто «> 0» — так
    // ловим и усечённую запись, не только полностью пустую).
    const readBack = await FileSystem.StorageAccessFramework.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (readBack.length !== content.length) {
      throw new Error(
        `File written but corrupted: expected ${content.length} bytes, got ${readBack.length}`,
      );
    }

    return { ok: true, fileName };
  } catch (e) {
    return { ok: false, code: 'failed', detail: String(e) };
  }
}

/**
 * Экспорт через системное меню «Поделиться» — без выбора папки, одно
 * действие на любой платформе (включая iOS, где SAF недоступен) и для
 * любого провайдера/приложения (Google Drive, Telegram, «Файлы» и т.д.).
 * Запасной вариант на случай, если exportDatabaseToFolder() не сработал
 * для конкретной папки/провайдера пользователя (см. docs/ТЗ, раздел 9).
 */
export async function exportDatabaseViaShare(): Promise<ExportResult> {
  let fileName: string;
  let content: string;
  try {
    ({ fileName, content } = await buildBackupPayload());
  } catch (e) {
    return { ok: false, code: 'failed', detail: String(e) };
  }

  try {
    const tempUri = (FileSystem.cacheDirectory ?? '') + fileName;
    await FileSystem.writeAsStringAsync(tempUri, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return { ok: false, code: 'failed', detail: 'Sharing is not available on this device' };
    }

    await Sharing.shareAsync(tempUri, {
      mimeType:    'application/json',
      dialogTitle: 'Export data',
      UTI:         'public.json',
    });

    return { ok: true, fileName };
  } catch (e) {
    return { ok: false, code: 'failed', detail: String(e) };
  }
}

// ─── Импорт ──────────────────────────────────────────────────────────────────

/**
 * База для car.base_odometer при импорте (ТЗ 5.1: это нижняя граница, ниже
 * которой recalcCurrentOdometer() не опустит пробег).
 *
 * Правило (по приоритету):
 * 1. В файле есть car.base_odometer (бэкап сделан после миграции v1→v2,
 *    когда это поле появилось в схеме) — берём его. Это именно то число,
 *    что пользователь когда-то ввёл руками, самое достоверное значение.
 * 2. Поля нет (старый формат бэкапа) — берём минимальный ПОЛОЖИТЕЛЬНЫЙ
 *    odometer среди всех заливаемых записей (заправки/расходы/обслуживание).
 *    Нельзя слепо взять current_odometer: тогда base_odometer окажется
 *    выше всех исторических записей, а recalcCurrentOdometer() всё равно
 *    вернёт MAX(base, записи) — но если потом самую раннюю запись удалят,
 *    одометр не опустится ниже раздутого base_odometer, хотя реально
 *    машина когда-то прошла меньше. Минимальный пробег среди записей —
 *    самая ранняя точка, которая реально зафиксирована в истории.
 * 3. Записей с пробегом нет вообще — единственное известное число это
 *    current_odometer из файла.
 */
function resolveImportedBaseOdometer(backup: BackupData): number {
  if (backup.car && typeof backup.car.base_odometer === 'number') {
    return backup.car.base_odometer;
  }

  const odos = [
    ...backup.fuelEntries.map((f) => f.odometer),
    ...backup.expenses.map((e) => e.odometer).filter((o): o is number => o != null),
    ...backup.serviceRecords.map((s) => s.odometer),
  ].filter((o) => o > 0);

  if (odos.length > 0) return Math.min(...odos);

  return backup.car?.current_odometer ?? 0;
}

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
        const base_odometer = resolveImportedBaseOdometer(backup);
        // current_odometer выставляем начальным значением из файла — сразу
        // после транзакции recalcCurrentOdometer() пересчитает его как
        // MAX(base_odometer, все odometer из только что залитых записей),
        // поэтому неточность здесь не критична.
        await txn.runAsync(
          `UPDATE car SET name=?, base_odometer=?, current_odometer=?, fuel_unit=?, currency=? WHERE id=1;`,
          backup.car.name, base_odometer, backup.car.current_odometer,
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
          // start_* в старых файлах бэкапа нет — подставляем last_*:
          // на момент выгрузки это и было состоянием регламента.
          `INSERT INTO reminder
             (id, car_id, title, type, interval_km, interval_days,
              start_odometer, start_date, last_odometer, last_date, warn_before)
           VALUES (?,?,?,?,?,?,?,?,?,?,?);`,
          r.id, r.car_id, r.title, r.type,
          r.interval_km ?? null, r.interval_days ?? null,
          r.start_odometer ?? r.last_odometer, r.start_date ?? r.last_date,
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

  // 4. Пересчёт одометра и расхода — ВНЕ транзакции (оба читают только что
  // закоммиченные данные через обычный openDatabase(), а не txn). До этой
  // правки импорт не трогал ни то, ни другое: car.current_odometer/
  // base_odometer брались из файла как есть, а fuel_entry.price_per_liter/
  // consumption заливались без проверки, что они согласуются с остальными
  // залитыми записями (например, после правки файла руками).
  // price_per_liter НЕ пересчитывается намеренно (из файла как есть) —
  // только consumption, у которого есть собственная формула и чёткие
  // условия пустоты (см. calcConsumption/recalcAllFullTankConsumption).
  await recalcCurrentOdometer();
  await recalcAllFullTankConsumption();

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
