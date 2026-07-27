import { memo, useEffect, useRef, useState } from 'react';
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

// ─── GridOverlay ─────────────────────────────────────────────────────────────

const GridOverlay = memo(function GridOverlay({
  opacity,
  color,
  width,
  height,
}: {
  opacity: number;
  color: string;
  width: number;
  height: number;
}) {
  const CELL = 22;
  const hCount = Math.ceil(height / CELL) + 1;
  const vCount = Math.ceil(width  / CELL) + 1;
  return (
    <View style={[StyleSheet.absoluteFillObject, { opacity }]}>
      {Array.from({ length: hCount }, (_, i) => (
        <View
          key={`h${i}`}
          style={{
            position: 'absolute', top: i * CELL, left: 0, right: 0,
            height: StyleSheet.hairlineWidth, backgroundColor: color,
          }}
        />
      ))}
      {Array.from({ length: vCount }, (_, i) => (
        <View
          key={`v${i}`}
          style={{
            position: 'absolute', left: i * CELL, top: 0, bottom: 0,
            width: StyleSheet.hairlineWidth, backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
});

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
  if (disabled) {
    return (
      <View style={[g.btn, { backgroundColor: th.colors.surfaceSecondary }]}>
        <Text style={[g.btnText, th.fonts.onboarding.medium, { color: th.colors.textMuted }]}>{label}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={g.btnTouch} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={th.gradient.accent.colors}
        start={th.gradient.accent.start}
        end={th.gradient.accent.end}
        style={g.btn}
      >
        <Text style={[g.btnText, th.fonts.onboarding.medium, { color: '#ffffff' }]}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
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
  const { colors, onboarding, fonts } = th;

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: colors.background, overflow: 'hidden' }}>
      {/* СЛОЙ 1 — декор, всегда первым, не перехватывает тапы */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={onboarding.gradientColors}
          locations={[0, 0.45, 0.8, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <GridOverlay
          opacity={onboarding.gridOverlayOpacity}
          color={colors.textPrimary}
          width={screenW}
          height={screenH}
        />
      </View>

      {/* СЛОЙ 2 — контент */}
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[g.content, { alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }]}>
          {/* Лого со свечением-подложкой */}
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: 180, height: 180, borderRadius: 90,
                backgroundColor: onboarding.glowAccent,
                opacity: 0.18,
              }}
            />
            <Image
              source={require('../assets/icon-rounded-white-edge.png')}
              style={{ width: 128, height: 128, borderRadius: 28 }}
              resizeMode="cover"
            />
          </View>

          {/* Название */}
          <Text style={[g.appName, fonts.onboarding.medium, { color: colors.textPrimary }]}>
            MyCarLedger
          </Text>

          {/* Акцентная линия */}
          <View style={[g.accentLine, { backgroundColor: colors.accent }]} />

          {/* Слоган */}
          <Text style={[g.slogan, fonts.onboarding.regular, { color: colors.textSecondary, marginTop: 20 }]}>
            {t('onboarding.welcome_slogan_line1')}
          </Text>
          <Text style={[g.slogan, fonts.onboarding.regular, { color: colors.textSecondary }]}>
            {t('onboarding.welcome_slogan_line2')}
          </Text>
        </View>

        <BottomBlock current={currentPage} th={th}>
          <TouchableOpacity
            style={[g.btn, { backgroundColor: onboarding.startBtnBg }]}
            onPress={onNext}
            activeOpacity={0.85}
          >
            <Text style={[g.btnText, fonts.onboarding.medium, { color: colors.accent }]} numberOfLines={1}>
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
  const { colors, onboarding, fonts } = th;

  const [odoFocused, setOdoFocused] = useState(false);

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: colors.background, overflow: 'hidden' }}>
      {/* СЛОЙ 1 — декор */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* Еле заметный голубой подсвет сверху, 35% высоты */}
        <LinearGradient
          colors={[onboarding.glowAccent, 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: screenH * 0.35, opacity: 0.28 }}
        />
        <GridOverlay
          opacity={onboarding.gridOverlayOpacityInner}
          color={colors.textPrimary}
          width={screenW}
          height={screenH}
        />
      </View>

      {/* СЛОЙ 2 — контент */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={[g.content, { paddingTop: 36 }]}>
            {/* Надзаголовок */}
            <Text style={[g.stepLabel, fonts.onboarding.medium, { color: colors.accent }]}>
              {t('onboarding.step_of')}
            </Text>

            {/* Заголовок и подпись */}
            <Text style={[g.slideTitle, fonts.onboarding.medium, { color: colors.textPrimary, marginTop: 10 }]}>
              {t('onboarding.car_title')}
            </Text>
            <Text style={[g.slideSubtitle, fonts.onboarding.regular, { color: colors.textSecondary, marginTop: 6 }]}>
              {t('onboarding.car_subtitle')}
            </Text>

            {/* Поле: Название машины */}
            <Text style={[g.fieldLabel, fonts.onboarding.regular, { color: colors.textMuted, marginTop: 28 }]}>
              {t('onboarding.name_label')}
            </Text>
            <View style={[
              g.fieldWrap,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
              <Ionicons name="car-outline" size={20} color={colors.textSecondary} style={{ marginRight: 14 }} />
              <TextInput
                value={carName}
                onChangeText={setCarName}
                placeholder={t('onboarding.name_placeholder')}
                placeholderTextColor={colors.textWeak}
                style={[g.fieldInput, fonts.onboarding.regular, { color: colors.textPrimary }]}
                selectionColor={colors.accent}
                returnKeyType="next"
                maxLength={40}
              />
            </View>

            {/* Поле: Пробег */}
            <Text style={[g.fieldLabel, fonts.onboarding.regular, { color: colors.textMuted, marginTop: 18 }]}>
              {t('onboarding.odometer_label')}
            </Text>
            <View style={[
              g.fieldWrap,
              {
                backgroundColor: colors.surface,
                borderColor:     odoFocused ? colors.borderAccent : colors.border,
              },
            ]}>
              <Ionicons
                name="speedometer-outline"
                size={20}
                color={odoFocused ? colors.accent : colors.textSecondary}
                style={{ marginRight: 14 }}
              />
              <TextInput
                value={odometer}
                onChangeText={(txt) => setOdometer(txt.replace(/[^0-9]/g, ''))}
                placeholder="0"
                placeholderTextColor={colors.textWeak}
                keyboardType="numeric"
                style={[g.fieldInput, fonts.onboarding.regular, { color: colors.textPrimary }]}
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
  const { colors, onboarding, fonts } = th;

  const tips: Array<{
    icon: React.ComponentProps<typeof Ionicons>['name'];
    key:  'tip_add' | 'tip_service' | 'tip_backup';
  }> = [
    { icon: 'add',                    key: 'tip_add'     },
    { icon: 'construct-outline',      key: 'tip_service' },
    { icon: 'cloud-download-outline', key: 'tip_backup'  },
  ];

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: colors.background, overflow: 'hidden' }}>
      {/* СЛОЙ 1 — декор */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* Лёгкий зелёный подсвет сверху, 35% высоты */}
        <LinearGradient
          colors={[onboarding.glowSuccess, 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: screenH * 0.35, opacity: 0.22 }}
        />
        <GridOverlay
          opacity={onboarding.gridOverlayOpacityInner}
          color={colors.textPrimary}
          width={screenW}
          height={screenH}
        />
      </View>

      {/* СЛОЙ 2 — контент */}
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[g.content, { paddingTop: 44 }]}>
          {/* Круг с галочкой */}
          <View style={{ alignItems: 'center' }}>
            <View style={{
              width: 68, height: 68, borderRadius: 34,
              backgroundColor: onboarding.glowSuccess,
              borderWidth: 2,
              borderColor: colors.statusOk.bar,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Ionicons name="checkmark" size={30} color={colors.statusOk.bar} />
            </View>
          </View>

          {/* Заголовок и подпись */}
          <Text style={[g.slideTitle, fonts.onboarding.medium, { color: colors.textPrimary, textAlign: 'center', marginTop: 20 }]}>
            {t('onboarding.done_title')}
          </Text>
          <Text style={[g.slideSubtitle, fonts.onboarding.regular, { color: colors.textSecondary, textAlign: 'center', marginTop: 8 }]}>
            {t('onboarding.done_subtitle')}
          </Text>

          {/* Карточки-подсказки */}
          <View style={{ marginTop: 24 }}>
            {tips.map(({ icon, key }) => (
              <View
                key={key}
                style={[
                  g.tipCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={[g.tipIconBox, { backgroundColor: onboarding.glowAccent }]}>
                  <Ionicons name={icon} size={16} color={colors.accent} />
                </View>
                <Text style={[g.tipText, fonts.onboarding.regular, { color: colors.textSecondary }]} numberOfLines={2}>
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
    <View style={{ flex: 1, backgroundColor: th.colors.background }}>
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
// fontFamily здесь НЕ задаётся: он приходит из темы (th.fonts.onboarding.*)
// и подмешивается в массив стилей на месте использования. Указанный ниже
// fontWeight — запасной вариант, если шрифт не загрузился.

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
    borderRadius: 18,
    overflow: 'hidden',
  },
  btn: {
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 16, fontWeight: '500',
  },

  // Welcome
  appName: {
    fontSize: 30,
    fontWeight: '500',
    marginTop: 26,
    letterSpacing: 0.3,
  },
  accentLine: {
    width: 48, height: 3, borderRadius: 2, marginTop: 16,
  },
  slogan: {
    fontSize: 16, lineHeight: 24, textAlign: 'center',
  },

  // Slides 2 & 3
  stepLabel: {
    fontSize: 11, fontWeight: '500', letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  slideTitle: {
    fontSize: 22, fontWeight: '500',
  },
  slideSubtitle: {
    fontSize: 13, lineHeight: 19,
  },
  fieldLabel: {
    fontSize: 12, fontWeight: '400', marginBottom: 8,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    borderRadius: 15,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  fieldInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
    padding: 0,     // убирает лишний padding на Android
  },

  // Done screen
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 62,
    borderRadius: 15,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  tipIconBox: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginRight: 13,
  },
  tipText: {
    flex: 1, fontSize: 14, lineHeight: 20,
  },
});
