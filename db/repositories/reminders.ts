/**
 * Репозиторий: REMINDER — регламенты / напоминания об обслуживании.
 */

import { openDatabase, Reminder } from '../database';
import { getCar } from './cars';
import { calcReminderRow } from '@/utils/reminders';

/** Сегодня в формате 'YYYY-MM-DD' по локальному времени. */
function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Все регламенты машины. */
export async function getAllReminders(): Promise<Reminder[]> {
  const db = await openDatabase();
  return db.getAllAsync<Reminder>(
    'SELECT * FROM reminder WHERE car_id = 1 ORDER BY id ASC;'
  );
}

/** Один регламент по id. */
export async function getReminderById(id: number): Promise<Reminder | null> {
  const db = await openDatabase();
  return db.getFirstAsync<Reminder>('SELECT * FROM reminder WHERE id = ?;', id);
}

/**
 * Добавить регламент.
 *
 * ТЗ 6.3: новый регламент обязан стартовать «в норме», с полным интервалом
 * впереди. Поэтому точка отсчёта по умолчанию — не ноль:
 *   type='mileage' → last_odometer = текущий пробег машины
 *   type='time'    → last_date     = сегодня
 * Оба поля выставляются всегда (неиспользуемое для данного типа просто
 * не участвует в расчёте) — так регламент останется корректным, если
 * пользователь потом сменит тип при редактировании.
 *
 * Значения можно передать явно — это нужно импорту бэкапа.
 */
type NewReminder =
  Omit<Reminder, 'id' | 'start_odometer' | 'start_date' | 'last_odometer' | 'last_date'>
  & Partial<Pick<Reminder, 'start_odometer' | 'start_date' | 'last_odometer' | 'last_date'>>;

