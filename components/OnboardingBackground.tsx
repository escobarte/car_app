import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppTheme } from '@/constants/theme';

/**
 * Общий фон экранов онбординга. Собирается из четырёх слоёв:
 *
 *   1. База            — почти чёрный (onboarding.bgBase)
 *   2. Перспективная сетка + затухание к центру экрана
 *   3. Радиальное свечение сверху-центр (голубое / зелёное)
 *   4. Виньетка по краям
 *
 * Свечение лежит ПОВЕРХ сетки, а не под ней: слой затухания сетки
 * работает базовым цветом и погасил бы свечение, если бы шёл после него.
 * При альфе свечения ~0.2 линии сетки сквозь него всё равно читаются.
 *
 * Без нативных зависимостей: react-native-svg не требуется.
 * Радиальный градиент собран из концентрических кругов, перспектива —
 * поворотом линий вокруг точки схода.
 *
 * Все цвета и размеры — из темы, в компоненте нет ни одного литерала цвета.
 */

type Accent = 'blue' | 'green';

type Props = {
  th:     AppTheme;
  accent: Accent;
  width:  number;
  height: number;
};

// ─── Радиальное свечение ─────────────────────────────────────────────────────
// RN не умеет радиальные градиенты без SVG. Набор вложенных кругов с малой
// альфой даёт плавное затухание от центра: суммарная непрозрачность в центре
// ≈ opacity, к краю стремится к нулю.

const RINGS = 10;

const RadialGlow = memo(function RadialGlow({
  color,
  size,
  opacity,
}: {
  color:   string;
  size:    number;
  opacity: number;
}) {
  return (
    <>
      {Array.from({ length: RINGS }, (_, i) => {
        const d = size * (1 - i / RINGS);
        return (
          <View
            key={i}
            style={{
              position:        'absolute',
              left:            (size - d) / 2,
              top:             (size - d) / 2,
              width:           d,
              height:          d,
              borderRadius:    d / 2,
              backgroundColor: color,
              opacity:         opacity / RINGS,
            }}
          />
        );
      })}
    </>
  );
});

// ─── Перспективная сетка ─────────────────────────────────────────────────────
// Одноточечная перспектива: точка схода в верхней трети экрана.
//  - лучи расходятся от точки схода веером вниз (поворот вокруг её верха);
//  - поперечные линии сгущаются у горизонта (шаг растёт по степенному закону).

const RAYS = 15;      // лучей в веере
const ROWS = 12;      // поперечных линий
const RAY_SPAN = 2.6; // ширина веера у нижней кромки, в ширинах экрана
const ROW_POW = 2.1;  // степень сгущения линий у горизонта

const PerspectiveGrid = memo(function PerspectiveGrid({
  color,
  width,
  height,
}: {
  color:  string;
  width:  number;
  height: number;
}) {
  const vpX = width / 2;
  const vpY = height * 0.16;      // точка схода
  const depth = height - vpY;     // расстояние от горизонта до нижней кромки
  const rayLen = height * 1.5;    // с запасом, чтобы луч уходил за экран

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Лучи в точку схода.
          Угол считается не равными шагами (это дало бы звезду, а не дорогу),
          а из равномерного шага по нижней кромке: у горизонта лучи сходятся,
          внизу расходятся — классическая одноточечная перспектива. */}
      {Array.from({ length: RAYS }, (_, i) => {
        const xBottom = width * RAY_SPAN * (i / (RAYS - 1) - 0.5);
        const angle   = (Math.atan2(xBottom, depth) * 180) / Math.PI;
        return (
          <View
            key={`r${i}`}
            style={{
              position:        'absolute',
              left:            vpX,
              top:             vpY,
              width:           1,   // не hairline: повёрнутые субпиксельные линии пропадают на Android
              height:          rayLen,
              backgroundColor: color,
              transformOrigin: '50% 0%',
              transform:       [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })}

      {/* Поперечные линии */}
      {Array.from({ length: ROWS }, (_, i) => {
        const k = (i + 1) / ROWS;
        const y = vpY + depth * Math.pow(k, ROW_POW);
        return (
          <View
            key={`h${i}`}
            style={{
              position:        'absolute',
              left:            0,
              right:           0,
              top:             y,
              height:          StyleSheet.hairlineWidth,
              backgroundColor: color,
            }}
          />
        );
      })}
    </View>
  );
});

// ─── Фон целиком ─────────────────────────────────────────────────────────────

const OnboardingBackground = memo(function OnboardingBackground({
  th,
  accent,
  width,
  height,
}: Props) {
  const { onboarding: onb } = th;

  const glowColor = accent === 'green' ? onb.glowGreen : onb.glowBlue;
  const gridColor = accent === 'green' ? onb.gridGreen : onb.gridBlue;

  const glowSize = width * onb.glowSize;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* 1 — база */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: onb.bgBase }]} />

      {/* 2 — сетка */}
      <PerspectiveGrid color={gridColor} width={width} height={height} />

      {/* 2b — затухание сетки к центру: там лежит контент, он должен читаться */}
      <LinearGradient
        colors={[onb.bgFadeClear, onb.bgFadeMid, onb.bgFadeStrong, onb.bgFadeMid, onb.bgFadeClear]}
        locations={[0, 0.28, 0.5, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* 3 — радиальное свечение сверху-центр, частично за верхней кромкой */}
      <View
        style={{
          position: 'absolute',
          left:     (width - glowSize) / 2,
          top:      -glowSize * 0.42,
          width:    glowSize,
          height:   glowSize,
        }}
      >
        <RadialGlow color={glowColor} size={glowSize} opacity={onb.glowOpacity} />
      </View>

      {/* 4 — виньетка по краям */}
      <LinearGradient
        colors={[onb.bgFadeMid, onb.bgFadeClear]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.14 }}
      />
      <LinearGradient
        colors={[onb.bgFadeClear, onb.bgFadeStrong]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.30 }}
      />
      <LinearGradient
        colors={[onb.bgFadeMid, onb.bgFadeClear]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: width * 0.16 }}
      />
      <LinearGradient
        colors={[onb.bgFadeClear, onb.bgFadeMid]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: width * 0.16 }}
      />
    </View>
  );
});

export default OnboardingBackground;
