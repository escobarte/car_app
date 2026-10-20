#!/usr/bin/env node
/**
 * Проверка: расход (EXPENSE) с пробегом ниже текущего одометра не должен
 * уменьшать CAR.current_odometer, а при редактировании/удалении такой записи
 * одометр пересчитывается корректно (ТЗ 5.1, задача «прошлые расходы»).
 *
 * Почему не импортирует db/repositories/* напрямую: они построены на
 * expo-sqlite, который требует нативный Expo-раннтайм и не запускается
 * отдельным Node-скриптом. SQL recalcCurrentOdometer() здесь СКОПИРОВАН
 * построчно из db/repositories/cars.ts — сверяй при будущих правках формулы,
 * иначе проверка перестанет быть зеркалом реального кода.
 *
 * Запуск: node scripts/verify_expenses.mjs
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

// ─── Зеркало db/schema.ts (только то, что нужно для этих сценариев) ─────────

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE car (
      id               INTEGER PRIMARY KEY NOT NULL,
      base_odometer    INTEGER NOT NULL DEFAULT 0,
      current_odometer INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE fuel_entry (
      id       INTEGER PRIMARY KEY,
      car_id   INTEGER NOT NULL,
      odometer INTEGER NOT NULL
    );
    CREATE TABLE expense (
      id       INTEGER PRIMARY KEY,
      car_id   INTEGER NOT NULL,
      date     TEXT NOT NULL,
      odometer INTEGER,
      amount   REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE service_record (
      id       INTEGER PRIMARY KEY,
      car_id   INTEGER NOT NULL,
      odometer INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO car (id, base_odometer, current_odometer) VALUES (1, 0, 0);
  `);
  return db;
}

// ─── Зеркало db/repositories/cars.ts: recalcCurrentOdometer() ───────────────

function recalcCurrentOdometer(db) {
  db.exec(`
    UPDATE car
    SET current_odometer = (
      SELECT MAX(v) FROM (
        SELECT base_odometer                     AS v FROM car            WHERE id     = 1
        UNION ALL
        SELECT COALESCE(MAX(odometer), 0)        AS v FROM fuel_entry     WHERE car_id = 1
        UNION ALL
        SELECT COALESCE(MAX(odometer), 0)        AS v FROM expense        WHERE car_id = 1
        UNION ALL
        SELECT COALESCE(MAX(odometer), 0)        AS v FROM service_record WHERE car_id = 1
      )
    )
    WHERE id = 1;
  `);
  return db.prepare('SELECT current_odometer FROM car WHERE id = 1;').get().current_odometer;
}

// ─── Зеркало db/repositories/expenses.ts ────────────────────────────────────

function addExpense(db, { date, odometer, amount }) {
  db.prepare(
    `INSERT INTO expense (car_id, date, odometer, amount) VALUES (1, ?, ?, ?);`
  ).run(date, odometer, amount);
  return recalcCurrentOdometer(db);
}

function updateExpenseOdometer(db, id, odometer) {
  db.prepare(`UPDATE expense SET odometer = ? WHERE id = ?;`).run(odometer, id);
  return recalcCurrentOdometer(db);
}

function deleteExpense(db, id) {
  db.prepare(`DELETE FROM expense WHERE id = ?;`).run(id);
  return recalcCurrentOdometer(db);
}

// ─── Сценарий 1: расход задним числом с пробегом ниже текущего ──────────────

section('Сценарий 1: прошлый расход (пробег 202007) при текущем одометре 211294');
{
  const db = freshDb();
  db.exec(`UPDATE car SET base_odometer = 211294, current_odometer = 211294 WHERE id = 1;`);

  const after = addExpense(db, { date: '2026-03-10', odometer: 202007, amount: 500 });
  check('current_odometer не уменьшился', after === 211294, `получили ${after}`);

  const row = db.prepare('SELECT odometer FROM expense ORDER BY id DESC LIMIT 1;').get();
  check('расход сохранён с пробегом 202007 (не заблокирован)', row.odometer === 202007);
}

// ─── Сценарий 2: расход с пробегом выше текущего поднимает одометр ──────────

section('Сценарий 2: расход с пробегом выше текущего поднимает одометр');
{
  const db = freshDb();
  db.exec(`UPDATE car SET base_odometer = 100000, current_odometer = 100000 WHERE id = 1;`);

  const after = addExpense(db, { date: '2026-10-01', odometer: 105000, amount: 300 });
  check('current_odometer вырос до 105000', after === 105000, `получили ${after}`);
}

// ─── Сценарий 3: редактирование — понижение пробега у максимальной записи ───

section('Сценарий 3: правка расхода с максимальным пробегом на меньшее значение');
{
  const db = freshDb();
  db.exec(`UPDATE car SET base_odometer = 100000, current_odometer = 100000 WHERE id = 1;`);
  db.prepare(`INSERT INTO expense (car_id, date, odometer, amount) VALUES (1, '2026-05-01', 150000, 200);`).run();
  const id = db.prepare('SELECT id FROM expense ORDER BY id DESC LIMIT 1;').get().id;
  let odo = recalcCurrentOdometer(db);
  check('после добавления одометр = 150000', odo === 150000, `получили ${odo}`);

  odo = updateExpenseOdometer(db, id, 120000);
  check('после правки на 120000 одометр пересчитан в 120000 (ещё выше base_odometer=100000)', odo === 120000, `получили ${odo}`);

  odo = updateExpenseOdometer(db, id, 80000);
  check('после правки на 80000 (ниже base_odometer) одометр откатился к base_odometer=100000', odo === 100000, `получили ${odo}`);
}

// ─── Сценарий 4: удаление расхода с максимальным пробегом ───────────────────

section('Сценарий 4: удаление расхода с максимальным пробегом откатывает одометр');
{
  const db = freshDb();
  db.exec(`UPDATE car SET base_odometer = 50000, current_odometer = 50000 WHERE id = 1;`);
  db.prepare(`INSERT INTO expense (car_id, date, odometer, amount) VALUES (1, '2026-01-01', 60000, 100);`).run();
  const idHigh = db.prepare('SELECT id FROM expense ORDER BY id DESC LIMIT 1;').get().id;
  db.prepare(`INSERT INTO expense (car_id, date, odometer, amount) VALUES (1, '2026-02-01', 55000, 100);`).run();
  recalcCurrentOdometer(db);

  let odo = deleteExpense(db, idHigh);
  check('после удаления записи-максимума одометр = 55000 (следующий по величине)', odo === 55000, `получили ${odo}`);
}

// ─── Сценарий 5: расход без пробега (NULL) не влияет на MAX ─────────────────

section('Сценарий 5: расход без пробега (NULL) не участвует в пересчёте');
{
  const db = freshDb();
  db.exec(`UPDATE car SET base_odometer = 211294, current_odometer = 211294 WHERE id = 1;`);
  const after = addExpense(db, { date: '2026-03-10', odometer: null, amount: 80 });
  check('current_odometer не изменился', after === 211294, `получили ${after}`);
}

// ─── Итог ────────────────────────────────────────────────────────────────────

console.log();
if (failures === 0) {
  console.log('ВСЕ ПРОВЕРКИ ПРОШЛИ');
  process.exit(0);
} else {
  console.log(`ПРОВАЛЕНО ПРОВЕРОК: ${failures}`);
  process.exit(1);
}
