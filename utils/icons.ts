/**
 * Общий справочник иконок.
 *
 * Встроенные категории хранят имена Tabler Icons в поле CATEGORY.icon.
 * Пользовательские категории хранят имена Ionicons напрямую.
 *
 * resolveIcon() → корректное имя для <Ionicons name={...} />.
 */

// Tabler Icons → Ionicons
export const TABLER_TO_ION: Record<string, string> = {
  'file-text':       'document-text-outline',
  'spray':           'water-outline',
  'settings-2':      'hammer-outline',
  'puzzle':          'extension-puzzle-outline',
  'device-speaker':  'phone-portrait-outline',
  'tool':            'build-outline',
  'armchair':        'home-outline',
  'engine':          'settings-outline',
  'clipboard-check': 'clipboard-outline',
  'alert-octagon':   'alert-circle-outline',
  'parking':         'car-outline',
  'wheel':           'reload-circle-outline',
};

/**
 * Преобразует любое имя иконки → корректное имя Ionicons.
 * Если имя есть в TABLER_TO_ION — возвращает маппинг.
 * Иначе — возвращает как есть (предполагается, что это уже Ionicons).
 */
export function resolveIcon(icon: string): string {
  return TABLER_TO_ION[icon] ?? icon;
}

/**
 * Набор иконок для выбора при создании пользовательских категорий.
 * Только Ionicons-имена.
 */
export const USER_ICON_OPTIONS: string[] = [
  'car-outline',
  'build-outline',
  'document-text-outline',
  'flash-outline',
  'key-outline',
  'shield-checkmark-outline',
  'camera-outline',
  'bag-outline',
  'gift-outline',
  'fitness-outline',
  'home-outline',
  'star-outline',
  'heart-outline',
  'medkit-outline',
  'paw-outline',
  'phone-portrait-outline',
  'bicycle-outline',
  'cafe-outline',
  'airplane-outline',
  'bandage-outline',
];
