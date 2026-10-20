/**
 * Репозиторий: FUEL_ENTRY — заправки.
 */

import { openDatabase, FuelEntry } from '../database';
import { recalcCurrentOdometer } from './cars';

/** Все заправки, от новых к старым. */
export async function getAllFuelEntries(): Promise<FuelEntry[]> {
  const db = await openDatabase();
  return db.getAllAsync<FuelEntry>('SELECT * FROM fuel_entry ORDER BY date DESC, id DESC;');
}

/** Заправки за указанный месяц (формат: 'YYYY-MM'). */
export async function getFuelEntriesByMonth(yearMonth: string): Promise<FuelEntry[]> {
  const db = await openDatabase();
  return db.getAllAsync<FuelEntry>(
    `SELECT * FROM fuel_entry
     WHERE strftime('%Y-%m', date) = ?
     ORDER BY date DESC;`,
    yearMonth
  );
}

/**
 * Полный бак с наибольшим пробегом СТРОГО МЕНЬШЕ odometer — это и есть
 * «предыдущий полный бак» для заправки с данным пробегом (§6.2).
 * excludeId — не учитывать эту запись саму (нужно при редактировании:
 * запись не должна искать себя как собственного предшественника).
 *
 * Раньше для этого использовался getLastFullTankEntry() — он брал ГЛОБАЛЬНО
 * самый большой odometer среди полных баков, без учёта odometer текущей
 * записи. Для добавления «в конец истории» это совпадало с правильным
 * ответом, но для записи, вставленной не по порядку (задним числом, после
 * исправления даты), подставлял неверного «предшественника» — вплоть до
 * записи с БОЛЬШИМ odometer, чем у текущей.
 */
export async function getPrevFullTank(
  carId: number,
  odometer: number,
  excludeId?: number,
): Promise<FuelEntry | null> {
  const db = await openDatabase();
  if (excludeId != null) {
    return db.getFirstAsync<FuelEntry>(
      `SELECT * FROM fuel_entry
        WHERE car_id = ? AND is_full_tank = 1 AND odometer < ? AND id != ?
        ORDER BY odometer DESC LIMIT 1;`,
      [carId, odometer, excludeId]
    );
  }
  return db.getFirstAsync<FuelEntry>(
    `SELECT * FROM fuel_entry
      WHERE car_id = ? AND is_full_tank = 1 AND odometer < ?
      ORDER BY odometer DESC LIMIT 1;`,
    [carId, odometer]
  );
}

/**
 * Сумма литров неполных заправок строго МЕЖДУ двумя пробегами (fromOdo, toOdo).
 * §6.2: эти литры сожжены на интервале между полными баками и идут в числитель.
 */
export async function sumPartialLitersBetween(
  carId: number, fromOdo: number, toOdo: number
): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ liters: number }>(
    `SELECT COALESCE(SUM(liters), 0) AS liters FROM fuel_entry
      WHERE car_id = ? AND is_full_tank = 0 AND odometer > ? AND odometer < ?;`,
    [carId, fromOdo, toOdo]
  );
  return row?.liters ?? 0;
}

/**
 * Чистая формула расхода (§6.2, полная версия): литры этого полного бака
 * плюс литры всех неполных заправок между ним и предыдущим полным, делённые
 * на пройденное расстояние, ×100, округление до 2 знаков.
 *
 * Единственное место, где формула реализована — используется и
 * recalcAllFullTankConsumption() (пересчёт в БД), и живым превью в форме
 * app/add-fuel.tsx, чтобы два места не могли разойтись.
 *
 * distance <= 0 → null. В норме это не должно происходить (пробег растёт
 * монотонно), но защищает от записи с ошибочным/дублирующимся пробегом.
 */
export function calcConsumption(
  fullTankLiters: number,
  partialLitersBetween: number,
  distance: number,
): number | null {
  if (distance <= 0) return null;
  return parseFloat((((fullTankLiters + partialLitersBetween) / distance) * 100).toFixed(2));
}

/**
 * «Сегмент» — интервал между двумя соседними полными баками, закрытый
 * ПОЗДНИМ из них (тем же, у которого в итоге стоит consumption). Один
 * сегмент = один полный бак с посчитанным расходом.
 *
 * date — дата закрывающего полного бака: по ней сегмент относят к месяцу/
 * периоду везде, где считается средневзвешенный расход (так же, как сейчас
 * относят к периоду сам consumption). d1/o1 — дата и одометр ПРЕДЫДУЩЕГО
 * полного бака (начало сегмента), d2/o2 — то же для закрывающего (= date/
 * odometer текущего). Нужны для разбивки сегмента по календарным месяцам
 * (getMonthlyFuelConsumption) — без них нельзя понять, какая часть длинного
 * сегмента пришлась на какой месяц.
 */
