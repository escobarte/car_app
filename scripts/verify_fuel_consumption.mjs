#!/usr/bin/env node
/**
 * Проверка алгоритма пересчёта расхода (§6.2) и правила base_odometer при
 * импорте (§5.1) на РЕАЛЬНОМ SQLite-движке (встроенный node:sqlite, Node 22+).
 *
 * Почему не импортирует db/repositories/fuel.ts и db/backup.ts напрямую:
 * они построены на expo-sqlite, который требует нативный Expo-раннтайм и не
 * запускается отдельным Node-скриптом. Поэтому ключевые SQL-запросы и
 * формулы здесь СКОПИРОВАНЫ построчно из тех файлов (сверяй при будущих
 * правках формулы — скрипт должен оставаться зеркалом, иначе проверка
 * бессмысленна). Это проверка алгоритма на настоящем SQLite, а не unit-тест
 * самого модуля.
 *
 * Запуск: node scripts/verify_fuel_consumption.mjs
 */

import { DatabaseSync } from 'node:sqlite';

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  OK    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail !== undefined ? ' — ' + detail : ''}`);
  }
}
function section(title) {
  console.log(`\n${title}`);
}

// ─── Зеркало db/schema.ts (только fuel_entry — всё, что нужно для этих сценариев) ──

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE fuel_entry (
      id              INTEGER PRIMARY KEY,
      car_id          INTEGER NOT NULL,
      date            TEXT    NOT NULL,
      odometer        INTEGER NOT NULL,
      liters          REAL    NOT NULL,
      total_cost      REAL    NOT NULL,
      price_per_liter REAL    NOT NULL,
      is_full_tank    INTEGER NOT NULL DEFAULT 1,
      consumption     REAL
    );
  `);
  return db;
}

// ─── Зеркало db/repositories/fuel.ts ────────────────────────────────────────

function getPrevFullTank(db, carId, odometer, excludeId) {
  if (excludeId != null) {
    return db
      .prepare(
        `SELECT * FROM fuel_entry
          WHERE car_id = ? AND is_full_tank = 1 AND odometer < ? AND id != ?
          ORDER BY odometer DESC LIMIT 1;`
      )
      .get(carId, odometer, excludeId);
  }
  return db
    .prepare(
      `SELECT * FROM fuel_entry
        WHERE car_id = ? AND is_full_tank = 1 AND odometer < ?
        ORDER BY odometer DESC LIMIT 1;`
    )
    .get(carId, odometer);
}

// Старая логика (до правки) — только для сравнения в отчёте этого скрипта.
function oldGetLastFullTankEntry(db, carId) {
  return db
    .prepare(
      `SELECT * FROM fuel_entry WHERE car_id = ? AND is_full_tank = 1 ORDER BY odometer DESC LIMIT 1;`
    )
    .get(carId);
}

