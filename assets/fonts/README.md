# Шрифты

Ожидаются ровно два файла (имена регистрозависимы):

| Файл                         | Вес | fontFamily                |
|------------------------------|-----|---------------------------|
| `HelveticaNeue-Regular.ttf`  | 400 | `HelveticaNeue-Regular`   |
| `HelveticaNeue-Medium.ttf`   | 500 | `HelveticaNeue-Medium`    |

Подключение: `constants/fonts.ts` → `useFonts()` в `app/_layout.tsx`.
Применение: только экраны Onboarding, через `th.fonts.onboarding.regular / .medium`.

Без этих файлов Metro не соберёт бандл («Unable to resolve module»).

Helvetica Neue — проприетарный шрифт (Linotype/Monotype). Для публикации
приложения нужна лицензия на встраивание в мобильное приложение.