export type FuelSegment = {
  fullTankId:  number;
  date:        string;
  d1:          string;   // дата предыдущего полного бака (начало сегмента)
  o1:          number;   // одометр предыдущего полного бака
  d2:          string;   // дата закрывающего полного бака (= date)
  o2:          number;   // одометр закрывающего полного бака
  liters:      number;   // литры полного бака + накопленные неполные между ним и предыдущим полным
  km:          number;   // пройдено на сегменте (distance)
  consumption: number;   // calcConsumption(liters сегмента, 0, km) — уже без необходимости пересчитывать
};

/**
 * Все сегменты машины (каждый полный бак, у которого есть предыдущий
 * полный, со своими литрами/км). Единственное место, где перебираются
 * полные баки и ищется предыдущий — recalcAllFullTankConsumption() и
 * любой средневзвешенный расчёт (дашборд, Stats) используют именно её,
 * а не копируют цикл getPrevFullTank()/sumPartialLitersBetween() у себя.
 */
export async function getFuelSegments(carId = 1): Promise<FuelSegment[]> {
  const db = await openDatabase();
  const fulls = await db.getAllAsync<FuelEntry>(
    `SELECT * FROM fuel_entry WHERE car_id = ? AND is_full_tank = 1 ORDER BY odometer ASC, id ASC;`,
    carId
  );

  const segments: FuelSegment[] = [];
  for (const f of fulls) {
    const prev = await getPrevFullTank(carId, f.odometer, f.id);
    if (!prev) continue;

    const km = f.odometer - prev.odometer;
    const partialLiters = await sumPartialLitersBetween(carId, prev.odometer, f.odometer);
    const consumption = calcConsumption(f.liters, partialLiters, km);
    if (consumption == null) continue; // km <= 0 — защита от неверного пробега, сегмент не создаём

    segments.push({
      fullTankId: f.id,
      date: f.date,
      d1: prev.date, o1: prev.odometer,
      d2: f.date,    o2: f.odometer,
      liters: f.liters + partialLiters, km, consumption,
    });
  }
  return segments;
}

/**
 * Средневзвешенный расход по сегментам: сумма литров ÷ сумма км × 100.
 * В отличие от простого среднего по consumption каждой заправки, короткий
 * сегмент (мало км) не весит столько же, сколько длинный — одна аномальная
 * заправка на 50 км не тянет итог так же сильно, как обычная на 600 км.
 * Нет сегментов (или их суммарный км = 0) → null, показывать «—».
 */
export function calcWeightedConsumption(
  segments: Pick<FuelSegment, 'liters' | 'km'>[]
): number | null {
  if (segments.length === 0) return null;
  const totalLiters = segments.reduce((s, x) => s + x.liters, 0);
  const totalKm     = segments.reduce((s, x) => s + x.km, 0);
  if (totalKm <= 0) return null;
  return parseFloat(((totalLiters / totalKm) * 100).toFixed(2));
}

/**
 * Точка с известным одометром внутри сегмента (строго между o1 и o2):
 * неполные заправки и расходы с указанным пробегом. Используется для
 * линейной интерполяции одометра по датам при разбивке сегмента по месяцам
 * (splitSegmentByMonth) — чем больше таких точек, тем точнее оценка пробега
 * внутри месяца, не только по двум концам сегмента.
 */
export async function getOdometerWaypointsBetween(
  carId: number, fromOdo: number, toOdo: number,
): Promise<{ date: string; odometer: number }[]> {
  const db = await openDatabase();
  const partials = await db.getAllAsync<{ date: string; odometer: number }>(
    `SELECT date, odometer FROM fuel_entry
      WHERE car_id = ? AND is_full_tank = 0 AND odometer > ? AND odometer < ?;`,
    [carId, fromOdo, toOdo]
  );
  const expensesWithOdo = await db.getAllAsync<{ date: string; odometer: number }>(
    `SELECT date, odometer FROM expense
      WHERE car_id = ? AND odometer IS NOT NULL AND odometer > ? AND odometer < ?;`,
    [carId, fromOdo, toOdo]
  );
  return [...partials, ...expensesWithOdo].sort(
    (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.odometer - b.odometer)
  );
}

