import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useBootstrap } from '@/app/_layout';
import { useThemeCtx } from '@/contexts/theme-context';
import { AppTheme } from '@/constants/theme';
import { settingsRepo, carRepo } from '@/db';
import OnboardingBackground from '@/components/OnboardingBackground';

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ current, th }: { current: number; th: AppTheme }) {
  return (
    <View style={g.paginationRow} pointerEvents="none">
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width:           i === current ? 22 : 6,
            height:          6,
            borderRadius:    3,
            backgroundColor: i === current ? th.colors.accent : th.colors.textWeak,
            marginHorizontal: 3,
          }}
        />
      ))}
    </View>
  );
}

// ─── Кнопки ───────────────────────────────────────────────────────────────────

function GradientButton({
  label,
  onPress,
  disabled = false,
  th,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  th: AppTheme;
}) {
  const { colors, onboarding: { sizes }, typography, fonts, shadows } = th;
  const btnBox = { height: sizes.btnHeight, borderRadius: sizes.btnRadius };

  if (disabled) {
    // Неактивная кнопка — плоская, без тени и градиента
    return (
      <View style={[g.btn, btnBox, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[g.btnText, typography.onboarding.btnText, fonts.onboarding.medium,
                      { color: colors.textMuted }]}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    // Тень живёт на внешнем View: у него нет overflow:'hidden' (иначе iOS
    // обрежет её вместе с содержимым), а непрозрачный фон нужен Android
    // для построения контура elevation.
    <View style={[shadows.ctaAccent, btnBox, { backgroundColor: th.gradient.accent.colors[1] }]}>
      <TouchableOpacity style={[g.btnTouch, btnBox]} onPress={onPress} activeOpacity={0.85}>
        <LinearGradient
          colors={th.gradient.accent.colors}
          start={th.gradient.accent.start}
          end={th.gradient.accent.end}
          style={[g.btn, btnBox]}
        >
          <Text style={[g.btnText, typography.onboarding.btnText, fonts.onboarding.medium,
                        { color: '#ffffff' }]}>
            {label}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ─── Нижний блок: пагинация + кнопка (одинаковый на всех экранах) ────────────

function BottomBlock({
  current,
  th,
  children,
}: {
  current: number;
  th: AppTheme;
  children: React.ReactNode;
}) {
  return (
    <View style={g.bottomBlock}>
      <Pagination current={current} th={th} />
      {children}
    </View>
  );
}

// ─── Slide 1 — Welcome ────────────────────────────────────────────────────────

function SlideWelcome({
  screenW,
  screenH,
  th,
  currentPage,
  onNext,
}: {
  screenW: number;
  screenH: number;
  th: AppTheme;
  currentPage: number;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const { colors, onboarding, fonts, typography, shadows } = th;
  const { sizes } = onboarding;

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: onboarding.bgBase, overflow: 'hidden' }}>
      {/* СЛОЙ 1 — фон, не перехватывает тапы */}
      <OnboardingBackground th={th} accent="blue" width={screenW} height={screenH} />

      {/* СЛОЙ 2 — контент */}
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[g.content, { alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }]}>
          {/* Лого со свечением-подложкой */}
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: sizes.logoGlow, height: sizes.logoGlow, borderRadius: sizes.logoGlow / 2,
                backgroundColor: onboarding.glowAccent,
                opacity: 0.18,
              }}
            />
            <Image
              source={require('../assets/icon-rounded-white-edge.png')}
              style={{ width: sizes.logo, height: sizes.logo, borderRadius: sizes.logoRadius }}
              resizeMode="cover"
            />
          </View>

          {/* Название */}
          <Text style={[g.appName, typography.onboarding.appName, fonts.onboarding.medium,
                        { color: colors.textPrimary }]}>
            MyCarLedger
          </Text>

          {/* Акцентная линия */}
          <View style={[g.accentLine, { width: sizes.accentLineW, backgroundColor: colors.accent }]} />

          {/* Слоган */}
          <Text style={[g.slogan, typography.onboarding.slogan, fonts.onboarding.regular,
                        { color: colors.textSecondary, marginTop: 20 }]}>
            {t('onboarding.welcome_slogan_line1')}
          </Text>
          <Text style={[g.slogan, typography.onboarding.slogan, fonts.onboarding.regular,
                        { color: colors.textSecondary }]}>
            {t('onboarding.welcome_slogan_line2')}
          </Text>
        </View>

        <BottomBlock current={currentPage} th={th}>
          {/* Белая кнопка: тень нейтральная тёмная, без голубого свечения */}
          <TouchableOpacity
            style={[
              g.btn,
              shadows.ctaNeutral,
              { height: sizes.btnHeight, borderRadius: sizes.btnRadius,
                backgroundColor: onboarding.startBtnBg },
            ]}
            onPress={onNext}
            activeOpacity={0.85}
          >
            <Text style={[g.btnText, typography.onboarding.btnText, fonts.onboarding.medium,
                          { color: colors.accent }]} numberOfLines={1}>
              {t('onboarding.start')}
            </Text>
          </TouchableOpacity>
        </BottomBlock>
      </SafeAreaView>
    </View>
  );
}

