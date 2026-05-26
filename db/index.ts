/**
 * Единая точка входа в слой базы данных.
 *
 * Импортируй только отсюда:
 *   import { initDatabase, carRepo, fuelRepo, ... } from '@/db';
 */

export { openDatabase, initDatabase } from './database';
export type {
  Car,
  FuelEntry,
  Expense,
  Category,
  ServiceRecord,
  Reminder,
  AppSettings,
} from './database';

export * as carRepo      from './repositories/cars';
export * as fuelRepo     from './repositories/fuel';
export * as expenseRepo  from './repositories/expenses';
export * as categoryRepo from './repositories/categories';
export * as serviceRepo  from './repositories/services';
export * as reminderRepo from './repositories/reminders';
export * as settingsRepo from './repositories/settings';