export async function addReminder(reminder: NewReminder): Promise<number> {
  const db = await openDatabase();

  const start_odometer = reminder.start_odometer
    ?? reminder.last_odometer
    ?? (await getCar())?.current_odometer
    ?? 0;
  const start_date = reminder.start_date ?? reminder.last_date ?? todayStr();

  // На старте last_* совпадают со start_*: работ по регламенту ещё не было.
  const last_odometer = reminder.last_odometer ?? start_odometer;
  const last_date     = reminder.last_date     ?? start_date;

  const result = await db.runAsync(
    `INSERT INTO reminder
       (car_id, title, type, interval_km, interval_days,
        start_odometer, start_date, last_odometer, last_date, warn_before)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    reminder.car_id,
    reminder.title,
    reminder.type,
    reminder.interval_km ?? null,
    reminder.interval_days ?? null,
    start_odometer,
    start_date,
    last_odometer,
    last_date,
    reminder.warn_before
  );

  // start_*/last_* теперь могут быть заданы «задним числом» из формы
  // (прошлая дата/пробег последней замены) — регламент не обязательно
  // стартует «в норме». primeNotifiedStatus() не даёт ближайшему
  // scheduleReminderNotifications() принять уже известный статус за
  // переход и прислать лишний push (см. её комментарий выше).
  await primeNotifiedStatus(result.lastInsertRowId);

  return result.lastInsertRowId;
}

/**
 * Пересчитать last_odometer / last_date регламента из записей об
 * обслуживании (ТЗ 6.3).
 *
 * Берётся последняя запись SERVICE_RECORD, закрывшая этот регламент.
 * Если таких записей не осталось — откат на точку старта (start_*).
 *
 * Вызывается после добавления и удаления записи об обслуживании.
 * Это делает last_* производными: удалили запись, закрывавшую регламент, —
 * он честно возвращается в предыдущее состояние, а статус (он нигде не
 * хранится и считается на лету в utils/reminders.ts) следует автоматически.
 *
 * Идемпотентна.
 */
export async function syncReminderFromRecords(reminderId: number): Promise<void> {
  const db = await openDatabase();

  const last = await db.getFirstAsync<{ odometer: number; date: string }>(
    `SELECT odometer, date FROM service_record
      WHERE reminder_id = ?
      ORDER BY date DESC, odometer DESC, id DESC
      LIMIT 1;`,
    reminderId
  );

  if (last) {
    await db.runAsync(
      `UPDATE reminder SET last_odometer = ?, last_date = ? WHERE id = ?;`,
      last.odometer, last.date, reminderId
    );
  } else {
    await db.runAsync(
      `UPDATE reminder
          SET last_odometer = start_odometer, last_date = start_date
        WHERE id = ?;`,
      reminderId
    );
  }
}

// resetReminder удалён: last_* больше не выставляются вручную из формы
// «Сделано». Они выводятся из записей об обслуживании — см.
// syncReminderFromRecords(), которую дёргают add/deleteServiceRecord.
// Прежний вариант затирал last_* введёнными значениями даже тогда, когда
// добавлялась работа задним числом, и не откатывался при удалении записи.

/**
 * Выставить notified_status регламента в соответствии с его ТЕКУЩИМ статусом
 * (только type='mileage' — только для него notified_status имеет смысл,
 * см. setNotifiedStatus).
 *
 * Зачем нужна: до этой правки регламент при создании/редактировании всегда
 * стартовал «в норме», поэтому notified_status (по умолчанию пустой, то есть
 * «ok») всегда совпадал с реальным статусом — переходов не было, push не
 * слался. Теперь форма регламента позволяет задать прошлую дату/пробег
 * последней замены (start_date/start_odometer), из-за чего регламент может
 * оказаться уже «скоро» или «пора» сразу после сохранения. Без этой функции
 * ближайший scheduleReminderNotifications() увидел бы notified_status='ok'
 * (дефолт) против реального «due» и воспринял бы это как УХУДШЕНИЕ статуса —
 * и немедленно прислал бы push, хотя пользователь только что сам ввёл эти
 * данные в форме и уже видит актуальный статус на экране. Эта функция
 * «запоминает» текущий статус сразу при сохранении, чтобы такой push не
 * считался переходом и не отправлялся.
 *
 * Вызывается в конце addReminder() и updateReminder().
 */
async function primeNotifiedStatus(id: number): Promise<void> {
  const [reminder, car] = await Promise.all([getReminderById(id), getCar()]);
  if (!reminder || !car || reminder.type !== 'mileage') return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { status } = calcReminderRow(reminder, car.current_odometer, today);
  await setNotifiedStatus(id, status === 'ok' ? null : status);
}

/**
 * Запомнить статус, о котором уже отправлено уведомление (только mileage).
 * null — сброс: регламент вернулся в норму и о следующем ухудшении нужно
 * уведомить заново. Пишет отдельным запросом, а не через updateReminder,
 * чтобы служебное поле не смешивалось с пользовательскими правками формы.
 */
export async function setNotifiedStatus(
  id: number,
  status: 'soon' | 'due' | null
): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    'UPDATE reminder SET notified_status = ? WHERE id = ?;',
    [status, id]
  );
}

/**
 * Обновить параметры регламента.
 *
 * Форма регламента (app/add-reminder.tsx) умеет править start_date/
 * start_odometer («когда сделано в последний раз») и для существующего, не
 * только для нового регламента. Поэтому после UPDATE всегда вызывается
 * syncReminderFromRecords() — она пересчитывает last_odometer/last_date:
 * если у регламента уже есть SERVICE_RECORD, last_* берутся из записи
 * (правка start_* в этом случае ни на что не влияет, пока запись не
 * удалена — это и есть откат, который нельзя ломать); если записей ещё
 * нет, last_* становятся равны только что отправленным start_*. Дёшево и
 * идемпотентно, поэтому вызывается при любой правке, не только start_*.
 */
export async function updateReminder(
  id: number,
  fields: Partial<Omit<Reminder, 'id' | 'car_id'>>
): Promise<void> {
  const db = await openDatabase();
  const entries = Object.entries(fields);
  if (entries.length === 0) return;

  const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
  const values = entries.map(([, val]) => val);

  await db.runAsync(
    `UPDATE reminder SET ${setClauses} WHERE id = ?;`,
    ...values, id
  );

  await syncReminderFromRecords(id);
  // Статус может поменяться из-за правки start_*/interval_*/warn_before —
  // primeNotifiedStatus() не даёт это принять за «переход» и прислать
  // лишний push (см. её комментарий выше).
  await primeNotifiedStatus(id);
}

/** Удалить регламент по id. */
export async function deleteReminder(id: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM reminder WHERE id = ?;', id);
}
