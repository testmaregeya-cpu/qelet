import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';

interface PaydayWindowBarProps {
  todayDate: string;
}

/**
 * Displays where today falls inside the monthly shop credit settlement cycle
 * (Days 1-23 open tab, 24-26 settlement window, 27+ next-month cycle).
 */
export function PaydayWindowBar({ todayDate }: PaydayWindowBarProps) {
  const { palette } = useTheme();
  const [yearStr, monthStr, dayStr] = todayDate.split('-');
  const year = Number.parseInt(yearStr ?? '', 10);
  const month = Number.parseInt(monthStr ?? '', 10);
  const day = Number.parseInt(dayStr ?? '', 10) || 1;
  const daysInMonth =
    Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 30;
  const clampedDay = Math.min(daysInMonth, Math.max(1, day));
  const progressPct = Math.round((clampedDay / daysInMonth) * 100);
  const zoneLeftPct = ((23 / daysInMonth) * 100).toFixed(1);
  const zoneWidthPct = ((3 / daysInMonth) * 100).toFixed(1);

  let phaseLabel = 'Open cycle';
  let accentColor = palette.textSecondary;
  let detailText = `${24 - clampedDay}d until settlement window`;

  if (clampedDay >= 21 && clampedDay <= 23) {
    phaseLabel = 'Due soon';
    accentColor = palette.amber;
    detailText = `Settle window opens in ${24 - clampedDay}d`;
  } else if (clampedDay >= 24 && clampedDay <= 26) {
    phaseLabel = 'Payday window';
    accentColor = palette.primary;
    detailText = 'Settle bills by the 26th';
  } else if (clampedDay >= 27) {
    phaseLabel = 'Post-26th cycle';
    accentColor = palette.orange;
    detailText = 'New charges count toward next month';
  }

  return (
    <View style={[styles.wrap, { borderTopColor: palette.border }]}>
      <View style={styles.topRow}>
        <View style={styles.leftLabel}>
          <View style={[styles.dot, { backgroundColor: accentColor }]} />
          <Text style={[styles.phaseText, { color: palette.textPrimary }]}>{phaseLabel}</Text>
          <Text style={[styles.dotSep, { color: palette.textMuted }]}>/</Text>
          <Text style={[styles.detailText, { color: palette.textSecondary }]}>{detailText}</Text>
        </View>
        <Text style={[styles.dayBadge, { color: palette.textMuted }]}>Day {clampedDay}</Text>
      </View>

      <View style={[styles.track, { backgroundColor: palette.surfaceMuted }]}>
        <View
          style={[
            styles.windowZone,
            {
              left: `${zoneLeftPct}%`,
              width: `${zoneWidthPct}%`,
              backgroundColor: palette.primaryLight,
              borderColor: palette.primary,
            },
          ]}
        />
        <View
          style={[
            styles.fill,
            {
              width: `${Math.max(4, progressPct)}%`,
              backgroundColor:
                clampedDay >= 24 && clampedDay <= 26
                  ? palette.primary
                  : palette.textSecondary,
            },
          ]}
        />
      </View>

      <View style={styles.ticksRow}>
        <Text style={[styles.tick, { color: palette.textMuted }]}>1</Text>
        <Text style={[styles.tick, { color: palette.primary }]}>24–26 payday</Text>
        <Text style={[styles.tick, { color: palette.textMuted }]}>{daysInMonth}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    paddingTop: Space.s12,
    gap: Space.s8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.s8,
  },
  leftLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Space.s4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Space.s4,
  },
  phaseText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  dotSep: {
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  detailText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  dayBadge: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 6,
    borderRadius: Radius.tag,
    overflow: 'hidden',
    position: 'relative',
  },
  windowZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  fill: {
    height: '100%',
    borderRadius: Radius.tag,
  },
  ticksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tick: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
});
