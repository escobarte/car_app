/**
 * Разовый импорт старых данных из Google-таблицы (раздел 8 ТЗ).
 *
 * Данные сверены пользователем и захардкожены здесь как константы.
 * Функция importLegacyData() безопасна для повторного вызова и идемпотентна
 * по строкам: вставляются только записи, которых ещё нет в базе (дедуп по
 * уникальному ключу). Это позволяет дозаливать новые строки из CSV без дублей.
 *
 * Цена литра и расход НЕ импортируются — они пересчитываются автоматически
 * через addFuelEntry() по формулам из раздела 6.1–6.2 ТЗ.
 */

import { openDatabase } from './database';
import { addFuelEntry }  from './repositories/fuel';
import { addExpense }    from './repositories/expenses';
import { getAllCategories } from './repositories/categories';
import { syncOdometer }  from './repositories/cars';

// ─── Заправки (20 записей, сверены 27.05.2026) ──────────────────────────────
type FuelSeed = {
  date: string;
  odometer: number;
  liters: number;
  total_cost: number;
  is_full_tank: 0 | 1;
};

const FUEL_SEEDS: FuelSeed[] = [
  { date: '2025-12-04', odometer: 198814, liters: 17.00, total_cost: 400.00,  is_full_tank: 1 },
  { date: '2025-12-12', odometer: 199006, liters: 25.90, total_cost: 600.00,  is_full_tank: 1 },
  { date: '2025-12-21', odometer: 199317, liters: 17.92, total_cost: 400.00,  is_full_tank: 1 },
  { date: '2025-12-25', odometer: 199438, liters: 38.75, total_cost: 851.34,  is_full_tank: 1 },
  { date: '2026-01-03', odometer: 199795, liters: 32.04, total_cost: 703.00,  is_full_tank: 1 },
  { date: '2026-01-10', odometer: 200039, liters: 23.36, total_cost: 516.72,  is_full_tank: 1 },
  { date: '2026-01-16', odometer: 200488, liters: 36.00, total_cost: 814.00,  is_full_tank: 1 },
  { date: '2026-01-24', odometer: 200680, liters: 22.27, total_cost: 511.00,  is_full_tank: 1 },
  { date: '2026-02-07', odometer: 200979, liters: 35.92, total_cost: 831.18,  is_full_tank: 1 },
  { date: '2026-02-21', odometer: 201323, liters: 38.04, total_cost: 890.13,  is_full_tank: 1 },
  { date: '2026-03-04', odometer: 201707, liters: 33.62, total_cost: 805.87,  is_full_tank: 1 },
  { date: '2026-03-13', odometer: 202240, liters: 35.52, total_cost: 916.41,  is_full_tank: 1 },
  { date: '2026-03-27', odometer: 202753, liters: 37.04, total_cost: 1090.00, is_full_tank: 1 },
  { date: '2026-04-09', odometer: 203372, liters: 16.76, total_cost: 500.00,  is_full_tank: 0 },
  { date: '2026-04-13', odometer: 203657, liters: 16.77, total_cost: 500.00,  is_full_tank: 0 },
  { date: '2026-04-20', odometer: 203905, liters: 6.84,  total_cost: 200.00,  is_full_tank: 0 },
  { date: '2026-04-24', odometer: 204088, liters: 6.88,  total_cost: 200.00,  is_full_tank: 0 },
  { date: '2026-04-26', odometer: 204205, liters: 45.40, total_cost: 1324.00, is_full_tank: 1 },
  { date: '2026-05-17', odometer: 204879, liters: 12.97, total_cost: 400.00,  is_full_tank: 0 },
  { date: '2026-05-21', odometer: 205071, liters: 6.43,  total_cost: 200.00,  is_full_tank: 0 },
  // Дозаливка CSV от 2026-07-20 (новые заправки):
  { date: '2026-05-30', odometer: 205367, liters: 16.30, total_cost: 500.00,  is_full_tank: 0 },
  { date: '2026-06-12', odometer: 205669, liters: 17.41, total_cost: 500.00,  is_full_tank: 0 },
  { date: '2026-06-14', odometer: 205906, liters: 27.86, total_cost: 800.00,  is_full_tank: 0 },
];

// ─── Расходы (14 записей, сверены 27.05.2026) ───────────────────────────────
type ExpenseSeed = {
  date: string;
  category_key: string;
  description: string;
  odometer: number | null;
  amount: number;
};

