/**
 * Таблица символов валют.
 * Добавляй новые коды по мере необходимости.
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  MDL: 'L',
  USD: '$',
  EUR: '€',
  RUB: '₽',
  UAH: '₴',
  RON: 'lei',
  GBP: '£',
  PLN: 'zł',
};

/** Вернуть символ валюты по коду. Если код не найден — вернуть сам код. */
export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}
