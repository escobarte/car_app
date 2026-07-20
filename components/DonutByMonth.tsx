/**
 * Круговая диаграмма (donut) «Доля трат по месяцам» — только View + StyleSheet,
 * без внешних chart-библиотек и без react-native-svg.
 *
 * Сектор строится пересечением двух полуплоскостей (вложенные rotate + overflow
 * hidden), поэтому корректно рисуется при любом угле (в т.ч. > 180°) и без
 * «шва» на стыке. Цвет сегментов — один голубой из темы (colors.accent) с
 * градацией прозрачности (светлее = меньшая доля). Всё поверх surface-карточки.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

const SIZE = 132;          // диаметр диаграммы
const HOLE = 0.56;         // диаметр отверстия (доля от SIZE)

// ─── Утилиты ──────────────────────────────────────────────────────────────

/** hex → rgba(); цвет берётся из темы, добавляется только альфа. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Округляет проценты до целых так, чтобы сумма была ровно 100 (метод наибольшего остатка). */
function roundTo100(vals: number[]): number[] {
  const floor = vals.map(v => Math.floor(v));
  const rem   = 100 - floor.reduce((s, v) => s + v, 0);
  const order = vals
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const res = [...floor];
  for (let k = 0; k < rem && k < order.length; k++) res[order[k].i]++;
  return res;
}

// ─── Геометрия: полуплоскость и сектор ──────────────────────────────────────

/**
 * Оставляет только точки на «+x» стороне линии через центр под углом `angle`.
 * Реализация: поворот на angle → клип правой половины (overflow hidden) →
 * контрповорот, чтобы вложенные слои жили в экранных осях (клипы композируются
 * в пересечение).
 */
function HalfPlane({ size, angle, children }: {
  size: number; angle: number; children: React.ReactNode;
}) {
  const half = size / 2;
  return (
    <View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: `${angle}deg` }] }}>
      <View style={{ position: 'absolute', left: half, top: 0, width: half, height: size, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: -half, top: 0, width: size, height: size, transform: [{ rotate: `${-angle}deg` }] }}>
          {children}
        </View>
      </View>
    </View>
  );
}

/** Сектор [from, to] сплошного цвета (to − from ≤ 180), прозрачный снаружи. */
function Sector({ size, from, to, color }: {
  size: number; from: number; to: number; color: string;
}) {
  return (
    <HalfPlane size={size} angle={from + 90}>
      <HalfPlane size={size} angle={to - 90}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
      </HalfPlane>
    </HalfPlane>
  );
}

// ─── Пропсы ─────────────────────────────────────────────────────────────────

export type DonutDatum = { key: string; label: string; value: number };

// ─── Компонент ────────────────────────────────────────────────────────────────

export default function DonutByMonth({ data }: { data: DonutDatum[] }) {
  const { t } = useTranslation();
  const th = useAppTheme();
  const s = useMemo(() => makeStyles(th), [th]);
  const { colors } = th;

  const { sectors, legend, total } = useMemo(() => {
    const items = data.filter(d => d.value > 0).sort((a, b) => b.value - a.value);
    const sum   = items.reduce((acc, d) => acc + d.value, 0);
    if (sum <= 0) return { sectors: [] as React.ReactNode[], legend: [], total: 0 };

    const pct = roundTo100(items.map(d => (d.value / sum) * 100));
    const n = items.length;

    const legendRows = items.map((it, i) => ({
      key:   it.key,
      label: it.label,
      pct:   pct[i],
      // Градация светлоты: большая доля — насыщеннее, меньшая — светлее.
      color: hexToRgba(colors.accent, n <= 1 ? 1 : 1 - (i / (n - 1)) * 0.6),
    }));

    // Сектора рисуем по точным долям (не по округлённым процентам), от «12 часов».
    const secs: React.ReactNode[] = [];
    let cursor = -90;
    legendRows.forEach((row, idx) => {
      const deg = (items[idx].value / sum) * 360;
      let start = cursor;
      let left  = deg;
      while (left > 0.01) {
        const step = Math.min(left, 180);
        secs.push(
          <Sector key={`${row.key}-${start}`} size={SIZE} from={start} to={start + step} color={row.color} />,
        );
        start += step;
        left  -= step;
      }
      cursor += deg;
    });

    return { sectors: secs, legend: legendRows, total: sum };
  }, [data, colors.accent]);

  if (total <= 0) return null;

  return (
    <>
      <Text style={s.sectionHeader}>{t('stats.shareByMonth')}</Text>
      <View style={s.card}>
        <View style={s.donutBox}>
          {sectors}
          <View style={s.hole} />
        </View>

        <View style={s.legend}>
          {legend.map(row => (
            <View key={row.key} style={s.legendRow}>
              <View style={[s.swatch, { backgroundColor: row.color }]} />
              <Text style={s.legendLabel} numberOfLines={1}>{row.label}</Text>
              <Text style={s.legendPct}>{row.pct}%</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

// ─── Стили ──────────────────────────────────────────────────────────────────

function makeStyles(th: AppTheme) {
  const { colors, radius, typography } = th;
  return StyleSheet.create({
    sectionHeader: {
      color:         colors.textWeak,
      ...typography.sectionHeader,
      textTransform: 'uppercase',
      marginBottom:  8,
    },
    card: {
      flexDirection:   'row',
      alignItems:      'center',
      backgroundColor: colors.surface,
      borderRadius:    radius.card,
      padding:         16,
      marginBottom:    20,
    },
    donutBox: {
      width:  SIZE,
      height: SIZE,
    },
    hole: {
      position:        'absolute',
      left:            (SIZE * (1 - HOLE)) / 2,
      top:             (SIZE * (1 - HOLE)) / 2,
      width:           SIZE * HOLE,
      height:          SIZE * HOLE,
      borderRadius:    (SIZE * HOLE) / 2,
      backgroundColor: colors.surface,
    },
    legend: {
      flex:        1,
      marginLeft:  18,
      gap:         8,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems:    'center',
    },
    swatch: {
      width:        12,
      height:       12,
      borderRadius: 3,
      marginRight:  8,
    },
    legendLabel: {
      flex:  1,
      color: colors.textSecondary,
      ...typography.labelSmall,
    },
    legendPct: {
      color: colors.textPrimary,
      ...typography.cardTextMedium,
    },
  });
}
