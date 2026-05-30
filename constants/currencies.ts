/**
 * Справочник валют и утилиты форматирования.
 *
 * formatMoney(amount, code) — единственная функция для отображения сумм.
 * Используй её ВЕЗДЕ вместо ручного `${amount} ${sym}`.
 *
 * Символы-префиксы ($, €, £) идут перед числом: $655.00
 * Остальные идут после: 655.00 Lei
 */

// ─── Полный список валют ──────────────────────────────────────────────────────

export type CurrencyItem = {
  code:    string;
  symbol:  string;
  name_ru: string;
  name_en: string;
};

export const CURRENCY_LIST: CurrencyItem[] = [
  { code: 'MDL', symbol: 'Lei', name_ru: 'Молдавский лей',      name_en: 'Moldovan Leu'      },
  { code: 'USD', symbol: '$',   name_ru: 'Доллар США',          name_en: 'US Dollar'         },
  { code: 'EUR', symbol: '€',   name_ru: 'Евро',                name_en: 'Euro'              },
  { code: 'GBP', symbol: '£',   name_ru: 'Фунт стерлингов',     name_en: 'British Pound'     },
  { code: 'RUB', symbol: '₽',   name_ru: 'Российский рубль',    name_en: 'Russian Ruble'     },
  { code: 'UAH', symbol: '₴',   name_ru: 'Украинская гривня',   name_en: 'Ukrainian Hryvnia' },
  { code: 'KZT', symbol: '₸',   name_ru: 'Казахстанский тенге', name_en: 'Kazakhstani Tenge' },
  { code: 'BYN', symbol: 'Br',  name_ru: 'Белорусский рубль',   name_en: 'Belarusian Ruble'  },
  { code: 'AZN', symbol: '₼',   name_ru: 'Азербайджанский манат',name_en: 'Azerbaijani Manat'},
  { code: 'AMD', symbol: '֏',   name_ru: 'Армянский драм',      name_en: 'Armenian Dram'     },
  { code: 'GEL', symbol: '₾',   name_ru: 'Грузинский лари',     name_en: 'Georgian Lari'     },
  { code: 'KGS', symbol: 'с',   name_ru: 'Кыргызский сом',      name_en: 'Kyrgyz Som'        },
  { code: 'TJS', symbol: 'SM',  name_ru: 'Таджикский сомони',   name_en: 'Tajik Somoni'      },
  { code: 'UZS', symbol: "so'm",name_ru: 'Узбекский сум',       name_en: 'Uzbek Som'         },
  { code: 'TMT', symbol: 'T',   name_ru: 'Туркменский манат',   name_en: 'Turkmen Manat'     },
  { code: 'RON', symbol: 'lei', name_ru: 'Румынский лей',       name_en: 'Romanian Leu'      },
  { code: 'PLN', symbol: 'zł',  name_ru: 'Польский злотый',     name_en: 'Polish Zloty'      },
];

// ─── Быстрый словарь код → символ ────────────────────────────────────────────

export const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  CURRENCY_LIST.map(c => [c.code, c.symbol])
);

// Символы, стоящие ПЕРЕД числом (префикс)
const PREFIX_SYMBOLS = new Set(['$', '€', '£', '¥', '¢']);

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/** Возвращает символ валюты по коду. Если код неизвестен — возвращает сам код. */
export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

/**
 * Форматирует сумму с символом валюты.
 * Примеры:
 *   formatMoney(655, 'MDL')  → '655.00 Lei'
 *   formatMoney(655, 'USD')  → '$655.00'
 *   formatMoney(655, 'EUR')  → '€655.00'
 *   formatMoney(655, 'RUB')  → '655.00 ₽'
 */
export function formatMoney(amount: number, code: string): string {
  const sym = currencySymbol(code);
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return PREFIX_SYMBOLS.has(sym) ? `${sym}${formatted}` : `${formatted} ${sym}`;
}
