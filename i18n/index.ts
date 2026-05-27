/**
 * Настройка i18n (i18next + react-i18next).
 *
 * Используется ТОЛЬКО локальный словарь — интернет не нужен.
 * Язык по умолчанию: определяется по языку телефона при первом запуске,
 * затем берётся из APP_SETTINGS.language (менять через i18n.changeLanguage).
 *
 * Импортируй этот модуль в _layout.tsx ДО рендера любых экранов:
 *   import '@/i18n';
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import ru from './locales/ru';
import en from './locales/en';

// Определяем язык телефона синхронно (до первого рендера)
const deviceLanguageCode = getLocales()[0]?.languageCode ?? 'en';
const SUPPORTED = ['ru', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED)[number];

export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return (SUPPORTED as readonly string[]).includes(lang);
}

const defaultLng: SupportedLanguage = isSupportedLanguage(deviceLanguageCode)
  ? deviceLanguageCode
  : 'en';

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',   // требуется для React Native
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng:          defaultLng,
  fallbackLng:  'en',
  interpolation: {
    escapeValue: false,      // React сам экранирует строки
  },
});

export default i18n;
