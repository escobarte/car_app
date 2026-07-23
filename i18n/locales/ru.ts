/**
 * Русский словарь.
 *
 * КАК ДОБАВЛЯТЬ НОВЫЕ СТРОКИ:
 *  1. Выбери нужную секцию (или создай новую под новый экран).
 *  2. Добавь ключ и значение здесь.
 *  3. Добавь тот же ключ в en.ts с английским значением.
 *  4. В компоненте: const { t } = useTranslation();  →  t('секция.ключ')
 *
 * Правила именования ключей:
 *  - секция = экран или модуль (dashboard, history, addFuel, …)
 *  - ключ   = что это (title, saveBtn, errorEmpty, …)
 *  - {{переменная}} — подстановка значения: t('fuel.literUnit', { n: 42.5 })
 */

const ru = {
  // ── Общие / переиспользуемые ────────────────────────────────────────────
  common: {
    loading:   'Загружаю…',
    error:     'Ошибка',
    cancel:    'Отмена',
    save:      'Сохранить',
    delete:    'Удалить',
    edit:      'Изменить',
    done:      'Сделано',
    add:       'Добавить',
    back:      'Назад',
    yes:       'Да',
    no:        'Нет',
    km:            'км',
    liters:        'л',
    errorOdometer: 'Пробег не может быть меньше текущего',
    days_one:  'день',
    days_few:  'дня',
    days_many: 'дней',
  },

  // ── Нижняя навигация ────────────────────────────────────────────────────
  nav: {
    home:    'Главная',
    history: 'История',
    add:     '+',
    service: 'Сервис',
    stats:   'Статистика',
  },

  // ── Статусы напоминаний ─────────────────────────────────────────────────
  status: {
    ok:   'В норме',
    soon: 'Скоро',
    due:  'Пора',
  },

  // ── Встроенные категории (раздел 7.1 ТЗ) ───────────────────────────────
  // Ключи совпадают с полем CATEGORY.key в базе данных
  categories: {
    documents:      'Документы',
    chemistry:      'Химия',
    tuning:         'Тюнинг',
    accessories:    'Аксессуары',
    electronics:    'Электроника',
    service:        'Сервис',
    comfort:        'Комфорт',
    parts:          'Запчасти',
    gov_inspection: 'Гос. ТО',
    fines:          'Штрафы',
    parking:        'Парковка',
    tires:          'Шины',
    addNew:         '+ Добавить категорию',
  },

  // ── Дашборд (Этап 4) ────────────────────────────────────────────────────
  dashboard: {
    title:           'Главная',
    thisMonth:       'Расходы за месяц',
    avgFuelPrice:    'Средняя цена',
    avgConsumption:  'Средний расход',
    perLiter:        'за литр',
    per100km:        'л/100км',
    reminders:          'Напоминания',
    noReminders:        'Все регламенты в норме',
    odometer:           'Пробег',
    recentTransactions: 'Последние транзакции',
  },

  // ── Форма добавления заправки (Этап 2) ──────────────────────────────────
  addFuel: {
    title:            'Заправка',
    date:             'Дата',
    odometer:         'Пробег',
    liters:           'Литры',
    totalCost:        'Сумма',
    pricePerLiter:    'Цена за литр',
    fullTank:         'Полный бак',
    saveBtn:          'Сохранить заправку',
    preview:          'Предварительный расчёт',
    consumption:      'Расход топлива',
    per100km:         'л/100км',
    notFullTankSkip:  'неполный бак — пропуск',
    firstFullTank:    'нет предыдущей полной заправки',
    errorLiters:      'Введите количество литров',
    errorCost:        'Введите сумму',
    errorOdometer:    'Пробег не может быть меньше текущего',
  },

  // ── Форма добавления расхода (Этап 5) ────────────────────────────────────
  addExpense: {
    title:           'Расход',
    category:        'Категория',
    date:            'Дата',
    amount:          'Сумма',
    description:     'Описание',
    odometer:        'Пробег (необязательно)',
    saveBtn:         'Сохранить расход',
    errorAmount:     'Введите сумму',
    errorCategory:   'Выберите категорию',
  },

  // ── Обслуживание (Этап 6) ────────────────────────────────────────────────
  service: {
    title:          'Обслуживание',
    doneBtn:        'Сделано',
    addReminder:    '+ Добавить регламент',
    remainingKm:    'Осталось {{n}} км',
    remainingDays:  'Осталось {{n}} дн.',
    overdueKm:      'Просрочено на {{n}} км',
    overdueDays:    'Просрочено на {{n}} дн.',
    intervalKm:     'Каждые {{n}} км',
    intervalDays:   'Каждые {{n}} дней',
    warnBeforeKm:   'Предупреждать за {{n}} км',
    warnBeforeDays: 'Предупреждать за {{n}} дней',
    history:        'История работ',
    noHistory:      'Работы ещё не выполнялись',
    noReminders:    'Регламентов нет. Добавьте первый!',
    // Модальное окно «Сделано»
    markDoneTitle:  'Отметить выполнение',
    dateField:      'Дата',
    odoField:       'Пробег',
    costField:      'Стоимость (необязательно)',
    noteField:      'Заметка (необязательно)',
    confirmDone:    'Подтвердить',
  },

  // ── Форма добавления регламента (Этап 6) ─────────────────────────────────
  addReminder: {
    title:          'Новый регламент',
    editTitle:      'Изменить регламент',
    name:           'Название',
    namePlaceholder:'Например, Замена масла',
    typeMileage:    'По пробегу',
    typeTime:       'По времени',
    intervalKm:     'Интервал, км',
    intervalDays:   'Интервал, дней',
    warnBefore:     'Предупреждать за',
    warnKm:         'км до срока',
    warnDays:       'дней до срока',
    typeLabel:      'Тип',
    saveBtn:        'Сохранить регламент',
    editSaveBtn:    'Сохранить изменения',
    errorName:      'Введите название',
    errorInterval:  'Введите интервал',
    errorWarn:      'Введите порог предупреждения',
  },

  // ── История (Этап 3) ─────────────────────────────────────────────────────
  history: {
    title:         'История',
    empty:         'Записей пока нет',
    fuel:          'Заправка',
    expense:       'Расход',
    maintenance:   'Обслуживание',
    filterAll:     'Все',
    filterFuel:    'Заправки',
    filterExpense: 'Расходы',
    filterService: 'Сервис',
    sortDate:      'Дата',
    sortAmount:    'Сумма',
  },

  // ── Детали записи (модалка) ──────────────────────────────────────────────
  recordDetail: {
    date:          'Дата',
    odometer:      'Пробег',
    liters:        'Литры',
    total:         'Сумма',
    pricePerLiter: 'Цена за литр',
    fullTank:      'Полный бак',
    consumption:   'Расход',
    category:      'Категория',
    description:   'Описание',
    note:          'Заметка',
  },

  // ── Статистика (Этап 8) ──────────────────────────────────────────────────
  stats: {
    title:             'Статистика',
    tabFuel:           'Топливо',
    tabExpenses:       'Расходы',
    tabConsumption:    'Расход (л/100)',
    noData:            'Нет данных',
    totalLabel:        'Итого за 6 мес.',
    avgConsLabel:      'Средний расход',
    lPer100:           'л/100 км',
    categoryBreakdown: 'По категориям',
    shareByMonth:      'Доля трат по месяцам',
    trendVs:           '{{pct}}% к {{month}}',
    kmPerMonth:        '{{km}} км за месяц',
    metricAvg:         'Средний расход',
    metricDistance:    'Пробег за период',
    metricMin:         'Минимум',
    metricMax:         'Максимум',
    donutMonthTitle:   'Заправки: {{month}}',
    expMetricAvg:      'Средний в месяц',
    expMetricTotal:    'Всего за период',
    expMetricMin:      'Минимальный месяц',
    expMetricMax:      'Максимальный месяц',
    catModalTotal:     'Сумма за период',
    catModalCount:     'Записей',
    catModalShare:     'Доля в расходах',
    catModalRecords:   'Записи',
  },

  // ── Настройки (Этап 9) ───────────────────────────────────────────────────
  settings: {
    title:          'Настройки',
    sectionCar:     'МАШИНА',
    sectionCurrency:'ВАЛЮТА',
    sectionLanguage:'ЯЗЫК',
    sectionAppearance:'ВНЕШНИЙ ВИД',
    sectionNotifications:'УВЕДОМЛЕНИЯ',
    sectionBackup:  'РЕЗЕРВНАЯ КОПИЯ',
    carName:        'Название машины',
    odometer:       'Текущий пробег',
    currency:       'Валюта',
    language:       'Язык',
    darkTheme:      'Тёмная тема',
    notifications:  'Уведомления',
    exportData:          'Экспорт данных',
    importData:          'Импорт данных',
    categories:          'Категории расходов',
    editOdometerTitle:   'Новый пробег, км',
  },

  // ── Push-уведомления (Этап 7) ───────────────────────────────────────────
  notifications: {
    channelName:  'Напоминания об обслуживании',
    channelDesc:  'Уведомления о сроках ТО и обслуживания',
    due:          'Пора!',
    overdue:      'Просрочено!',
    soonDays:     'Через {{n}} дн.',
    soonKm:       'Осталось {{n}} км',
    overdueKm:    'Просрочено на {{n}} км',
    overdueDays:  'Просрочено на {{n}} дн.',
  },

  // ── Резервная копия (Этап 9) ────────────────────────────────────────────
  backup: {
    exportSuccess:       'Файл сохранён',
    exportSavedSAF:      '«{{name}}» сохранён в выбранную папку',
    exportError:         'Не удалось создать файл',
    importConfirmTitle:  'Восстановить данные?',
    importConfirmMsg:    'Это перезапишет ВСЕ текущие данные приложения. Продолжить?',
    importConfirmOk:     'Восстановить',
    importSuccess:              'Данные восстановлены',
    importError:                'Ошибка при восстановлении',
    importErrorInvalidFile:     'Файл повреждён или имеет неверный формат',
    importErrorRestoreFailed:   'Ошибка при записи в базу данных',
    importCancelled:            'Отменено',
    fuel:                'заправок',
    expense:             'расходов',
    service:             'обслуживаний',
  },

  // ── История: удаление ────────────────────────────────────────────────────
  historyActions: {
    deleteTitle:   'Удалить запись?',
    deleteMsg:     'Это действие нельзя отменить.',
    deleteConfirm: 'Удалить',
    edit:          'Изменить',
    delete:        'Удалить',
  },

  // ── Экран управления категориями (Этап 9) ───────────────────────────────
  categoriesScreen: {
    title:            'Категории расходов',
    addTitle:         'Новая категория',
    editTitle:        'Редактировать',
    namePlaceholder:  'Название',
    iconLabel:        'Иконка',
    saveBtn:          'Сохранить',
    errorHasExpenses: 'Сначала удалите или перенесите расходы этой категории',
  },

  // ── Выбор валюты (Этап 9) ────────────────────────────────────────────────
  selectCurrency: {
    title:  'Валюта',
    search: 'Поиск…',
  },

  // ── Выбор языка (Этап 9) ─────────────────────────────────────────────────
  selectLanguage: {
    title: 'Язык',
    ru:    'Русский',
    en:    'English',
  },

  // ── Детали регламента (модалка) ──────────────────────────────────────────
  reminderDetail: {
    type:           'Тип',
    typeMileage:    'По пробегу',
    typeTime:       'По времени',
    interval:       'Интервал',
    lastDate:       'Дата последнего выполнения',
    lastOdo:        'Пробег последнего выполнения',
    remaining:      'Остаток до срока',
    historyTitle:   'История этого регламента',
    noHistory:      'Работы ещё не выполнялись',
    editBtn:        'Изменить',
    doneBtn:        'Сделано',
    deleteTitle:    'Удалить регламент?',
    deleteMsg:      'История выполнений сохранится, но регламент исчезнет из списка.',
    deleteConfirm:  'Удалить',
  },

  // ── Модалки дашборда ─────────────────────────────────────────────────────
  dashModal: {
    noData:           '—',
    // Разбивка расходов за месяц
    breakdownTitle:   'Расходы за месяц',
    breakdownFuel:    'Топливо',
    breakdownExp:     'Прочие расходы',
    breakdownSvc:     'Сервис',
    breakdownTotal:   'Итого',
    breakdownToStats: 'Открыть статистику',
    // Детали цены
    priceTitle:       'Цена за литр',
    priceAvg3m:       'Средняя (3 мес.)',
    priceMin:         'Минимум (3 мес.)',
    priceMax:         'Максимум (3 мес.)',
    priceLastFill:    'Последняя заправка',
    priceTrend:       'К прошлому месяцу',
    // Детали расхода топлива
    consTitle:        'Расход топлива',
    consBest:         'Лучший показатель',
    consWorst:        'Худший показатель',
    consTrend:        'К прошлому месяцу',
    consLast5:        'Последние 5 полных баков',
    consBadgeBest:    'лучший',
    consBadgeWorst:   'худший',
  },

  // ── Временная отладка уведомлений (TEMP: удалить после проверки) ────────
  debug: {
    sectionTitle:   'DEBUG',
    testNotifBtn:   'Тест уведомления через 30 сек',
    notifScheduled: 'Запланировано, сверни приложение',
    notifDenied:    'Разрешение на уведомления не выдано',
    testNotifTitle: 'Тест уведомлений',
    testNotifBody:  'Если ты видишь это — push работает!',
  },

  // ── Временный экран проверки БД ──────────────────────────────────────────
  dbCheck: {
    title:       '🗄 Проверка базы данных',
    sectionCar:  'CAR (машина)',
    sectionSettings: 'APP_SETTINGS (настройки)',
    sectionCategories: 'CATEGORY ({{count}} категорий)',
    sectionReminders:  'REMINDER ({{count}} регламентов)',
    footer:      '✅ Все таблицы созданы и заполнены стартовыми данными',
    builtin:     'встроенная',
  },
};

export default ru;

/**
 * TranslationKeys — тип структуры словаря.
 * en.ts должен содержать ровно те же ключи.
 * Значения могут быть любыми строками (не литеральными).
 */
export type TranslationKeys = typeof ru;
