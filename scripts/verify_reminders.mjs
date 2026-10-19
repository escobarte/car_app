#!/usr/bin/env node
/**
 * Проверка регламентов (ТЗ 5.6, 6.3) на РЕАЛЬНОМ SQLite-движке (встроенный
 * node:sqlite, Node 22+):
 *  - calcReminderRow() — статус/остаток по пробегу и по времени;
 *  - syncReminderFromRecords() — last_odometer/last_date берутся из записи
 *    с САМОЙ ПОЗДНЕЙ ДАТОЙ (не с наибольшим пробегом), с откатом на start_*;
 *  - «Сделано» с пробегом ниже текущего не опускает car.current_odometer
 *    (recalcCurrentOdometer — MAX, не прямое присваивание);
 *  - NO_ODOMETER (доработка 3): необязательный пробег при последнем
 *    выполнении для type='time' не участвует в расчёте и переживает
 *    «Сделано» + откат так же, как любой другой last_odometer.
 *
 * Почему не импортирует db/repositories/*.ts напрямую: они построены на
 * expo-sqlite, который требует нативный Expo-раннтайм. Ключевые SQL-запросы
 * и формулы СКОПИРОВАНЫ построчно из utils/reminders.ts и
 * db/repositories/{reminders,cars}.ts — сверяй при будущих правках, иначе
 * проверка перестанет отражать реальный код.
 *
 * Запуск: node scripts/verify_reminders.mjs
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

// ─── Зеркало db/schema.ts (только нужные для этих сценариев таблицы) ────────

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE car (
      id               INTEGER PRIMARY KEY,
      base_odometer    INTEGER NOT NULL DEFAULT 0,
      current_odometer INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO car (id, base_odometer, current_odometer) VALUES (1, 0, 0);

    CREATE TABLE reminder (
      id              INTEGER PRIMARY KEY,
      car_id          INTEGER NOT NULL,
      title           TEXT    NOT NULL,
      type            TEXT    NOT NULL,
      interval_km     INTEGER,
      interval_days   INTEGER,
      start_odometer  INTEGER NOT NULL,
      start_date      TEXT    NOT NULL,
      last_odometer   INTEGER NOT NULL,
      last_date       TEXT    NOT NULL,
      warn_before     INTEGER NOT NULL,
      notified_status TEXT
    );

    CREATE TABLE service_record (
      id          INTEGER PRIMARY KEY,
      car_id      INTEGER NOT NULL,
      reminder_id INTEGER,
      date        TEXT    NOT NULL,
      odometer    INTEGER NOT NULL,
      cost        REAL    NOT NULL,
      note        TEXT
    );
  `);
  return db;
}

// Зеркало utils/reminders.ts: NO_ODOMETER — сентинел «пробег не указан»
// (доработка 3, необязательное поле «Пробег при последнем выполнении» для
// type='time'). Колонка start_odometer/last_odometer остаётся NOT NULL
// INTEGER — миграция схемы не нужна.
const NO_ODOMETER = -1;

// ─── Зеркало utils/reminders.ts: calcReminderRow() ──────────────────────────

function calcReminderRow(r, currentOdo, today) {
  if (r.type === 'mileage') {
    const interval  = r.interval_km ?? 1;
    const used      = currentOdo - r.last_odometer;
    const remaining = (r.last_odometer + interval) - currentOdo;
    const progress  = Math.min(Math.max(used / interval, 0), 1);
    const status =
      remaining <= 0             ? 'due'  :
      remaining <= r.warn_before ? 'soon' : 'ok';
    return { remaining, progress, unit: 'km', status };
  }

  const interval  = r.interval_days ?? 1;
  const lastDate  = new Date(r.last_date + 'T00:00:00');
  const dueDate   = new Date(lastDate.getTime() + interval * 86_400_000);
  const remaining = Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
  const elapsed   = Math.max((today.getTime() - lastDate.getTime()) / 86_400_000, 0);
  const progress  = Math.min(elapsed / interval, 1);
  const status =
    remaining <= 0             ? 'due'  :
    remaining <= r.warn_before ? 'soon' : 'ok';
  return { remaining, progress, unit: 'days', status };
}

// ─── Зеркало db/repositories/reminders.ts: syncReminderFromRecords() ────────
// ORDER BY date DESC — «последний раз» определяется по дате, не по пробегу
// (ТЗ 6.3, пункт 3 этой задачи).

function syncReminderFromRecords(db, reminderId) {
  const last = db
    .prepare(
      `SELECT odometer, date FROM service_record
        WHERE reminder_id = ?
        ORDER BY date DESC, odometer DESC, id DESC
        LIMIT 1;`
    )
    .get(reminderId);

  if (last) {
    db.prepare(`UPDATE reminder SET last_odometer = ?, last_date = ? WHERE id = ?;`)
      .run(last.odometer, last.date, reminderId);
  } else {
    db.prepare(
      `UPDATE reminder SET last_odometer = start_odometer, last_date = start_date WHERE id = ?;`
    ).run(reminderId);
  }
}

// ─── Зеркало db/repositories/cars.ts: recalcCurrentOdometer() ───────────────
// Упрощено до car + service_record (в этих сценариях fuel_entry/expense не
// участвуют) — тот же принцип MAX, что и в реальной функции.

function recalcCurrentOdometer(db) {
  db.exec(`
    UPDATE car SET current_odometer = (
      SELECT MAX(v) FROM (
        SELECT base_odometer                AS v FROM car            WHERE id = 1
        UNION ALL SELECT COALESCE(MAX(odometer), 0) FROM service_record WHERE car_id = 1
      )
    ) WHERE id = 1;
  `);
  return db.prepare('SELECT current_odometer FROM car WHERE id = 1;').get().current_odometer;
}

function insertReminder(db, r) {
  db.prepare(
    `INSERT INTO reminder
       (id, car_id, title, type, interval_km, interval_days,
        start_odometer, start_date, last_odometer, last_date, warn_before)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
  ).run(
    r.id, r.title, r.type, r.interval_km ?? null, r.interval_days ?? null,
    r.start_odometer, r.start_date, r.start_odometer, r.start_date, r.warn_before
  );
}

function insertService(db, { reminderId, date, odometer }) {
  db.prepare(
    `INSERT INTO service_record (car_id, reminder_id, date, odometer, cost, note)
     VALUES (1, ?, ?, ?, 0, '');`
  ).run(reminderId, date, odometer);
}

function daysAgo(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const today = new Date();
today.setHours(0, 0, 0, 0);

// ─── Сценарий 1: mileage, последняя замена позади текущего — не просрочен ───

section('Сценарий 1: mileage 7000, last 206500, текущий 211294 → осталось 2206 км, ok');
{
  const db = freshDb();
  insertReminder(db, {
    id: 1, title: 'Замена масла', type: 'mileage',
    interval_km: 7000, start_odometer: 206500, start_date: daysAgo(30), warn_before: 500,
  });
  const reminder = db.prepare('SELECT * FROM reminder WHERE id = 1;').get();
  const row = calcReminderRow(reminder, 211294, today);
  check('остаток = 2206 км', row.remaining === 2206, `получено ${row.remaining}`);
  check('статус = ok', row.status === 'ok', `получено ${row.status}`);
}

// ─── Сценарий 2: mileage, просрочен ─────────────────────────────────────────

section('Сценарий 2: mileage 7000, last 203000, текущий 211294 → просрочен');
{
  const db = freshDb();
  insertReminder(db, {
    id: 1, title: 'Замена масла', type: 'mileage',
    interval_km: 7000, start_odometer: 203000, start_date: daysAgo(60), warn_before: 500,
  });
  const reminder = db.prepare('SELECT * FROM reminder WHERE id = 1;').get();
  const row = calcReminderRow(reminder, 211294, today);
  // Срок — 203000 + 7000 = 210000 км (как и описано в задаче); текущий
  // пробег 211294 км. Перерасход = 211294 − 210000 = 1294 км, а не 704 —
  // в формулировке задачи здесь арифметическая опечатка, формула (которая
  // в задаче дана явно) и факт просрочки проверены именно по ней.
  check('срок наступил на 210000 км', reminder.last_odometer + reminder.interval_km === 210000);
  check('статус = due', row.status === 'due', `получено ${row.status}`);
  check('просрочено на 1294 км (211294 − 210000)', row.remaining === -1294, `получено ${row.remaining}`);
}

// ─── Сценарий 3: time, последняя замена ~6 месяцев назад ────────────────────

section('Сценарий 3: time 365 дней, last_date 182 дня назад → осталось ~180 дней');
{
  const db = freshDb();
  insertReminder(db, {
    id: 1, title: 'Гос. ТО', type: 'time',
    interval_days: 365, start_odometer: 0, start_date: daysAgo(182), warn_before: 25,
  });
  const reminder = db.prepare('SELECT * FROM reminder WHERE id = 1;').get();
  const row = calcReminderRow(reminder, 0, today);
  check('остаток = 183 дня (365 − 182)', row.remaining === 183, `получено ${row.remaining}`);
  check('это «около 180 дней»', Math.abs(row.remaining - 180) <= 10, `получено ${row.remaining}`);
  check('статус = ok (ещё не «скоро», warn_before=25)', row.status === 'ok', `получено ${row.status}`);
}

// ─── Сценарий 4: last_* берутся по САМОЙ ПОЗДНЕЙ ДАТЕ, не по пробегу ────────

section('Сценарий 4: last_odometer/last_date — по дате записи, не по наибольшему пробегу');
{
  const db = freshDb();
  insertReminder(db, {
    id: 1, title: 'Замена масла', type: 'mileage',
    interval_km: 7000, start_odometer: 0, start_date: '1970-01-01', warn_before: 500,
  });

  // A: раньше по дате, но БОЛЬШИЙ пробег (например, поправили задним числом).
  insertService(db, { reminderId: 1, date: '2026-01-01', odometer: 50000 });
  // B: позже по дате, но пробег МЕНЬШЕ, чем у A.
  insertService(db, { reminderId: 1, date: '2026-03-01', odometer: 40000 });
  syncReminderFromRecords(db, 1);

  let reminder = db.prepare('SELECT * FROM reminder WHERE id = 1;').get();
  check(
    'last_date = 2026-03-01 (самая поздняя дата, не наибольший пробег)',
    reminder.last_date === '2026-03-01',
    `получено ${reminder.last_date}`
  );
  check(
    'last_odometer = 40000 (пробег записи B, а не 50000 записи A)',
    reminder.last_odometer === 40000,
    `получено ${reminder.last_odometer}`
  );

  // Откат: удаляем B (позднюю запись) — должна вернуться A.
  db.prepare('DELETE FROM service_record WHERE date = ?;').run('2026-03-01');
  syncReminderFromRecords(db, 1);
  reminder = db.prepare('SELECT * FROM reminder WHERE id = 1;').get();
  check('после удаления B: last_date откатился на A (2026-01-01)', reminder.last_date === '2026-01-01');
  check('после удаления B: last_odometer откатился на A (50000)', reminder.last_odometer === 50000);

  // Откат до конца: удаляем A — должны вернуться на start_*.
  db.prepare('DELETE FROM service_record WHERE date = ?;').run('2026-01-01');
  syncReminderFromRecords(db, 1);
  reminder = db.prepare('SELECT * FROM reminder WHERE id = 1;').get();
  check('после удаления всех записей: last_* = start_* (0 / 1970-01-01)',
    reminder.last_odometer === 0 && reminder.last_date === '1970-01-01');
}

// ─── Сценарий 5: «Сделано» с пробегом ниже текущего не опускает одометр ────

section('Сценарий 5: запись с пробегом ниже текущего не опускает car.current_odometer');
{
  const db = freshDb();
  insertReminder(db, {
    id: 1, title: 'Замена масла', type: 'mileage',
    interval_km: 7000, start_odometer: 0, start_date: '1970-01-01', warn_before: 500,
  });
  insertReminder(db, {
    id: 2, title: 'Гос. ТО', type: 'time',
    interval_days: 365, start_odometer: 0, start_date: '1970-01-01', warn_before: 25,
  });

  // Текущий пробег машины уже дошёл до 211294 (например, через другую запись).
  insertService(db, { reminderId: 2, date: daysAgo(1), odometer: 211294 });
  let odo = recalcCurrentOdometer(db);
  check('после первой записи current_odometer = 211294', odo === 211294, `получено ${odo}`);

  // Теперь задним числом фиксируем масло, замененное на 206500 (< текущего).
  insertService(db, { reminderId: 1, date: daysAgo(400), odometer: 206500 });
  syncReminderFromRecords(db, 1);
  odo = recalcCurrentOdometer(db);
  check('current_odometer НЕ опустился (остался 211294)', odo === 211294, `получено ${odo}`);

  const reminder = db.prepare('SELECT * FROM reminder WHERE id = 1;').get();
  check('регламент «Замена масла» получил last_odometer = 206500', reminder.last_odometer === 206500);
}

// ─── Сценарий 6: time, «пробег при последнем выполнении» не указан ─────────
// Доработка 3: для type='time' это поле необязательное и чисто
// информационное — calcReminderRow() не должен его читать вообще, статус/
// срок считаются только по last_date. NO_ODOMETER на выходе — это и есть
// признак «не указано» для UI (компонент показывает «—»).

section('Сценарий 6: time, start_odometer = NO_ODOMETER (поле пустое) не влияет на статус/срок');
{
  const db = freshDb();
  insertReminder(db, {
    id: 1, title: 'Гос. ТО', type: 'time',
    interval_days: 365, start_odometer: NO_ODOMETER, start_date: daysAgo(182), warn_before: 25,
  });
  const reminder = db.prepare('SELECT * FROM reminder WHERE id = 1;').get();
  check('last_odometer сохранился как NO_ODOMETER (-1)', reminder.last_odometer === NO_ODOMETER,
    `получено ${reminder.last_odometer}`);

  const row = calcReminderRow(reminder, 0, today);
  check('остаток = 183 дня — как в сценарии 3, пробег не участвует', row.remaining === 183,
    `получено ${row.remaining}`);
  check('статус = ok', row.status === 'ok', `получено ${row.status}`);

  // «Сделано» на этот регламент — запись всегда содержит реальный пробег
  // (ТЗ 6.3, поле обязательно в форме), поэтому last_odometer перестаёт
  // быть NO_ODOMETER, как только появляется хоть одна запись.
  insertService(db, { reminderId: 1, date: daysAgo(1), odometer: 211294 });
  syncReminderFromRecords(db, 1);
  const afterDone = db.prepare('SELECT * FROM reminder WHERE id = 1;').get();
  check('после «Сделано» last_odometer = 211294 (больше не NO_ODOMETER)',
    afterDone.last_odometer === 211294, `получено ${afterDone.last_odometer}`);

  // Откат: удаляем единственную запись — last_* возвращается на start_*,
  // то есть снова NO_ODOMETER.
  db.prepare('DELETE FROM service_record WHERE reminder_id = 1;').run();
  syncReminderFromRecords(db, 1);
  const afterRollback = db.prepare('SELECT * FROM reminder WHERE id = 1;').get();
  check('после отката last_odometer снова NO_ODOMETER',
    afterRollback.last_odometer === NO_ODOMETER, `получено ${afterRollback.last_odometer}`);
}

// ─── Итог ────────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? 'ВСЕ ПРОВЕРКИ ПРОШЛИ' : `ПРОВАЛЕНО: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