// ─── Slide 2 — Данные машины ─────────────────────────────────────────────────

function SlideCar({
  screenW,
  screenH,
  th,
  currentPage,
  carName,
  setCarName,
  odometer,
  setOdometer,
  odoValid,
  onNext,
}: {
  screenW:    number;
  screenH:    number;
  th:         AppTheme;
  currentPage:number;
  carName:    string;
  setCarName: (v: string) => void;
  odometer:   string;
  setOdometer:(v: string) => void;
  odoValid:   boolean;
  onNext:     () => void;
}) {
  const { t } = useTranslation();
  const { colors, onboarding, fonts, typography } = th;
  const { sizes } = onboarding;

  const [odoFocused, setOdoFocused] = useState(false);

  const fieldBox = { height: sizes.fieldHeight, borderRadius: sizes.fieldRadius };

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: onboarding.bgBase, overflow: 'hidden' }}>
      {/* СЛОЙ 1 — фон */}
      <OnboardingBackground th={th} accent="blue" width={screenW} height={screenH} />

      {/* СЛОЙ 2 — контент */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={[g.content, { paddingTop: 36 }]}>
            {/* Надзаголовок */}
            <Text style={[g.stepLabel, typography.onboarding.stepLabel, fonts.onboarding.medium,
                          { color: colors.accent }]}>
              {t('onboarding.step_of')}
            </Text>

            {/* Заголовок и подпись */}
            <Text style={[g.slideTitle, typography.onboarding.title, fonts.onboarding.medium,
                          { color: colors.textPrimary, marginTop: 10 }]}>
              {t('onboarding.car_title')}
            </Text>
            <Text style={[g.slideSubtitle, typography.onboarding.subtitle, fonts.onboarding.regular,
                          { color: colors.textSecondary, marginTop: 6 }]}>
              {t('onboarding.car_subtitle')}
            </Text>

            {/* Поле: Название машины */}
            <Text style={[g.fieldLabel, typography.onboarding.fieldLabel, fonts.onboarding.regular,
                          { color: colors.textMuted, marginTop: 28 }]}>
              {t('onboarding.name_label')}
            </Text>
            <View style={[
              g.fieldWrap, fieldBox,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
              <Ionicons name="car-outline" size={sizes.fieldIcon} color={colors.textSecondary} style={{ marginRight: 14 }} />
              <TextInput
                value={carName}
                onChangeText={setCarName}
                placeholder={t('onboarding.name_placeholder')}
                placeholderTextColor={colors.textWeak}
                style={[g.fieldInput, typography.onboarding.fieldInput, fonts.onboarding.regular,
                        { color: colors.textPrimary }]}
                selectionColor={colors.accent}
                returnKeyType="next"
                maxLength={40}
              />
            </View>

            {/* Поле: Пробег */}
            <Text style={[g.fieldLabel, typography.onboarding.fieldLabel, fonts.onboarding.regular,
                          { color: colors.textMuted, marginTop: 18 }]}>
              {t('onboarding.odometer_label')}
            </Text>
            <View style={[
              g.fieldWrap, fieldBox,
              {
                backgroundColor: colors.surface,
                borderColor:     odoFocused ? colors.borderAccent : colors.border,
              },
            ]}>
              <Ionicons
                name="speedometer-outline"
                size={sizes.fieldIcon}
                color={odoFocused ? colors.accent : colors.textSecondary}
                style={{ marginRight: 14 }}
              />
              <TextInput
                value={odometer}
                onChangeText={(txt) => setOdometer(txt.replace(/[^0-9]/g, ''))}
                placeholder="0"
                placeholderTextColor={colors.textWeak}
                keyboardType="numeric"
                style={[g.fieldInput, typography.onboarding.fieldInput, fonts.onboarding.regular,
                        { color: colors.textPrimary }]}
                selectionColor={colors.accent}
                onFocus={() => setOdoFocused(true)}
                onBlur={() => setOdoFocused(false)}
                returnKeyType="done"
                maxLength={7}
              />
            </View>
          </View>

          <BottomBlock current={currentPage} th={th}>
            <GradientButton
              label={t('onboarding.next')}
              onPress={onNext}
              disabled={!odoValid}
              th={th}
            />
          </BottomBlock>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Slide 3 — Готово ────────────────────────────────────────────────────────

function SlideDone({
  screenW,
  screenH,
  th,
  currentPage,
  onFinish,
}: {
  screenW:     number;
  screenH:     number;
  th:          AppTheme;
  currentPage: number;
  onFinish:    () => void;
}) {
  const { t } = useTranslation();
  const { colors, onboarding, fonts, typography, shadows } = th;
  const { sizes } = onboarding;

  const tips: Array<{
    icon: React.ComponentProps<typeof Ionicons>['name'];
    key:  'tip_add' | 'tip_service' | 'tip_backup';
  }> = [
    { icon: 'add',                    key: 'tip_add'     },
    { icon: 'construct-outline',      key: 'tip_service' },
    { icon: 'cloud-download-outline', key: 'tip_backup'  },
  ];

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: onboarding.bgBase, overflow: 'hidden' }}>
      {/* СЛОЙ 1 — фон, зелёный акцент */}
      <OnboardingBackground th={th} accent="green" width={screenW} height={screenH} />

      {/* СЛОЙ 2 — контент */}
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[g.content, { paddingTop: 44 }]}>
          {/* Круг с галочкой */}
          <View style={{ alignItems: 'center' }}>
            <View style={{
              width: sizes.doneCircle, height: sizes.doneCircle, borderRadius: sizes.doneCircle / 2,
              backgroundColor: onboarding.glowSuccess,
              borderWidth: 2,
              borderColor: colors.statusOk.bar,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Ionicons name="checkmark" size={sizes.doneCheck} color={colors.statusOk.bar} />
            </View>
          </View>

          {/* Заголовок и подпись */}
          <Text style={[g.slideTitle, typography.onboarding.title, fonts.onboarding.medium,
                        { color: colors.textPrimary, textAlign: 'center', marginTop: 20 }]}>
            {t('onboarding.done_title')}
          </Text>
          <Text style={[g.slideSubtitle, typography.onboarding.subtitle, fonts.onboarding.regular,
                        { color: colors.textSecondary, textAlign: 'center', marginTop: 8 }]}>
            {t('onboarding.done_subtitle')}
          </Text>

          {/* Карточки-подсказки: тень + тонкая граница, чтобы читались объёмными */}
          <View style={{ marginTop: 24 }}>
            {tips.map(({ icon, key }) => (
              <View
                key={key}
                style={[
                  g.tipCard, shadows.card,
                  { height: sizes.tipHeight, borderRadius: sizes.tipRadius,
                    backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={[
                  g.tipIconBox,
                  { width: sizes.tipIconBox, height: sizes.tipIconBox, borderRadius: sizes.tipIconBoxR,
                    backgroundColor: onboarding.glowAccent },
                ]}>
                  <Ionicons name={icon} size={sizes.tipIcon} color={colors.accent} />
                </View>
                <Text style={[g.tipText, typography.onboarding.tipText, fonts.onboarding.regular,
                              { color: colors.textSecondary }]} numberOfLines={2}>
                  {t(`onboarding.${key}`)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <BottomBlock current={currentPage} th={th}>
          <GradientButton
            label={t('onboarding.go')}
            onPress={onFinish}
            th={th}
          />
        </BottomBlock>
      </SafeAreaView>
    </View>
  );
}

// ─── Главный экран ────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { th, isDark } = useThemeCtx();
  const { t } = useTranslation();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { completeOnboarding } = useBootstrap();

  const [currentPage, setCurrentPage] = useState(0);
  const [carName,     setCarName]     = useState('');
  const [odometer,    setOdometer]    = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const pageRef   = useRef(0);
  pageRef.current = currentPage;

  // Пробег хранится строкой из одних цифр (фильтр в onChangeText)
  const odoValid = odometer.length > 0;
  const odoValidRef = useRef(odoValid);
  odoValidRef.current = odoValid;

  function goTo(idx: number) {
    scrollRef.current?.scrollTo({ x: idx * screenW, animated: true });
    setCurrentPage(idx);
  }

  // Аппаратная «Назад»: на первом экране — подтверждение выхода,
  // на остальных — возврат на предыдущий экран онбординга.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pageRef.current > 0) {
        goTo(pageRef.current - 1);
        return true;
      }
      Alert.alert(
        t('onboarding.exit_title'),
        t('onboarding.exit_message'),
        [
          { text: t('onboarding.cancel'), style: 'cancel' },
          { text: t('onboarding.exit'), style: 'destructive', onPress: () => BackHandler.exitApp() },
        ],
      );
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenW, t]);

  async function handleFinish() {
    const name = carName.trim() || (t('onboarding.name_placeholder') as string);
    const odo  = parseInt(odometer, 10);
    await carRepo.updateCar({ name, current_odometer: isNaN(odo) ? 0 : odo });
    await settingsRepo.updateSettings({ onboarding_completed: 1 });
    completeOnboarding();
    router.replace('/(tabs)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: th.onboarding.bgBase }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(e) => {
          // Свайп вперёд с экрана 2 заблокирован, пока пробег не введён.
          // Свайпы 1→2 и назад — свободны.
          if (!odoValidRef.current && e.nativeEvent.contentOffset.x > screenW) {
            scrollRef.current?.scrollTo({ x: screenW, animated: false });
          }
        }}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / screenW);
          setCurrentPage(Math.max(0, Math.min(2, idx)));
        }}
      >
        <SlideWelcome
          screenW={screenW}
          screenH={screenH}
          th={th}
          currentPage={currentPage}
          onNext={() => goTo(1)}
        />
        <SlideCar
          screenW={screenW}
          screenH={screenH}
          th={th}
          currentPage={currentPage}
          carName={carName}
          setCarName={setCarName}
          odometer={odometer}
          setOdometer={setOdometer}
          odoValid={odoValid}
          onNext={() => goTo(2)}
        />
        <SlideDone
          screenW={screenW}
          screenH={screenH}
          th={th}
          currentPage={currentPage}
          onFinish={handleFinish}
        />
      </ScrollView>
    </View>
  );
}

