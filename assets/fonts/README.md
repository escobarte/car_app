# Шрифты

Ожидаются ровно два файла (имена регистрозависимы):

| Файл                 | Вес | fontFamily      |
|----------------------|-----|-----------------|
| `Inter-Regular.ttf`  | 400 | `Inter-Regular` |
| `Inter-Medium.ttf`   | 500 | `Inter-Medium`  |

Подключение: `constants/fonts.ts` → `useFonts()` в `app/_layout.tsx`.
Применение: только экраны Onboarding, через `th.fonts.onboarding.regular / .medium`.

Без этих файлов Metro не соберёт бандл («Unable to resolve module»).

Inter — свободный шрифт (SIL Open Font License 1.1), встраивание в приложение
разрешено. Кириллица в комплекте.