/** 'YYYY-MM-DD' → целое число дней от эпохи (UTC) — для линейной интерполяции по датам. */
function dayNum(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** 'YYYY-MM' следующего месяца. */
function nextYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1)); // m уже 1-индексный текущий месяц → день 1 следующего
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Все 'YYYY-MM' от месяца d1 до месяца d2 включительно, по возрастанию. */
function monthsBetween(d1: string, d2: string): string[] {
  const months: string[] = [];
  let ym = d1.slice(0, 7);
  const endYm = d2.slice(0, 7);
  for (;;) {
    months.push(ym);
    if (ym === endYm) break;
    ym = nextYM(ym);
  }
  return months;
}

/**
 * Одометр на заданную дату — линейная интерполяция по отсортированным (по
 * дате) точкам с известным одометром. До первой точки — одометр первой,
 * после последней — одометр последней (внутри сегмента это не происходит:
 * dateStr всегда между датами первой и последней точки).
 */
function interpOdometerAtDate(
  points: { date: string; odometer: number }[], dateStr: string,
): number {
  const target = dayNum(dateStr);
  const first = points[0];
  const last  = points[points.length - 1];
  if (target <= dayNum(first.date)) return first.odometer;
  if (target >= dayNum(last.date))  return last.odometer;
  for (let i = 0; i < points.length - 1; i++) {
    const d1 = dayNum(points[i].date);
    const d2 = dayNum(points[i + 1].date);
    if (target >= d1 && target <= d2) {
      if (d2 === d1) return points[i].odometer;
      const frac = (target - d1) / (d2 - d1);
      return points[i].odometer + frac * (points[i + 1].odometer - points[i].odometer);
    }
  }
  return last.odometer;
}

/** Доля сегмента, пришедшаяся на один календарный месяц. */
export type MonthFuelPortion = { ym: string; km: number; liters: number };

/**
 * Разложить сегмент (между двумя полными баками) по календарным месяцам,
 * которые он пересекает. Пробег месяца оценивается линейной интерполяцией
 * одометра по датам между o1 и o2, с учётом промежуточных точек (waypoints —
 * неполные заправки и расходы с пробегом внутри сегмента, если есть — иначе
 * интерполяция идёт прямо между o1 и o2). Литры делятся в той же пропорции,
 * что и километры — поэтому сумма liters/km по всем возвращённым месяцам
 * всегда равна segment.liters/segment.km (с точностью до округления).
 *
 * Месяц без пробега в сегменте (km <= 0, например вырожденный случай
 * d1 === d2) в результат не попадает.
 */
export function splitSegmentByMonth(
  segment: Pick<FuelSegment, 'd1' | 'o1' | 'd2' | 'o2' | 'liters' | 'km'>,
  waypoints: { date: string; odometer: number }[] = [],
): MonthFuelPortion[] {
  const { d1, o1, d2, o2, liters, km } = segment;
  if (km <= 0) return [];

  const points = [{ date: d1, odometer: o1 }, ...waypoints, { date: d2, odometer: o2 }].sort(
    (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.odometer - b.odometer)
  );

  const portions: MonthFuelPortion[] = [];
  for (const ym of monthsBetween(d1, d2)) {
    const monthStart = ym === d1.slice(0, 7) ? d1 : `${ym}-01`;
    const monthEnd    = ym === d2.slice(0, 7) ? d2 : `${nextYM(ym)}-01`;
    const odoStart = interpOdometerAtDate(points, monthStart);
    const odoEnd   = interpOdometerAtDate(points, monthEnd);
    const monthKm = Math.max(odoEnd - odoStart, 0);
    if (monthKm <= 0) continue;
    portions.push({ ym, km: monthKm, liters: (monthKm / km) * liters });
  }
  return portions;
}

/**
 * Расход по месяцам (вкладка «Расход л/100км», ТЗ 4.5): в отличие от
 * старой привязки целого сегмента к месяцу закрывающей заправки (из-за чего
 * длинный сегмент целиком попадал в один месяц, а месяцы без полной
 * заправки оставались пустыми), каждый сегмент раскладывается по месяцам
 * пропорционально пробегу (splitSegmentByMonth), после чего расход месяца =
 * сумма его литров ÷ сумма его км × 100 (calcWeightedConsumption).
 *
 * Месяц без km в результате отсутствует — вызывающий код показывает «—».
 * Сумма liters/km по всем месяцам равна сумме liters/km по всем сегментам
 * (см. scripts/verify_fuel_consumption.mjs) — среднее «за всё время» и
 * карточка на главной (calcWeightedConsumption(segments) без разбивки по
 * месяцам) не меняются и могут не совпадать с простым усреднением
 * помесячных значений (это ожидаемо и математически верно).
 */
