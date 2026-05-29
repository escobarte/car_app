/**
 * Движок push-уведомлений — Этап 7.
 * Разделы ТЗ: 6.3.
 *
 * Экспортирует две функции для вызова из _layout.tsx при старте:
 *   setupNotifications()    — разрешения + Android-канал
 *   scheduleReminderNotifications() — планирование уведомлений
 *
 * Стратегия расписания (по одному уведомлению на регламент):
 *
 *   time-based, ok   → уведомление на warnDate («скоро»)
 *   time-based, soon → уведомление на dueDate  («пора»)
 *   time-based, due  → уведомление через 24 ч  («просрочено»)
 *
 *   mileage, ok      → не планируем (дату пробега не предугадать)
 *   mileage, soon    → уведомление через 24 ч
 *   mileage, due     → уведомление через 24 ч
 *
 * При каждом запуске: отменяем все старые → планируем новые.
 * Это гарантирует актуальность текста при смене языка или после «Сделано».
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import i18n from '@/i18n';
import { carRepo, reminderRepo, settingsRepo } from '@/db';
import { calcReminderRow, STATUS_ORDER } from '@/utils/reminders';

// ─── Идентификатор уведомления ───────────────────────────────────────────────
// Формат: 'reminder-<id>'  — один слот на регламент, перезаписывается при рестарте.
function notifId(reminderId: number): string {
  return `reminder-${reminderId}`;
}

// ─── Минимальный задержка тригера (iOS требует ≥ 1 сек, рекомендуем ≥ 60 с) ──
const MIN_SECONDS = 65;

/** Разница в секундах между target и сейчас, не меньше MIN_SECONDS. */
function secondsUntil(target: Date): number {
  return Math.max(MIN_SECONDS, Math.floor((target.getTime() - Date.now()) / 1000));
}

// ─── Настройка обработчика foreground-уведомлений ────────────────────────────

/**
 * Вызывать ДО рендера приложения (на уровне модуля или в самом начале bootstrap).
 * Управляет тем, показывать ли уведомление, пока приложение открыто.
 */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList:   true,
      shouldPlaySound:  false,
      shouldSetBadge:   false,
    }),
  });
}

// ─── Запрос разрешений ───────────────────────────────────────────────────────

/**
 * Запрашивает разрешение на уведомления.
 * - На iOS: показывает системный диалог при первом вызове,
 *   на повторных молча возвращает текущий статус.
 * - На Android 13+: то же самое.
 * - Возвращает true, если разрешение получено.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: false },
  });
  return status === 'granted';
}

// ─── Android-канал ───────────────────────────────────────────────────────────

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name:             i18n.t('notifications.channelName'),
    description:      i18n.t('notifications.channelDesc'),
    importance:       Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 100, 200],
    lightColor:       '#3db5f5',
  });
}

// ─── Основная функция ────────────────────────────────────────────────────────

/**
 * Планирует (или отменяет) локальные уведомления для регламентов.
 * Вызывать при каждом запуске приложения ПОСЛЕ initDatabase().
 */
export async function scheduleReminderNotifications(): Promise<void> {
  // 1. Проверяем флаг notifications_enabled
  const settings = await settingsRepo.getSettings();
  if (!settings?.notifications_enabled) {
    // Уведомления отключены в настройках → снять все запланированные
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  // 2. Проверяем системное разрешение
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  // 3. Android-канал (идемпотентно)
  await ensureAndroidChannel();

  // 4. Данные
  const [car, reminders] = await Promise.all([
    carRepo.getCar(),
    reminderRepo.getAllReminders(),
  ]);
  if (!car) return;

  // 5. Отменяем все старые уведомления о регламентах
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.identifier.startsWith('reminder-')) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  // 6. Планируем новые
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const odo = car.current_odometer;

  // Сортируем: сначала due, потом soon, потом ok (чтобы не пропустить важные)
  const sorted = [...reminders].sort(
    (a, b) =>
      STATUS_ORDER[calcReminderRow(a, odo, today).status] -
      STATUS_ORDER[calcReminderRow(b, odo, today).status]
  );

  const t = i18n.t.bind(i18n);

  for (const reminder of sorted) {
    const row = calcReminderRow(reminder, odo, today);

    // ── Мнемоника по пробегу (дату не знаем) ───────────────────────────────
    if (reminder.type === 'mileage') {
      if (row.status === 'ok') continue;

      const n    = Math.abs(row.remaining);
      const body = row.status === 'due'
        ? t('notifications.overdueKm', { n })
        : t('notifications.soonKm',    { n: row.remaining });

      await Notifications.scheduleNotificationAsync({
        identifier: notifId(reminder.id),
        content: {
          title: reminder.title,
          body,
          data:  { reminderId: reminder.id },
        },
        trigger: {
          type:    Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 86_400, // напомнить через 24 ч
        },
      });
      continue;
    }

    // ── Временной регламент (дату знаем) ─────────────────────────────────────
    const interval = reminder.interval_days ?? 1;
    const lastDate = new Date(reminder.last_date + 'T00:00:00');
    const dueDate  = new Date(lastDate.getTime() + interval * 86_400_000);
    const warnDate = new Date(dueDate.getTime()  - reminder.warn_before * 86_400_000);

    if (row.status === 'ok') {
      // Уведомление «скоро» — запланировать на warnDate
      // (warnDate гарантированно в будущем, если status == 'ok')
      await Notifications.scheduleNotificationAsync({
        identifier: notifId(reminder.id),
        content: {
          title: reminder.title,
          body:  t('notifications.soonDays', { n: reminder.warn_before }),
          data:  { reminderId: reminder.id },
        },
        trigger: {
          type:    Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsUntil(warnDate),
        },
      });
    } else if (row.status === 'soon') {
      // Уведомление «пора» — запланировать на dueDate
      await Notifications.scheduleNotificationAsync({
        identifier: notifId(reminder.id),
        content: {
          title: reminder.title,
          body:  t('notifications.due'),
          data:  { reminderId: reminder.id },
        },
        trigger: {
          type:    Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsUntil(dueDate),
        },
      });
    } else {
      // status === 'due' → уже просрочено, напоминать каждые 24 ч
      await Notifications.scheduleNotificationAsync({
        identifier: notifId(reminder.id),
        content: {
          title: reminder.title,
          body:  t('notifications.overdue'),
          data:  { reminderId: reminder.id },
        },
        trigger: {
          type:    Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 86_400,
        },
      });
    }
  }
}
