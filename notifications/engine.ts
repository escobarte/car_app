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
import type { SchedulableTriggerInputTypes } from 'expo-notifications';

import i18n from '@/i18n';
import { carRepo, reminderRepo, settingsRepo } from '@/db';
import { calcReminderRow, STATUS_ORDER } from '@/utils/reminders';
import { darkTheme } from '@/constants/theme';

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
  } catch (e) {
    // Сюда попадаем только вне Expo Go (все вызовы за guard-ом isExpoGo),
    // то есть это реальная проблема сборки, а не ожидаемое ограничение среды.
    console.error('[notif] require(expo-notifications) failed', e);
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

function notifId(reminderId: number): string {
  return `reminder-${reminderId}`;
}

/**
 * Следующее 9:00 утра по местному времени.
 * Если сегодняшнее 9:00 уже прошло — возвращает завтрашнее.
 */
function next9AM(): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Возвращает переданную дату с временем 9:00.
 * Если такой момент уже прошёл — возвращает next9AM().
 */
function at9AMOrLater(date: Date): Date {
  const d = new Date(date);
  d.setHours(9, 0, 0, 0);
  return d.getTime() <= Date.now() ? next9AM() : d;
}

/**
 * Текст просроченного регламента: «Просрочено на N км» / «Просрочено на N дн.»
 *
 * remaining приходит из calcReminderRow и при просрочке отрицателен. Ровно 0 —
 * это «срок сегодня», а не «просрочено на 0»: для него берём отдельный текст.
 */
function overdueBody(
  remaining: number,
  unit: 'km' | 'days',
  t: typeof i18n.t,
): string {
  if (remaining === 0) return t('notifications.due');
  const n = Math.abs(remaining);
  return unit === 'km'
    ? t('notifications.overdueKm',   { n })
    : t('notifications.overdueDays', { n });
}

/** Хвост очереди вызовов scheduleReminderNotifications (сериализация). */
let _queue: Promise<void> = Promise.resolve();

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
  } catch (e) {
    console.error('[notif] setupNotificationHandler', e);
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
    if (status !== 'granted') {
      console.warn(`[notif] permission not granted (status=${status})`);
    }
    return status === 'granted';
  } catch (e) {
    console.error('[notif] requestNotificationPermissions', e);
    return false;
  }
}

/**
 * Проверяет системное разрешение, НЕ запрашивая его (диалог не всплывает).
 * Нужна экранам, которые показывают состояние уведомлений: разрешение можно
 * отозвать в настройках телефона, и тогда флаг notifications_enabled в БД
 * остаётся включённым, а push не приходят.
 */
export async function hasNotificationPermission(): Promise<boolean> {
  if (isExpoGo()) return false;              // guard ②
  try {
    const N = loadN();                       // lazy require ③
    if (!N) return false;
    const { status } = await N.getPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    console.error('[notif] hasNotificationPermission', e);
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
      // Канал создаётся один раз на уровне ОС и живёт вне темы приложения,
      // поэтому берём фиксированный акцент тёмной темы, а не текущей.
      lightColor:       darkTheme.colors.accent,
    });
  } catch (e) {
    console.error('[notif] ensureAndroidChannel', e);
  }
}

/**
 * Планирует (или отменяет) локальные уведомления для регламентов.
 * Вызывать при каждом запуске приложения ПОСЛЕ initDatabase() и после
 * любого изменения, влияющего на статусы (пробег, состав регламентов).
 *
 * Две разные модели доставки — по типу регламента:
 *
 * type='time' — ВРЕМЯ. Срок наступает сам по календарю, приложение в этот
 * момент может быть закрыто, поэтому уведомление планируется заранее на
 * 9:00 по часовому поясу телефона (CALENDAR-триггер, ТЗ 6.3):
 *   ok   → CALENDAR на warnDate @ 9:00 (разовый)
 *   soon → CALENDAR на dueDate  @ 9:00 (разовый)
 *   due  → CALENDAR повтор каждый день в 9:00
 *
 * type='mileage' — СОБЫТИЕ. Пробег сам по себе не растёт: статус меняется
 * только когда пользователь добавил/поправил запись, то есть прямо сейчас
 * и с приложением в руках. Ждать до 9:00 нечего — шлём немедленно
 * (trigger: null) в момент перехода статуса, один раз на переход:
 *   ok            → ничего не шлём, сбрасываем notified_status
 *   ok→soon/due   → немедленный push
 *   soon→due      → немедленный push
 *   улучшение     → молча перезаряжаем notified_status
 * Повтора по времени у mileage больше нет: «ежедневно в 9:00» тут было
 * бессмысленно — до следующей записи пользователя цифра не меняется.
 * Учёт отправленного — reminder.notified_status (см. схему).
 *
 * Вызовы сериализуются (см. _queue): раньше параллельный запуск был безобиден,
 * теперь два наложившихся пересчёта успели бы прочитать один и тот же
 * notified_status и прислать дубль немедленного push-а.
 */
export function scheduleReminderNotifications(): Promise<void> {
  // Оба колбэка — runSchedule: следующий запуск идёт и после успеха,
  // и после ошибки предыдущего, цепочка не обрывается.
  _queue = _queue.then(runSchedule, runSchedule);
  return _queue;
}

