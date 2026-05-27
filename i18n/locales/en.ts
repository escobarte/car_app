/**
 * English dictionary.
 * Structure must match ru.ts exactly — same keys, different values.
 */

import { TranslationKeys } from './ru';

const en: TranslationKeys = {
  common: {
    loading:   'Loading…',
    error:     'Error',
    cancel:    'Cancel',
    save:      'Save',
    delete:    'Delete',
    edit:      'Edit',
    done:      'Done',
    add:       'Add',
    back:      'Back',
    yes:       'Yes',
    no:        'No',
    km:        'km',
    days_one:  'day',
    days_few:  'days',
    days_many: 'days',
  },

  nav: {
    home:    'Home',
    history: 'History',
    add:     '+',
    service: 'Service',
    stats:   'Stats',
  },

  status: {
    ok:   'OK',
    soon: 'Soon',
    due:  'Due',
  },

  categories: {
    documents:      'Documents',
    chemistry:      'Car chemicals',
    tuning:         'Tuning',
    accessories:    'Accessories',
    electronics:    'Electronics',
    service:        'Service',
    comfort:        'Comfort',
    parts:          'Parts',
    gov_inspection: 'Gov. inspection',
    fines:          'Fines',
    parking:        'Parking',
    tires:          'Tires',
    addNew:         '+ Add category',
  },

  dashboard: {
    title:           'Home',
    thisMonth:       'Monthly expenses',
    avgFuelPrice:    'Avg. price',
    avgConsumption:  'Avg. consumption',
    perLiter:        'per liter',
    per100km:        'L/100km',
    reminders:       'Reminders',
    noReminders:     'All schedules are on track',
    odometer:        'Odometer',
  },

  addFuel: {
    title:         'Fuel',
    date:          'Date',
    odometer:      'Odometer',
    liters:        'Liters',
    totalCost:     'Total cost',
    pricePerLiter: 'Price per liter',
    fullTank:      'Full tank',
    saveBtn:       'Save fuel entry',
    errorLiters:   'Enter number of liters',
    errorCost:     'Enter total cost',
    errorOdometer: 'Odometer must be greater than the previous entry',
  },

  addExpense: {
    title:       'Expense',
    category:    'Category',
    date:        'Date',
    amount:      'Amount',
    description: 'Description',
    odometer:    'Odometer (optional)',
    saveBtn:     'Save expense',
    errorAmount: 'Enter amount',
  },

  service: {
    title:          'Service',
    doneBtn:        'Done',
    addReminder:    '+ Add schedule',
    remainingKm:    '{{n}} km left',
    remainingDays:  '{{n}} days left',
    overdueKm:      '{{n}} km overdue',
    overdueDays:    '{{n}} days overdue',
    intervalKm:     'Every {{n}} km',
    intervalDays:   'Every {{n}} days',
    warnBeforeKm:   'Warn {{n}} km before',
    warnBeforeDays: 'Warn {{n}} days before',
    history:        'Work history',
    noHistory:      'No work recorded yet',
  },

  history: {
    title:       'History',
    empty:       'No entries yet',
    fuel:        'Fuel',
    expense:     'Expense',
    maintenance: 'Service',
    filterAll:   'All',
  },

  stats: {
    title:          'Statistics',
    tabFuel:        'Fuel',
    tabExpenses:    'Expenses',
    tabConsumption: 'Consumption (L/100)',
    noData:         'No data',
  },

  settings: {
    title:               'Settings',
    sectionCar:          'CAR',
    sectionCurrency:     'CURRENCY',
    sectionLanguage:     'LANGUAGE',
    sectionAppearance:   'APPEARANCE',
    sectionNotifications:'NOTIFICATIONS',
    sectionBackup:       'BACKUP',
    carName:             'Car name',
    odometer:            'Current odometer',
    currency:            'Currency',
    language:            'Language',
    darkTheme:           'Dark theme',
    notifications:       'Notifications',
    exportData:          'Export data',
    importData:          'Import data',
    categories:          'Expense categories',
  },

  dbCheck: {
    title:             '🗄 Database Check',
    sectionCar:        'CAR',
    sectionSettings:   'APP_SETTINGS',
    sectionCategories: 'CATEGORY ({{count}} items)',
    sectionReminders:  'REMINDER ({{count}} schedules)',
    footer:            '✅ All tables created and seeded',
    builtin:           'built-in',
  },
};

export default en;
