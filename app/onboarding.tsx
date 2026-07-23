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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    <View
      style={[StyleSheet.absoluteFillObject, { opacity }]}
      pointerEvents="none"
    >
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
            width:           i === current ? 22 : 7,
            height:          7,
            borderRadius:    3.5,
            backgroundColor: i === current ? th.colors.accent : th.colors.textWeak,
            marginHorizontal: 3,
          }}
        />
      ))}
    </View>
  );
}

// ─── GradientButton ───────────────────────────────────────────────────────────

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
      <View style={[g.gradBtnTouch, { backgroundColor: th.colors.surfaceSecondary }]}>
        <View style={g.gradBtnInner}>
          <Text style={[g.gradBtnText, { color: th.colors.textMuted }]}>{label}</Text>
        </View>
      </View>
    );
  }
  return (
    <TouchableOpacity style={g.gradBtnTouch} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={th.gradient.accent.colors}
        start={th.gradient.accent.start}
        end={th.gradient.accent.end}
        style={g.gradBtnInner}
      >
        <Text style={[g.gradBtnText, { color: '#ffffff' }]}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Slide 1 — Welcome ────────────────────────────────────────────────────────

function SlideWelcome({
  screenW,
  screenH,
  th,
  currentPage,
  bottomInset,
  onNext,
}: {
  screenW: number;
  screenH: number;
  th: AppTheme;
  currentPage: number;
  bottomInset: number;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const { colors, onboarding } = th;

  return (
    <View style={{ width: screenW, height: screenH, overflow: 'hidden' }}>
      {/* Фоновый градиент: чёрный сверху → насыщенный синий снизу */}
      <LinearGradient
        colors={onboarding.gradientColors}
        locations={[0, 0.45, 0.8, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* Бирюзовое свечение у нижнего края */}
      <LinearGradient
        colors={['transparent', onboarding.glowTeal]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ ...StyleSheet.absoluteFillObject, top: screenH * 0.62 }}
        pointerEvents="none"
      />
      {/* Сетка */}
      <GridOverlay
        opacity={onboarding.gridOverlayOpacity}
        color={colors.textPrimary}
        width={screenW}
        height={screenH}
      />

      {/* Контент: блок смещён вверх — примерно на 38% высоты */}
      <View style={{ flex: 1 }}>
        <View style={{ flex: 38 }} />
        <View style={{ alignItems: 'center', paddingHorizontal: 32 }}>
          {/* Лого: подложка-свечение (Android) + shadow (iOS) */}
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                position: 'absolute',
                width: 164, height: 164, borderRadius: 82,
                backgroundColor: onboarding.glowAccent,
                opacity: 0.55,
              }}
              pointerEvents="none"
            />
            <View style={{
              shadowColor:   colors.accent,
              shadowOffset:  { width: 0, height: 0 },
              shadowOpacity: 0.5,
              shadowRadius:  30,
              elevation:     10,
            }}>
              <Image
                source={require('../assets/icon-rounded.png')}
                style={{ width: 108, height: 108, borderRadius: 24 }}
                resizeMode="cover"
              />
            </View>
          </View>

          {/* Название */}
          <Text style={[g.appName, { color: colors.textPrimary }]}>
            MyCarLedger
          </Text>

          {/* Акцентная линия */}
          <View style={[g.accentLine, { backgroundColor: colors.accent }]} />

          {/* Слоган */}
          <Text style={[g.slogan, { color: colors.textSecondary, marginTop: 18 }]}>
            {t('onboarding.welcome_slogan_line1')}
          </Text>
          <Text style={[g.slogan, { color: colors.textSecondary }]}>
            {t('onboarding.welcome_slogan_line2')}
          </Text>
        </View>
        <View style={{ flex: 62 }} />
      </View>

      {/* Нижний блок: пагинация + кнопка */}
      <View style={[g.bottomBar, { paddingBottom: Math.max(bottomInset, 0) + 28 }]}>
        <Pagination current={currentPage} th={th} />
        <TouchableOpacity
          style={[g.startBtn, { backgroundColor: onboarding.startBtnBg }]}
          onPress={onNext}
          activeOpacity={0.85}
        >
          <Text style={[g.startBtnText, { color: colors.accent }]} numberOfLines={1}>
            {t('onboarding.start')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Slide 2 — Данные машины ─────────────────────────────────────────────────

function SlideCar({
  screenW,
  screenH,
  th,
  currentPage,
  bottomInset,
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
  bottomInset:number;
  carName:    string;
  setCarName: (v: string) => void;
  odometer:   string;
  setOdometer:(v: string) => void;
  odoValid:   boolean;
  onNext:     () => void;
}) {
  const { t } = useTranslation();
  const { colors, onboarding } = th;

  const [odoFocused, setOdoFocused] = useState(false);

  return (
    <View style={{ width: screenW, height: screenH, overflow: 'hidden' }}>
      {/* Фон */}
      <View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.background }]}
        pointerEvents="none"
      />
      {/* Голубое свечение сверху */}
      <LinearGradient
        colors={[onboarding.glowAccent, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ ...StyleSheet.absoluteFillObject, bottom: screenH * 0.55 }}
        pointerEvents="none"
      />
      <GridOverlay
        opacity={onboarding.gridOverlayOpacityInner}
        color={colors.textPrimary}
        width={screenW}
        height={screenH}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Контент прижат к верху */}
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64 }}
        >
          {/* Надзаголовок */}
          <Text style={[g.stepLabel, { color: colors.accent }]}>
            {t('onboarding.step_of')}
          </Text>

          {/* Заголовок */}
          <Text style={[g.slideTitle, { color: colors.textPrimary }]}>
            {t('onboarding.car_title')}
          </Text>
          <Text style={[g.slideSubtitle, { color: colors.textSecondary }]}>
            {t('onboarding.car_subtitle')}
          </Text>

          <View style={{ height: 24 }} />

          {/* Поле: Название машины */}
          <Text style={[g.fieldLabel, { color: colors.textMuted }]}>
            {t('onboarding.name_label')}
          </Text>
          <View style={[
            g.fieldWrap,
            {
              backgroundColor: colors.surface,
              borderColor:     colors.border,
            },
          ]}>
            <Ionicons name="car-outline" size={18} color={colors.textSecondary} style={{ marginRight: 12 }} />
            <TextInput
              value={carName}
              onChangeText={setCarName}
              placeholder={t('onboarding.name_placeholder')}
              placeholderTextColor={colors.textWeak}
              style={[g.fieldInput, { color: colors.textPrimary }]}
              selectionColor={colors.accent}
              returnKeyType="next"
              maxLength={40}
            />
          </View>

          <View style={{ height: 16 }} />

          {/* Поле: Пробег */}
          <Text style={[g.fieldLabel, { color: colors.textMuted }]}>
            {t('onboarding.odometer_label')}
          </Text>
          <View style={[
            g.fieldWrap,
            {
              backgroundColor: colors.surface,
              borderColor:     odoFocused ? colors.borderAccent : colors.border,
              // Мягкое свечение вокруг поля при фокусе
              shadowColor:    odoFocused ? colors.accent : 'transparent',
              shadowOffset:   { width: 0, height: 0 },
              shadowOpacity:  odoFocused ? 0.45 : 0,
              shadowRadius:   odoFocused ? 8 : 0,
              elevation:      odoFocused ? 4 : 0,
            },
          ]}>
            <Ionicons
              name="speedometer-outline"
              size={18}
              color={odoFocused ? colors.accent : colors.textSecondary}
              style={{ marginRight: 12 }}
            />
            <TextInput
              value={odometer}
              onChangeText={setOdometer}
              placeholder="0"
              placeholderTextColor={colors.textWeak}
              keyboardType="numeric"
              style={[g.fieldInput, { color: colors.textPrimary }]}
              selectionColor={colors.accent}
              onFocus={() => setOdoFocused(true)}
              onBlur={() => setOdoFocused(false)}
              returnKeyType="done"
            />
          </View>
        </ScrollView>

        {/* Нижний блок: пагинация + кнопка, прижаты к низу */}
        <View style={[g.bottomBar, { paddingBottom: Math.max(bottomInset, 0) + 28 }]}>
          <Pagination current={currentPage} th={th} />
          <GradientButton
            label={t('onboarding.next')}
            onPress={onNext}
            disabled={!odoValid}
            th={th}
          />
        </View>
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
  bottomInset,
  odoValid,
  onFinish,
}: {
  screenW:     number;
  screenH:     number;
  th:          AppTheme;
  currentPage: number;
  bottomInset: number;
  odoValid:    boolean;
  onFinish:    () => void;
}) {
  const { t } = useTranslation();
  const { colors, onboarding, radius } = th;

  const tips: Array<{
    icon: React.ComponentProps<typeof Ionicons>['name'];
    key:  'tip_add' | 'tip_service' | 'tip_backup';
  }> = [
    { icon: 'add',                    key: 'tip_add'     },
    { icon: 'construct-outline',      key: 'tip_service' },
    { icon: 'cloud-download-outline', key: 'tip_backup'  },
  ];

  return (
    <View style={{ width: screenW, height: screenH, overflow: 'hidden' }}>
      {/* Фон */}
      <View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.background }]}
        pointerEvents="none"
      />
      {/* Зелёное свечение сверху */}
      <LinearGradient
        colors={[onboarding.glowSuccess, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ ...StyleSheet.absoluteFillObject, bottom: screenH * 0.55 }}
        pointerEvents="none"
      />
      <GridOverlay
        opacity={onboarding.gridOverlayOpacityInner}
        color={colors.textPrimary}
        width={screenW}
        height={screenH}
      />

      {/* Контент */}
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
        {/* Галочка */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{
            width: 58, height: 58, borderRadius: 29,
            backgroundColor: onboarding.glowSuccess,
            borderWidth: 2,
            borderColor: colors.statusOk.bar,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <Ionicons name="checkmark" size={30} color={colors.statusOk.bar} />
          </View>
        </View>

        {/* Заголовок */}
        <Text style={[g.slideTitle, { color: colors.textPrimary, textAlign: 'center' }]}>
          {t('onboarding.done_title')}
        </Text>
        <Text style={[g.slideSubtitle, { color: colors.textSecondary, textAlign: 'center', marginBottom: 32 }]}>
          {t('onboarding.done_subtitle')}
        </Text>

        {/* Карточки-подсказки */}
        {tips.map(({ icon, key }) => (
          <View
            key={key}
            style={[
              g.tipCard,
              {
                backgroundColor: colors.surface,
                borderRadius:    radius.card,
                borderColor:     colors.border,
              },
            ]}
          >
            <View style={[
              g.tipIconBox,
              { backgroundColor: onboarding.glowAccent, borderRadius: 9 },
            ]}>
              <Ionicons name={icon} size={16} color={colors.accent} />
            </View>
            <Text style={[g.tipText, { color: colors.textSecondary }]} numberOfLines={2}>
              {t(`onboarding.${key}`)}
            </Text>
          </View>
        ))}
      </View>

      {/* Нижний блок */}
      <View style={[g.bottomBar, { paddingBottom: Math.max(bottomInset, 0) + 28 }]}>
        <Pagination current={currentPage} th={th} />
        <GradientButton
          label={t('onboarding.go')}
          onPress={onFinish}
          disabled={!odoValid}
          th={th}
        />
      </View>
    </View>
  );
}

