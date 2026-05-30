/**
 * Заглушка вкладки «+».
 * Экран никогда не отображается — нажатие перехватывается
 * кастомной кнопкой AddTabButton в (tabs)/_layout.tsx.
 */

import { View } from 'react-native';

export default function AddPlaceholder() {
  return <View style={{ flex: 1 }} />;
}