export async function getMonthlyFuelConsumption(
  carId = 1,
): Promise<Map<string, { liters: number; km: number }>> {
  const segments = await getFuelSegments(carId);
  const result = new Map<string, { liters: number; km: number }>();

  for (const seg of segments) {
    const waypoints = await getOdometerWaypointsBetween(carId, seg.o1, seg.o2);
    for (const { ym, km, liters } of splitSegmentByMonth(seg, waypoints)) {
      const acc = result.get(ym) ?? { liters: 0, km: 0 };
      acc.liters += liters;
      acc.km += km;
      result.set(ym, acc);
    }
  }
  return result;
}

/**
 * Добавить заправку. price_per_liter считается сразу (§6.1).
 * consumption НЕ считается здесь — сохраняется null, а сразу после вставки
 * вызывается recalcAllFullTankConsumption() (см. ниже), которая честно
 * пересчитывает расход у всех полных баков машины, включая новую запись.
 * Обновляет пробег машины.
 */
export async function addFuelEntry(
  entry: Omit<FuelEntry, 'id' | 'price_per_liter' | 'consumption'>
): Promise<number> {
  const db = await openDatabase();

  const price_per_liter = parseFloat((entry.total_cost / entry.liters).toFixed(2));

  // null передаётся как элемент массива — надёжнее variadic при null в expo-sqlite
  const result = await db.runAsync(
    `INSERT INTO fuel_entry
       (car_id, date, odometer, liters, total_cost, price_per_liter, is_full_tank, consumption)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      entry.car_id,
      entry.date,
      entry.odometer,
      entry.liters,
      entry.total_cost,
      price_per_liter,
      entry.is_full_tank,
      null,
    ]
  );

  await recalcCurrentOdometer();
  await recalcAllFullTankConsumption(entry.car_id);
  return result.lastInsertRowId;
}

/** Удалить заправку по id. Пробег машины и расход соседних полных баков пересчитываются. */
export async function deleteFuelEntry(id: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM fuel_entry WHERE id = ?;', id);
  await recalcCurrentOdometer();
  await recalcAllFullTankConsumption();
}

/** Получить заправку по id. */
export async function getFuelEntryById(id: number): Promise<FuelEntry | null> {
  const db = await openDatabase();
  return db.getFirstAsync<FuelEntry>('SELECT * FROM fuel_entry WHERE id = ?;', id);
}

/**
 * Обновить поля заправки. Пробег машины пересчитывается, и сразу следом —
 * расход у всех полных баков машины (правка пробега/литров/флага «полный
 * бак» у ЛЮБОЙ записи может поменять расход не только у неё самой, но и у
 * соседнего полного бака — проще честно пересчитать все, чем точечно
 * выяснять, кого затронула правка).
 */
export async function updateFuelEntry(
  id: number,
  fields: Partial<Omit<FuelEntry, 'id' | 'car_id'>>
): Promise<void> {
  const db = await openDatabase();
  const entries = Object.entries(fields);
  if (entries.length === 0) return;

  const setClauses = entries.map(([col]) => `${col} = ?`).join(', ');
  const values = entries.map(([, val]) => val);

  await db.runAsync(
    `UPDATE fuel_entry SET ${setClauses} WHERE id = ?;`,
    ...values, id
  );
  await recalcCurrentOdometer();
  await recalcAllFullTankConsumption();
}

/**
 * Пересчёт consumption у ВСЕХ полных баков машины по актуальным данным
 * (§6.2, полная формула). Для каждого полного бака предыдущий полный —
 * getPrevFullTank() (наибольший odometer СТРОГО МЕНЬШЕ текущего, не
 * «глобально последний»), поэтому результат верен независимо от того, в
 * каком порядке записи были добавлены.
 *
 * Вызывается после ЛЮБОГО изменения заправок (add/update/delete) и после
 * импорта бэкапа — единая точка истины для consumption, никаких отдельных
 * «разовых» вызовов не остаётся.
 *
 * Идемпотентна. Возвращает число обновлённых записей (у которых значение
 * действительно изменилось).
 */
export async function recalcAllFullTankConsumption(carId = 1): Promise<number> {
  const db = await openDatabase();
  const fulls = await db.getAllAsync<FuelEntry>(
    `SELECT * FROM fuel_entry WHERE car_id = ? AND is_full_tank = 1 ORDER BY odometer ASC, id ASC;`,
    carId
  );
  const segments = await getFuelSegments(carId);
  const consumptionByFullId = new Map(segments.map((s) => [s.fullTankId, s.consumption]));

  let updated = 0;
  for (const f of fulls) {
    const consumption = consumptionByFullId.get(f.id) ?? null;
    if (f.consumption !== consumption) {
      await db.runAsync('UPDATE fuel_entry SET consumption = ? WHERE id = ?;', [consumption, f.id]);
      updated++;
    }
  }

  return updated;
}