// ─── Главный экран ────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { th, isDark } = useThemeCtx();
  const { t }  = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { completeOnboarding } = useBootstrap();

  const [currentPage, setCurrentPage] = useState(0);
  const [carName,     setCarName]     = useState('');
  const [odometer,    setOdometer]    = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const pageRef   = useRef(0);
  pageRef.current = currentPage;

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

  const odoValid = odometer.trim().length > 0 && /^\d+$/.test(odometer.trim());

  async function handleFinish() {
    const name = carName.trim() || (t('onboarding.name_placeholder') as string);
    const odo  = parseInt(odometer.trim(), 10);
    await carRepo.updateCar({ name, current_odometer: isNaN(odo) ? 0 : odo });
    await settingsRepo.updateSettings({ onboarding_completed: 1 });
    completeOnboarding();
    router.replace('/(tabs)');
  }

  const commonSlideProps = {
    screenW, screenH, th, bottomInset: insets.bottom,
  };

  return (
    <View style={{ flex: 1, backgroundColor: th.colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / screenW);
          setCurrentPage(idx);
        }}
        directionalLockEnabled
      >
        <SlideWelcome
          {...commonSlideProps}
          currentPage={currentPage}
          onNext={() => goTo(1)}
        />
        <SlideCar
          {...commonSlideProps}
          currentPage={currentPage}
          carName={carName}
          setCarName={setCarName}
          odometer={odometer}
          setOdometer={setOdometer}
          odoValid={odoValid}
          onNext={() => goTo(2)}
        />
        <SlideDone
          {...commonSlideProps}
          currentPage={currentPage}
          odoValid={odoValid}
          onFinish={handleFinish}
        />
      </ScrollView>
    </View>
  );
}

// ─── Общие стили ─────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  // Welcome
  appName: {
    fontSize: 26,
    fontWeight: '500',
    marginTop: 22,
    letterSpacing: 0.3,
  },
  accentLine: {
    width: 40, height: 2, borderRadius: 1, marginTop: 14,
  },
  slogan: {
    fontSize: 15, lineHeight: 22, textAlign: 'center',
  },
  startBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: {
    fontSize: 16, fontWeight: '600',
  },

  // Slides 2 & 3
  stepLabel: {
    fontSize: 10, fontWeight: '500', letterSpacing: 1.2,
    marginBottom: 10, textTransform: 'uppercase',
  },
  slideTitle: {
    fontSize: 19, fontWeight: '500', marginBottom: 8,
  },
  slideSubtitle: {
    fontSize: 14, lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 13, fontWeight: '400', marginBottom: 8,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 13,
    paddingHorizontal: 14,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    gap: 14,
  },
  tipIconBox: {
    width: 28, height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  tipText: {
    flex: 1, fontSize: 14, lineHeight: 20,
  },

  // Shared
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  gradBtnTouch: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradBtnInner: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradBtnText: {
    fontSize: 16, fontWeight: '600',
  },
});