async function runSchedule(): Promise<void> {
  if (isExpoGo()) return;                    // guard ②
  try {
    const N = loadN();                       // lazy require ③
    if (!N) return;

    // ── Флаг notifications_enabled ─────────────────────────────────────────
    const settings = await settingsRepo.getSettings();
    if (!settings?.notifications_enabled) {
      // Осознанное состояние (тумблер в Settings), не ошибка — не логируем.
      await N.cancelAllScheduledNotificationsAsync()
        .catch((e) => console.error('[notif] cancelAllScheduledNotificationsAsync', e));
      return;
    }

    // ── Системное разрешение ───────────────────────────────────────────────
    const { status } = await N.getPermissionsAsync();
    if (status !== 'granted') {
      // Главная причина «push не приходят»: флаг в БД включён, а системного
      // разрешения нет. Раньше выходили молча — теперь видно в логах.
      console.warn(`[notif] scheduling skipped: permission status=${status}`);
      return;
    }

    // ── Android-канал ──────────────────────────────────────────────────────
    await ensureAndroidChannel();

    // ── Данные ────────────────────────────────────────────────────────────
    const [car, reminders] = await Promise.all([
      carRepo.getCar(),
      reminderRepo.getAllReminders(),
    ]);
    if (!car) {
      console.warn('[notif] scheduling skipped: no car row');
      return;
    }

    // ── Снимаем старые уведомления этого движка ────────────────────────────
    const scheduled = await N.getAllScheduledNotificationsAsync().catch((e) => {
      console.error('[notif] getAllScheduledNotificationsAsync', e);
      return [];
    });
    for (const notif of scheduled) {
      if (notif.identifier.startsWith('reminder-')) {
        await N.cancelScheduledNotificationAsync(notif.identifier)
          .catch((e) => console.error(`[notif] cancel ${notif.identifier}`, e));
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
        // Событийная модель: сравниваем текущий статус с тем, о котором уже
        // уведомляли. STATUS_ORDER: due=0, soon=1, ok=2 — чем меньше, тем хуже.
        const notified = reminder.notified_status ?? 'ok';

        if (STATUS_ORDER[row.status] < STATUS_ORDER[notified]) {
          // Стало хуже → шлём немедленно (trigger: null) и запоминаем статус.
          const body = row.status === 'due'
            ? overdueBody(row.remaining, 'km', t)
            : t('notifications.soonKm', { n: row.remaining });
          await N.scheduleNotificationAsync({
            identifier: notifId(reminder.id),
            content: { title: reminder.title, body, data: { reminderId: reminder.id } },
            trigger: null,               // null = показать сразу
          }).catch((e) => console.error(`[notif] present mileage ${notifId(reminder.id)}`, e));
          await reminderRepo
            .setNotifiedStatus(reminder.id, row.status as 'soon' | 'due')
            .catch((e) => console.error(`[notif] setNotifiedStatus ${reminder.id}`, e));
        } else if (row.status !== notified) {
          // Стало лучше (в т.ч. после «Сделано» или удаления записи) —
          // молча перезаряжаем, чтобы следующее ухудшение снова уведомило.
          await reminderRepo
            .setNotifiedStatus(reminder.id, row.status === 'ok' ? null : (row.status as 'soon'))
            .catch((e) => console.error(`[notif] setNotifiedStatus ${reminder.id}`, e));
        }
        continue;
      }

      // ── time-based: планирование на 9:00 (ТЗ 6.3) ──────────────────────
      // Повторяющийся CALENDAR-триггер: каждый день в 9:00
      const dailyAt9: Parameters<typeof N.scheduleNotificationAsync>[0]['trigger'] = {
        type:    N.SchedulableTriggerInputTypes.CALENDAR as SchedulableTriggerInputTypes.CALENDAR,
        hour:    9,
        minute:  0,
        second:  0,
        repeats: true,
      };

      const interval = reminder.interval_days ?? 1;
      const lastDate = new Date(reminder.last_date + 'T00:00:00');
      const dueDate  = new Date(lastDate.getTime() + interval * 86_400_000);
      const warnDate = new Date(dueDate.getTime()  - reminder.warn_before * 86_400_000);

      // Разовый CALENDAR-триггер на конкретную дату в 9:00
      function calendarAt(d: Date): Parameters<NotificationsModule['scheduleNotificationAsync']>[0]['trigger'] {
        const fire = at9AMOrLater(d);
        return {
          type:    N!.SchedulableTriggerInputTypes.CALENDAR as SchedulableTriggerInputTypes.CALENDAR,
          year:    fire.getFullYear(),
          month:   fire.getMonth() + 1,
          day:     fire.getDate(),
          hour:    9,
          minute:  0,
          second:  0,
          repeats: false,
        };
      }

      if (row.status === 'ok') {
        await N.scheduleNotificationAsync({
          identifier: notifId(reminder.id),
          content: {
            title: reminder.title,
            body:  t('notifications.soonDays', { n: reminder.warn_before }),
            data:  { reminderId: reminder.id },
          },
          trigger: calendarAt(warnDate),
        }).catch((e) => console.error(`[notif] schedule time/ok ${notifId(reminder.id)}`, e));
      } else if (row.status === 'soon') {
        await N.scheduleNotificationAsync({
          identifier: notifId(reminder.id),
          content: {
            title: reminder.title,
            body:  t('notifications.due'),
            data:  { reminderId: reminder.id },
          },
          trigger: calendarAt(dueDate),
        }).catch((e) => console.error(`[notif] schedule time/soon ${notifId(reminder.id)}`, e));
      } else {
        // due — уже просрочено, напоминаем каждый день в 9:00.
        // Число дней считается на момент планирования: до следующего запуска
        // приложения (или пересчёта одометра) текст не обновится.
        await N.scheduleNotificationAsync({
          identifier: notifId(reminder.id),
          content: {
            title: reminder.title,
            body:  overdueBody(row.remaining, 'days', t),
            data:  { reminderId: reminder.id },
          },
          trigger: dailyAt9,
        }).catch((e) => console.error(`[notif] schedule time/due ${notifId(reminder.id)}`, e));
      }
    }
  } catch (e) {
    console.error('[notif] scheduleReminderNotifications', e);
  }
}
