/**
 * Превью-парсер CSV из Google-таблицы (раздел 8 ТЗ).
 * Только читает и форматирует — в базу НЕ пишет.
 * Запуск: node scripts/import-preview.js
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '../docs/car-expenses-tracker.csv');

// ─── CSV-парсер (поддерживает кавычки + запятую как дес.разделитель) ────────
function parseCSVLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  fields.push(cur.trim());
  return fields;
}

// "199006,4"  →  199006.4 ;  "38,75" → 38.75
function num(s) {
  if (!s || !s.trim()) return null;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? null : n;
}

// "25/12/2025" → "2025-12-25"
function date(s) {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// ─── Сопоставление категорий (старые → ключи из раздела 7.1) ───────────────
const CAT_MAP = {
  'Документы':  'documents',
  'Химия':      'chemistry',
  'Тюнинг':     'tuning',
  'Аксессуары': 'accessories',
  'Электроника':'electronics',
  'Сервис':     'service',
  'Комфорт':    'comfort',
  'Запчасти':   'parts',
  'ТО':         'gov_inspection',   // ТО+Стра+Дорога → Гос. ТО
};

// ─── Парсинг ─────────────────────────────────────────────────────────────────
const lines = fs.readFileSync(CSV_PATH, 'utf8').split('\n');

// Структура файла:
//  строки 0-2  : ⚠️-заголовок и пустая
//  строка 3    : «Заправка» | «Остальные Растраты» — игнор
//  строка 4    : тоталы — игнор
//  строка 5    : заголовки колонок — игнор
//  строки 6+   : данные
//
// Колонки:
//  0   Дата (заправка)
//  1   Пробег (заправка)
//  2   Литры
//  3   Сумма (заправка)
//  4   Цена литр — НЕ импортируем (считается)
//  5   Пометка «Не полный бак»
//  6   пустой разделитель
//  7   Дата (расход)
//  8   Категория
//  9   Описание
//  10  Пробег (расход, необязательный)
//  11  Сумма (расход)
//  12+ «Планны и Задачи» — игнор

const fuels    = [];
const expenses = [];

for (let i = 6; i < lines.length; i++) {
  const raw = lines[i].trim();
  if (!raw) continue;
  const c = parseCSVLine(raw);

  // — ЗАПРАВКА —
  const fd = date(c[0]);
  if (fd) {
    const odo   = num(c[1]);
    const liters = num(c[2]);
    const cost  = num(c[3]);
    if (odo !== null && liters !== null && cost !== null) {
      const noteRaw  = (c[5] || '').toLowerCase();
      const isFull   = !noteRaw.includes('не полный');
      fuels.push({ date: fd, odometer: Math.round(odo), liters, total_cost: cost, is_full_tank: isFull });
    }
  }

  // — РАСХОД —
  const ed = date(c[7]);
  if (ed) {
    const cat    = (c[8]  || '').trim();
    const desc   = (c[9]  || '').trim();
    const odo    = num(c[10]);
    const amount = num(c[11]);
    // Пропускаем строки "Планны и Задачи"
    if (cat && !cat.includes('Планн') && !cat.includes('Задач') && amount !== null) {
      const key = CAT_MAP[cat];
      if (!key) {
        console.warn(`  ⚠️  Неизвестная категория: "${cat}" — проверь вручную`);
      }
      expenses.push({
        date: ed,
        category_orig: cat,
        category_key: key || '???',
        description: desc,
        odometer: odo !== null ? Math.round(odo) : null,
        amount,
      });
    }
  }
}

// ─── Вывод ───────────────────────────────────────────────────────────────────
const HR  = '─'.repeat(70);
const HR2 = '═'.repeat(70);

console.log('\n' + HR2);
console.log(`  ЗАПРАВКИ: ${fuels.length} записей`);
console.log(HR2);
console.log('# │ Дата        │ Пробег │ Литры │ Сумма (Lei) │ Полный бак?');
console.log(HR);
fuels.forEach((e, i) => {
  const no   = String(i + 1).padStart(2);
  const odo  = String(e.odometer).padStart(6);
  const lit  = String(e.liters).padEnd(5);
  const cost = String(e.total_cost).padStart(10);
  const full = e.is_full_tank ? '✅ да ' : '❌ нет';
  console.log(`${no}│ ${e.date} │ ${odo} │ ${lit} │ ${cost}  │ ${full}`);
});

console.log('\n' + HR2);
console.log(`  РАСХОДЫ: ${expenses.length} записей`);
console.log(HR2);
console.log('# │ Дата        │ Категория (старая → ключ)    │ Описание              │ Пробег │ Сумма');
console.log(HR);
expenses.forEach((e, i) => {
  const no   = String(i + 1).padStart(2);
  const cat  = `${e.category_orig} → ${e.category_key}`.padEnd(30);
  const desc = e.description.padEnd(22);
  const odo  = e.odometer !== null ? String(e.odometer).padStart(6) : '     —';
  console.log(`${no}│ ${e.date} │ ${cat}│ ${desc}│ ${odo} │ ${e.amount}`);
});

console.log('\n' + HR2);
console.log(`  ИТОГО: ${fuels.length} заправок + ${expenses.length} расходов = ${fuels.length + expenses.length} записей`);
console.log(HR2 + '\n');