function sumPartialLitersBetween(db, carId, fromOdo, toOdo) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(liters), 0) AS liters FROM fuel_entry
        WHERE car_id = ? AND is_full_tank = 0 AND odometer > ? AND odometer < ?;`
    )
    .get(carId, fromOdo, toOdo);
  return row.liters ?? 0;
}

function calcConsumption(fullTankLiters, partialLitersBetween, distance) {
  if (distance <= 0) return null;
  return parseFloat((((fullTankLiters + partialLitersBetween) / distance) * 100).toFixed(2));
}

// Зеркало getFuelSegments(): один сегмент = один полный бак с предыдущим.
function getFuelSegments(db, carId = 1) {
  const fulls = db
    .prepare(`SELECT * FROM fuel_entry WHERE car_id = ? AND is_full_tank = 1 ORDER BY odometer ASC, id ASC;`)
    .all(carId);

  const segments = [];
  for (const f of fulls) {
    const prev = getPrevFullTank(db, carId, f.odometer, f.id);
    if (!prev) continue;
    const km = f.odometer - prev.odometer;
    const partialLiters = sumPartialLitersBetween(db, carId, prev.odometer, f.odometer);
    const consumption = calcConsumption(f.liters, partialLiters, km);
    if (consumption == null) continue;
    segments.push({ fullTankId: f.id, date: f.date, liters: f.liters + partialLiters, km, consumption });
  }
  return segments;
}

// Зеркало calcWeightedConsumption(): сумма литров сегментов ÷ сумма км × 100.
function calcWeightedConsumption(segments) {
  if (segments.length === 0) return null;
  const totalLiters = segments.reduce((s, x) => s + x.liters, 0);
  const totalKm = segments.reduce((s, x) => s + x.km, 0);
  if (totalKm <= 0) return null;
  return parseFloat(((totalLiters / totalKm) * 100).toFixed(2));
}

// Зеркало recalcAllFullTankConsumption(): теперь строится на getFuelSegments(),
// а не на собственном цикле — так же, как после правки в db/repositories/fuel.ts.
function recalcAllFullTankConsumption(db, carId = 1) {
  const fulls = db
    .prepare(`SELECT * FROM fuel_entry WHERE car_id = ? AND is_full_tank = 1 ORDER BY odometer ASC, id ASC;`)
    .all(carId);
  const segments = getFuelSegments(db, carId);
  const consumptionByFullId = new Map(segments.map((s) => [s.fullTankId, s.consumption]));

  let updated = 0;
  for (const f of fulls) {
    const consumption = consumptionByFullId.get(f.id) ?? null;
    if (f.consumption !== consumption) {
      db.prepare(`UPDATE fuel_entry SET consumption = ? WHERE id = ?;`).run(consumption, f.id);
      updated++;
    }
  }
  return updated;
}

// Мимикрия addFuelEntry(): вставка + немедленный полный пересчёт.
function insertFuel(db, { carId = 1, date, odometer, liters, total_cost, is_full_tank }) {
  const price_per_liter = parseFloat((total_cost / liters).toFixed(2));
  db.prepare(
    `INSERT INTO fuel_entry (car_id, date, odometer, liters, total_cost, price_per_liter, is_full_tank, consumption)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL);`
  ).run(carId, date, odometer, liters, total_cost, price_per_liter, is_full_tank);
  recalcAllFullTankConsumption(db, carId);
}

function getByOdo(db, odometer) {
  return db.prepare(`SELECT * FROM fuel_entry WHERE odometer = ?;`).get(odometer);
}

// ─── Зеркало db/backup.ts: resolveImportedBaseOdometer ─────────────────────

function resolveImportedBaseOdometer(backup) {
  if (backup.car && typeof backup.car.base_odometer === 'number') {
    return backup.car.base_odometer;
  }
  const odos = [
    ...backup.fuelEntries.map((f) => f.odometer),
    ...backup.expenses.map((e) => e.odometer).filter((o) => o != null),
    ...backup.serviceRecords.map((s) => s.odometer),
  ].filter((o) => o > 0);
  if (odos.length > 0) return Math.min(...odos);
  return backup.car?.current_odometer ?? 0;
}

// ════════════════════════════════════════════════════════════════════════════
// Сценарий 1 — базовый пример из задачи: полный → 3 неполных → полный
// ════════════════════════════════════════════════════════════════════════════
section('Сценарий 1: полный (10000, 40л) → 3 неполных → полный (11000, 38л)');
{
  const db = freshDb();
  insertFuel(db, { date: '2026-01-01', odometer: 10000, liters: 40, total_cost: 400, is_full_tank: 1 });
  insertFuel(db, { date: '2026-01-05', odometer: 10300, liters: 15, total_cost: 150, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-10', odometer: 10550, liters: 12, total_cost: 120, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-15', odometer: 10800, liters: 10, total_cost: 100, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-20', odometer: 11000, liters: 38, total_cost: 380, is_full_tank: 1 });

  check('первый полный бак (10000) → consumption = null', getByOdo(db, 10000).consumption === null);
  check('неполная (10300) → consumption = null', getByOdo(db, 10300).consumption === null);
  check('неполная (10550) → consumption = null', getByOdo(db, 10550).consumption === null);
  check('неполная (10800) → consumption = null', getByOdo(db, 10800).consumption === null);
  check(
    'второй полный бак (11000) → consumption = 7.5',
    getByOdo(db, 11000).consumption === 7.5,
    `получено ${getByOdo(db, 11000).consumption}`
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Сценарий 2 — правка флага «полный бак» у старой записи (10300: 0 → 1)
// ════════════════════════════════════════════════════════════════════════════
section('Сценарий 2: правка флага «полный бак» у записи 10300 (неполная → полная)');
{
  const db = freshDb();
  insertFuel(db, { date: '2026-01-01', odometer: 10000, liters: 40, total_cost: 400, is_full_tank: 1 });
  insertFuel(db, { date: '2026-01-05', odometer: 10300, liters: 15, total_cost: 150, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-10', odometer: 10550, liters: 12, total_cost: 120, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-15', odometer: 10800, liters: 10, total_cost: 100, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-20', odometer: 11000, liters: 38, total_cost: 380, is_full_tank: 1 });

  // Мимикрия updateFuelEntry({ is_full_tank: 1 }) + авто-пересчёт.
  db.prepare(`UPDATE fuel_entry SET is_full_tank = 1 WHERE odometer = 10300;`).run();
  recalcAllFullTankConsumption(db);

  check(
    '10300 (теперь полный) → расход от 10000: 15/300×100 = 5.0',
    getByOdo(db, 10300).consumption === 5,
    `получено ${getByOdo(db, 10300).consumption}`
  );
  check(
    '11000 → предыдущий полный теперь 10300 (не 10000), расход = (38+22)/700×100 = 8.57',
    getByOdo(db, 11000).consumption === 8.57,
    `получено ${getByOdo(db, 11000).consumption}`
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Сценарий 3 — удаление неполной заправки (10550) из середины
// ════════════════════════════════════════════════════════════════════════════
section('Сценарий 3: удаление неполной заправки 10550 (12 л)');
{
  const db = freshDb();
  insertFuel(db, { date: '2026-01-01', odometer: 10000, liters: 40, total_cost: 400, is_full_tank: 1 });
  insertFuel(db, { date: '2026-01-05', odometer: 10300, liters: 15, total_cost: 150, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-10', odometer: 10550, liters: 12, total_cost: 120, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-15', odometer: 10800, liters: 10, total_cost: 100, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-20', odometer: 11000, liters: 38, total_cost: 380, is_full_tank: 1 });

  // Мимикрия deleteFuelEntry(): удаление + авто-пересчёт.
  db.prepare(`DELETE FROM fuel_entry WHERE odometer = 10550;`).run();
  recalcAllFullTankConsumption(db);

  check(
    '11000 после удаления 12 л → (38 + 15 + 10)/1000×100 = 6.3',
    getByOdo(db, 11000).consumption === 6.3,
    `получено ${getByOdo(db, 11000).consumption}`
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Сценарий 4 — запись с МЕНЬШИМ пробегом, чем у последней (вставка не по порядку)
// ════════════════════════════════════════════════════════════════════════════
section('Сценарий 4: полный бак вставлен задним числом между двумя существующими');
{
  const db = freshDb();
  insertFuel(db, { date: '2026-01-01', odometer: 10000, liters: 40, total_cost: 400, is_full_tank: 1 });
  insertFuel(db, { date: '2026-01-20', odometer: 11000, liters: 38, total_cost: 380, is_full_tank: 1 });

  check(
    'до вставки: 11000 → (38)/1000×100 = 3.8',
    getByOdo(db, 11000).consumption === 3.8,
    `получено ${getByOdo(db, 11000).consumption}`
  );

  // Старый подход (ORDER BY odometer DESC LIMIT 1 без фильтра "< this.odometer")
  // для вставляемой записи 10500 вернул бы 11000 как «предыдущий» — дистанция
  // 10500-11000 = -500, то есть одометр "назад". Показываем это явно:
  const buggy = oldGetLastFullTankEntry(db, 1);
  check(
    'старая логика (для справки) взяла бы предыдущим баком именно 11000 — неверно для 10500',
    buggy.odometer === 11000
  );

  // Вставляем задним числом полный бак 10500 (дата раньше, чем у 11000, но
  // пользователь вводит её позже по времени использования приложения).
  insertFuel(db, { date: '2026-01-12', odometer: 10500, liters: 20, total_cost: 200, is_full_tank: 1 });

  check(
    'новая запись 10500 → предыдущий найден корректно как 10000 (не 11000): 20/500×100 = 4.0',
    getByOdo(db, 10500).consumption === 4,
    `получено ${getByOdo(db, 10500).consumption}`
  );
  check(
    '11000 пересчитан: предыдущий теперь 10500 (не 10000): 38/500×100 = 7.6',
    getByOdo(db, 11000).consumption === 7.6,
    `получено ${getByOdo(db, 11000).consumption}`
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Сценарий 5 — импорт файла со старым/несогласованным current_odometer
// ════════════════════════════════════════════════════════════════════════════
section('Сценарий 5: правило base_odometer при импорте JSON-бэкапа');
{
  // (a) В файле есть car.base_odometer (новый формат) — берём его как есть.
  const backupWithBase = {
    car: { base_odometer: 9500, current_odometer: 9000 }, // current ниже base — бывает после ручной правки
    fuelEntries: [{ odometer: 10000 }, { odometer: 11000 }],
    expenses: [],
    serviceRecords: [],
  };
  check(
    '(a) base_odometer есть в файле → берём его напрямую (9500)',
    resolveImportedBaseOdometer(backupWithBase) === 9500
  );

  // (b) Старый формат без base_odometer, но есть записи — минимальный
  // положительный пробег среди них (10000), а не current_odometer (9000,
  // устаревшее/несогласованное значение из файла).
  const backupOldFormat = {
    car: { current_odometer: 9000 }, // base_odometer отсутствует вовсе
    fuelEntries: [{ odometer: 10000 }, { odometer: 10300 }, { odometer: 11000 }],
    expenses: [{ odometer: null }, { odometer: 9800 }],
    serviceRecords: [{ odometer: 10100 }],
  };
  check(
    '(b) base_odometer нет, current_odometer устарел (9000) → берём минимум среди записей (9800)',
    resolveImportedBaseOdometer(backupOldFormat) === 9800,
    `получено ${resolveImportedBaseOdometer(backupOldFormat)}`
  );

  // Итоговый одометр после пересчёта (мимикрия recalcCurrentOdometer):
  // MAX(base_odometer, все odometer из записей) — должен прийти к
  // максимальному пробегу (11000), а не застыть на устаревшем current_odometer
  // из файла (9000).
  const base = resolveImportedBaseOdometer(backupOldFormat);
  const maxRecordOdo = Math.max(
    ...backupOldFormat.fuelEntries.map((f) => f.odometer),
    ...backupOldFormat.expenses.filter((e) => e.odometer != null).map((e) => e.odometer),
    ...backupOldFormat.serviceRecords.map((s) => s.odometer)
  );
  const recalculated = Math.max(base, maxRecordOdo);
  check(
    'после recalcCurrentOdometer() итоговый одометр = 11000 (максимум из записей), а не 9000 из файла',
    recalculated === 11000,
    `получено ${recalculated}`
  );

  // (c) Совсем без записей и без base_odometer — единственное известное
  // число это current_odometer из файла.
  const backupEmpty = {
    car: { current_odometer: 7777 },
    fuelEntries: [],
    expenses: [],
    serviceRecords: [],
  };
  check(
    '(c) записей нет, base_odometer нет → fallback на current_odometer (7777)',
    resolveImportedBaseOdometer(backupEmpty) === 7777
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Сценарий 6 — средневзвешенный расход (сумма л ÷ сумма км × 100) против
// простого среднего по заправкам: выброс-сегмент на коротком пробеге не
// должен весить столько же, сколько обычный длинный сегмент.
// ════════════════════════════════════════════════════════════════════════════
section('Сценарий 6: средневзвешенный расход vs простое среднее (выброс-сегмент)');
{
  const db = freshDb();
  insertFuel(db, { date: '2026-01-01', odometer: 10000, liters: 40, total_cost: 400, is_full_tank: 1 });
  insertFuel(db, { date: '2026-01-05', odometer: 10300, liters: 15, total_cost: 150, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-10', odometer: 10550, liters: 12, total_cost: 120, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-15', odometer: 10800, liters: 10, total_cost: 100, is_full_tank: 0 });
  insertFuel(db, { date: '2026-01-20', odometer: 11000, liters: 38, total_cost: 380, is_full_tank: 1 }); // сегмент 1: 75 л / 1000 км = 7.5
  insertFuel(db, { date: '2026-02-05', odometer: 11400, liters: 30, total_cost: 300, is_full_tank: 1 }); // сегмент 2: 30 л /  400 км = 7.5

  check(
    'сегмент 1 (11000) = 7.5 л/100км',
    getByOdo(db, 11000).consumption === 7.5,
    `получено ${getByOdo(db, 11000).consumption}`
  );
  check(
    'сегмент 2 (11400) = 7.5 л/100км',
    getByOdo(db, 11400).consumption === 7.5,
    `получено ${getByOdo(db, 11400).consumption}`
  );

  // Оба сегмента дают одинаковый расход (7.5) — на этом наборе простое
  // среднее и средневзвешенное совпадают, разницу это ещё не показывает.
  let segments = getFuelSegments(db);
  check(
    'на двух равных сегментах среднее и средневзвешенное совпадают: 7.5',
    calcWeightedConsumption(segments) === 7.5,
    `получено ${calcWeightedConsumption(segments)}`
  );

  // Добавляем выброс: короткий сегмент 50 км на 10 л = 20 л/100км.
  insertFuel(db, { date: '2026-02-10', odometer: 11450, liters: 10, total_cost: 100, is_full_tank: 1 });
  check(
    'сегмент-выброс (11450): 50 км, 10 л → 20 л/100км',
    getByOdo(db, 11450).consumption === 20,
    `получено ${getByOdo(db, 11450).consumption}`
  );

  segments = getFuelSegments(db);
  const simpleAvg = parseFloat(
    (segments.reduce((s, x) => s + x.consumption, 0) / segments.length).toFixed(2)
  );
  const weightedAvg = calcWeightedConsumption(segments);

  check(
    'простое среднее трёх сегментов (7.5, 7.5, 20.0) = 11.67',
    simpleAvg === 11.67,
    `получено ${simpleAvg}`
  );
  check(
    'средневзвешенное = (75+30+10) / (1000+400+50) × 100 = 7.93',
    weightedAvg === 7.93,
    `получено ${weightedAvg}`
  );
  check(
    'средневзвешенное заметно ниже простого среднего (короткий выброс не весит как длинный сегмент)',
    weightedAvg < simpleAvg,
    `weighted=${weightedAvg}, simple=${simpleAvg}`
  );

  // Без сегментов (например, только одна заправка в истории) — null, «—».
  const emptyDb = freshDb();
  check(
    'нет сегментов → calcWeightedConsumption = null',
    calcWeightedConsumption(getFuelSegments(emptyDb)) === null
  );
}

// ─── Итог ────────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
