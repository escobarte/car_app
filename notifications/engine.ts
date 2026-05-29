/**
 * Движок push-уведомлений — Этап 7.
 * Разделы ТЗ: 6.3.
 *
 * АРХИТЕКТУРА ЗАЩИТЫ ОТ EXPO GO:
 *  В Expo Go (SDK 53+) нативный модуль expo-notifications недоступен на Android.
 *  Три уровня защиты (каждый нужен — они покрывают разные сценарии):
 *
 *  1. LogBox.ignoreLogs — подавляет console.warn/error от пакета.
 *     Запускается в теле модуля до любого вызова функций.
 *
 *  2. isExpoGo() — проверка среды в начале КАЖДОЙ публичной функции.
 *     Если Expo Go → немедленный return без касания API.
 *
 *  3. Ленивый require внутри loadNotifications() вместо top-level import.
 *     Metro вычисляет import-выражения ДО тела модуля, поэтому top-level
 *     import вызывал ошибку ещё на этапе загрузки бандла.
 *     require() — синхронный, но выполняется только при вызове функции,
 *     уже после того как LogBox и guard-проверки вступили в силу.
 */

import { LogBox, Platform } from 'react-native';
import Constants from 'expo-constants';

import i18n from '@/i18n';
import { carRepo, reminderRepo, settingsRepo } from '@/db';
import { calcReminderRow, STATUS_ORDER } from '@/utils/reminders';

// ─── 1. LogBox — подавляем предупреждения пакета ─────────────────────────────
// Работает только в development (в production LogBox отключён — безопасно).
// Запускается раньше любого require('expo-notifications'), потому что
// является частью тела модуля, а не import-выражением.
LogBox.ignoreLogs([
  'expo-notifications',
  '[expo-notifications]',
  'Notifications.setNotificationHandler',
  'expo-notifications: Android Push',
  'Encountered an error setting up notifications',
]);

// ─── 2. Тип для TypeScript (не импорт!) ─────────────────────────────────────
type NotificationsModule = typeof import('expo-notifications');

// Кеш: загружаем пакет ровно один раз.
let _notif: NotificationsModule | null = null;
let _notifAttempted = false;

/**
 * 3. Ленивая загрузка — require внутри функции, обёрнутый в try/catch.
 *    Возвращает модуль или null, никогда не бросает исключение.
 */
function loadN(): NotificationsModule | null {
  if (_notifAttempted) return _notif;
  _notifAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _notif = require('expo-notifications') as NotificationsModule;
  } catch {
    _notif = null;
  }
  return _notif;
}

// ─── Определение среды ───────────────────────────────────────────────────────

function isExpoGo(): boolean {
  // appOwnership === 'expo' — Expo Go (все версии SDK)
  // executionEnvironment === 'storeClient' — дополнительная проверка SDK 41+
  return (
    Constants.appOwnership === 'expo' ||
    (Constants as unknown as Record<string, unknown>)['executionEnvironment'] === 'storeClient'
  );
}

// ─── Вспомогательные ────────────────────────────────────────────────────────

const MIN_SECONDS = 65;

function secondsUntil(target: Date): number {
  return Math.max(MIN_SECONDS, Math.floor((target.getTime() - Date.now()) / 1000));
}

function notifId(reminderId: number): string {
  return `reminder-${reminderId}`;
}

// ─── Публичный API ───────────────────────────────────────────────────────────

/**
 * Устанавливает обработчик foreground-уведомлений.
 * Вызывать на уровне модуля _layout.tsx (до рендера).
 */
export function setupNotificationHandler(): void {
  if (isExpoGo()) return;                    // guard ②
  try {
    const N = loadN();                       // lazy require ③
    if (!N) return;
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList:   true,
        shouldPlaySound:  false,
        shouldSetBadge:   false,
      }),
    });
  } catch {
    /* нативный модуль недоступен — игнорируем */
  }
}

/**
 * Запрашивает разрешение на уведомления.
 * Возвращает true если разрешение получено.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (isExpoGo()) return false;              // guard ②
  try {
    const N = loadN();                       // lazy require ③
    if (!N) return false;

    const { status: existing } = await N.getPermissionsAsync();
    if (existing === 'granted') return true;

    const { status } = await N.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: false },
    });
    return status === 'granted';
  } catch {
    return false;
  }
}

/** Создаёт Android-канал уведомлений (идемпотентно). */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const N = loadN();                       // lazy require ③
    if (!N) return;
    await N.setNotificationChannelAsync('reminders', {
      name:             i18n.t('notifications.channelName'),
      description:      i18n.t('notifications.channelDesc'),
      importance:       N.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 100, 200],
      lightColor:       '#3db5f5',
    });
  } catch {
    /* ignore */
  }
}

