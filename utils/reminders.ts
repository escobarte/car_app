/**
 * Утилита расчёта статуса регламентов.
 * Используется в: app/(tabs)/service.tsx, notifications/engine.ts.
 *
 * Логика по ТЗ раздел 6.3.
 */

import { Reminder } from '@/db';

export type StatusKind = 'ok' | 'soon' | 'due';

export type ReminderRow = {
  reminder:  Reminder;
  remaining: number;    // км или дней; отрицательное → просрочка
  progress:  number;    // 0..1 (степень использования интервала)
  unit:      'km' | 'days';
  status:    StatusKind;
};

/**
 * Рассчитать статус одного регламента.
 * @param r              - регламент из БД
 * @param currentOdo     - текущий пробег машины
 * @param today          - сегодняшняя дата (с обнулёнными часами)
 */
export function calcReminderRow(
  r: Reminder,
  currentOdo: number,
  today: Date,
): ReminderRow {
  if (r.type === 'mileage') {
    const interval  = r.interval_km ?? 1;
    const used      = currentOdo - r.last_odometer;
    const remaining = (r.last_odometer + interval) - currentOdo;
    const progress  = Math.min(Math.max(used / interval, 0), 1);
    const status: StatusKind =
      remaining <= 0             ? 'due'  :
      remaining <= r.warn_before ? 'soon' : 'ok';
    return { reminder: r, remaining, progress, unit: 'km', status };
  }

  // time-based
  const interval  = r.interval_days ?? 1;
  const lastDate  = new Date(r.last_date + 'T00:00:00');
  const dueDate   = new Date(lastDate.getTime() + interval * 86_400_000);
  const remaining = Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000);
  const elapsed   = Math.max((today.getTime() - lastDate.getTime()) / 86_400_000, 0);
  const progress  = Math.min(elapsed / interval, 1);
  const status: StatusKind =
    remaining <= 0             ? 'due'  :
    remaining <= r.warn_before ? 'soon' : 'ok';
  return { reminder: r, remaining, progress, unit: 'days', status };
}

export const STATUS_ORDER: Record<StatusKind, number> = { due: 0, soon: 1, ok: 2 };