const EXPENSE_SEEDS: ExpenseSeed[] = [
  { date: '2025-12-04', category_key: 'documents',      description: 'Переоформление',       odometer: 198814, amount: 1140 },
  { date: '2025-12-05', category_key: 'documents',      description: 'Страховка',             odometer: 198900, amount: 176  },
  { date: '2025-12-09', category_key: 'chemistry',      description: 'Glass Cleaner',         odometer: 198930, amount: 315  },
  { date: '2025-12-13', category_key: 'tuning',         description: 'Перепрошивка',          odometer: 199015, amount: 900  },
  { date: '2025-12-13', category_key: 'accessories',    description: 'Xiaomi Parking',        odometer: 199015, amount: 300  },
  { date: '2025-12-13', category_key: 'electronics',    description: 'Rear Camera',           odometer: 199015, amount: 685  },
  { date: '2025-12-16', category_key: 'service',        description: 'ТО Ходовая',            odometer: 199163, amount: 350  },
  { date: '2026-01-06', category_key: 'comfort',        description: 'Подставка под кресло',  odometer: 199750, amount: 395  },
  { date: '2026-01-11', category_key: 'electronics',    description: 'Камера + регистратор',  odometer: 200211, amount: 1400 },
  { date: '2026-01-11', category_key: 'parts',          description: 'Лампа бардачка',        odometer: 200211, amount: 35   },
  { date: '2026-03-10', category_key: 'gov_inspection', description: 'ТО+Стра+Дорога',        odometer: 202007, amount: 3700 },
  { date: '2026-03-21', category_key: 'service',        description: 'Ремонт Скола',          odometer: 202428, amount: 300  },
  { date: '2026-03-21', category_key: 'service',        description: 'Дворники (АвтоВаЗ)',    odometer: 202428, amount: 300  },
  { date: '2026-03-21', category_key: 'service',        description: 'Развал Схождения',      odometer: 202428, amount: 300  },
];

// ─── Результат импорта ───────────────────────────────────────────────────────
export type ImportResult = {
  fuelCount: number;
  expenseCount: number;
  skipped: boolean;    // true = импорт уже был сделан ранее
};

// ─── Основная функция ────────────────────────────────────────────────────────
//
// Идемпотентно по строкам: при каждом запуске вставляются ТОЛЬКО те записи из
// сидов, которых ещё нет в базе. Уникальный ключ заправки — дата + пробег +
// сумма; расхода — дата + сумма + описание. Это позволяет безопасно дозаливать
// новые строки из CSV, не задваивая существующие.
//
// addFuelEntry() сам считает price_per_liter (6.1), consumption для полных
// баков (6.2) и обновляет CAR.current_odometer.
export async function importLegacyData(): Promise<ImportResult> {
  const db = await openDatabase();

  // Словарь category_key → category_id (из уже заполненной таблицы)
  const categories = await getAllCategories();
  const catMap = Object.fromEntries(categories.map((c) => [c.key, c.id]));

  // 1. Заправки — вставляем только отсутствующие (дедуп по дате+пробегу+сумме).
  let fuelCount = 0;
  for (const seed of FUEL_SEEDS) {
    const found = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM fuel_entry
        WHERE car_id = 1 AND date = ? AND odometer = ? AND ABS(total_cost - ?) < 0.01
        LIMIT 1;`,
      [seed.date, seed.odometer, seed.total_cost]
    );
    if (found) continue;

    await addFuelEntry({
      car_id:      1,
      date:        seed.date,
      odometer:    seed.odometer,
      liters:      seed.liters,
      total_cost:  seed.total_cost,
      is_full_tank: seed.is_full_tank,
    });
    fuelCount++;
  }

  // 2. Расходы — вставляем только отсутствующие (дедуп по дате+сумме+описанию).
  let expenseCount = 0;
  for (const seed of EXPENSE_SEEDS) {
    const category_id = catMap[seed.category_key];
    if (!category_id) {
      console.warn(`[import] Категория не найдена: ${seed.category_key}`);
      continue;
    }

    const found = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM expense
        WHERE car_id = 1 AND date = ? AND ABS(amount - ?) < 0.01 AND description = ?
        LIMIT 1;`,
      [seed.date, seed.amount, seed.description]
    );
    if (found) continue;

    await addExpense({
      car_id:      1,
      category_id,
      date:        seed.date,
      odometer:    seed.odometer,
      amount:      seed.amount,
      description: seed.description,
    });
    expenseCount++;
  }

  // 3. Явно выставляем максимальный пробег из сидов на случай, если
  //    syncOdometer что-то пропустил при частичных заправках.
  const maxOdo = FUEL_SEEDS.reduce((m, f) => Math.max(m, f.odometer), 0);
  await syncOdometer(maxOdo);

  // skipped = ничего нового не добавили (для отладочного экрана db-check).
  return { fuelCount, expenseCount, skipped: fuelCount === 0 && expenseCount === 0 };
}