/**
 * Планирует (или отменяет) локальные уведомления для регламентов.
 * Вызывать при каждом запуске приложения ПОСЛЕ initDatabase().
 *
 * Стратегия (одно уведомление на регламент):
 *  time ok   → триггер на warnDate
 *  time soon → триггер на dueDate
 *  time due  → через 24 ч (ежедневное напоминание)
 *  mileage ok      → не планируем
 *  mileage soon/due → через 24 ч
 */
export async function scheduleReminderNotifications(): Promise<void> {
  if (isExpoGo()) return;                    // guard ②
  try {
    const N = loadN();                       // lazy require ③
    if (!N) return;

    // ── Флаг notifications_enabled ─────────────────────────────────────────
    const settings = await settingsRepo.getSettings();
    if (!settings?.notifications_enabled) {
      await N.cancelAllScheduledNotificationsAsync().catch(() => {});
      return;
    }

    // ── Системное разрешение ───────────────────────────────────────────────
    const { status } = await N.getPermissionsAsync();
    if (status !== 'granted') return;

    // ── Android-канал ──────────────────────────────────────────────────────
    await ensureAndroidChannel();

    // ── Данные ────────────────────────────────────────────────────────────
    const [car, reminders] = await Promise.all([
      carRepo.getCar(),
      reminderRepo.getAllReminders(),
    ]);
    if (!car) return;

    // ── Снимаем старые уведомления этого движка ────────────────────────────
    const scheduled = await N.getAllScheduledNotificationsAsync().catch(() => []);
    for (const notif of scheduled) {
      if (notif.identifier.startsWith('reminder-')) {
        await N.cancelScheduledNotificationAsync(notif.identifier).catch(() => {});
      }
    }

    // ── Планируем новые ───────────────────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const odo = car.current_odometer;
    const t   = i18n.t.bind(i18n);

    const sorted = [...reminders].sort(
      (a, b) =>
        STATUS_ORDER[calcReminderRow(a, odo, today).status] -
        STATUS_ORDER[calcReminderRow(b, odo, today).status],
    );

    for (const reminder of sorted) {
      const row = calcReminderRow(reminder, odo, today);

      if (reminder.type === 'mileage') {
        if (row.status === 'ok') continue;
        const n    = Math.abs(row.remaining);
        const body = row.status === 'due'
          ? t('notifications.overdueKm', { n })
          : t('notifications.soonKm',    { n: row.remaining });
        await N.scheduleNotificationAsync({
          identifier: notifId(reminder.id),
          content: { title: reminder.title, body, data: { reminderId: reminder.id } },
          trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 86_400 },
        }).catch(() => {});
        continue;
      }

      // time-based
      const interval = reminder.interval_days ?? 1;
      const lastDate = new Date(reminder.last_date + 'T00:00:00');
      const dueDate  = new Date(lastDate.getTime() + interval * 86_400_000);
      const warnDate = new Date(dueDate.getTime()  - reminder.warn_before * 86_400_000);

      if (row.status === 'ok') {
        await N.scheduleNotificationAsync({
          identifier: notifId(reminder.id),
          content: {
            title: reminder.title,
            body:  t('notifications.soonDays', { n: reminder.warn_before }),
            data:  { reminderId: reminder.id },
          },
          trigger: {
            type:    N.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: secondsUntil(warnDate),
          },
        }).catch(() => {});
      } else if (row.status === 'soon') {
        await N.scheduleNotificationAsync({
          identifier: notifId(reminder.id),
          content: {
            title: reminder.title,
            body:  t('notifications.due'),
            data:  { reminderId: reminder.id },
          },
          trigger: {
            type:    N.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: secondsUntil(dueDate),
          },
        }).catch(() => {});
      } else {
        // due — уже просрочено
        await N.scheduleNotificationAsync({
          identifier: notifId(reminder.id),
          content: {
            title: reminder.title,
            body:  t('notifications.overdue'),
            data:  { reminderId: reminder.id },
          },
          trigger: {
            type:    N.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 86_400,
          },
        }).catch(() => {});
      }
    }
  } catch {
    /* любая непойманная ошибка — тихо игнорируем */
  }
}
