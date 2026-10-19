/**
 * Общий хелпер для форм с полями ввода (добавление заправки/расхода,
 * регламент, «Сделано»): клавиатура не должна перекрывать поле ввода или
 * кнопку «Сохранить».
 *
 * KeyboardAvoidingView (behavior: iOS 'padding', Android 'height') отвечает
 * за то, чтобы контейнер формы сжался/сдвинулся — это нужно делать отдельно
 * от React Native, потому что при edgeToEdgeEnabled (app.config.js) Android
 * не ресайзит окно сам по себе даже с windowSoftInputMode="adjustResize":
 * edge-to-edge рисует поверх системных баров, и ресайз из манифеста реально
 * не применяется, пока его не подхватит сам RN-компонент.
 *
 * Второй шаг — автопрокрутка сфокусированного поля в видимую область:
 * ScrollView это не делает сам по себе (кроме автоматического варианта
 * `automaticallyAdjustKeyboardInsets`, который есть только на iOS). Правильный
 * путь без новых нативных зависимостей — встроенный в сам ScrollView метод
 * `scrollResponderScrollNativeHandleToKeyboard`, которым исторически
 * пользуются все «keyboard aware scroll view»-библиотеки.
 */

import { useRef } from 'react';
import {
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  TargetedEvent,
} from 'react-native';

export const KEYBOARD_AVOIDING_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';

export function useKeyboardAwareScroll() {
  const scrollRef = useRef<ScrollView>(null);

  /** Передавать как (часть) onFocus у TextInput — совпадает с типом TextInputProps['onFocus']. */
  function onFieldFocus(e: NativeSyntheticEvent<TargetedEvent>, extraOffset = 90) {
    scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
      e.nativeEvent.target,
      extraOffset,
      true,
    );
  }

  return { scrollRef, onFieldFocus };
}