// ─── Общие стили ─────────────────────────────────────────────────────────────
// Здесь остаётся только раскладка. Из темы приходят и подмешиваются
// в массив стилей на месте использования:
//   размеры шрифта   — th.typography.onboarding.*
//   начертание       — th.fonts.onboarding.regular / .medium
//   габариты, тени   — th.onboarding.sizes.* / th.shadows.*
// Оставленный ниже fontWeight — запасной вариант, если шрифт не загрузился.

const g = StyleSheet.create({
  // Скелет
  content: {
    flex: 1,
    paddingHorizontal: 22,
  },
  bottomBlock: {
    paddingHorizontal: 22,
    paddingBottom: 32,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
  },

  // Кнопки
  btnTouch: {
    overflow: 'hidden',
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontWeight: '500',
  },

  // Welcome
  appName: {
    fontWeight: '500',
    marginTop: 26,
  },
  accentLine: {
    height: 3, borderRadius: 2, marginTop: 16,
  },
  slogan: {
    textAlign: 'center',
  },

  // Slides 2 & 3
  stepLabel: {
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  slideTitle: {
    fontWeight: '500',
  },
  slideSubtitle: {},
  fieldLabel: {
    fontWeight: '400', marginBottom: 8,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  fieldInput: {
    flex: 1,
    fontWeight: '400',
    padding: 0,     // убирает лишний padding на Android
  },

  // Done screen
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  tipIconBox: {
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginRight: 13,
  },
  tipText: {
    flex: 1,
  },
});
