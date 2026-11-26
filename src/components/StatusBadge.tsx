import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';
import type { ShopStatusBadge } from '../types/phase2';

const LABEL_BY_STATUS: Record<ShopStatusBadge, string> = {
  PAID: 'Paid',
  OPEN: 'Open',
  'DUE SOON': 'Due soon',
  'DUE NOW': 'Pay now',
  OVERDUE: 'Overdue',
};

export function StatusBadge({ status }: { status: ShopStatusBadge }) {
  const { palette } = useTheme();

  const colors = (() => {
    switch (status) {
      case 'PAID':
        return { bg: palette.primaryLight, text: palette.primary };
      case 'OPEN':
        return { bg: palette.openBg, text: palette.openText };
      case 'DUE SOON':
        return { bg: palette.amberLight, text: palette.amber };
      case 'DUE NOW':
        return { bg: palette.orangeLight, text: palette.orange };
      case 'OVERDUE':
        return { bg: palette.dangerLight, text: palette.danger };
    }
  })();

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <View style={[styles.dot, { backgroundColor: colors.text }]} />
      <Text style={[styles.text, { color: colors.text }]}>{LABEL_BY_STATUS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
    borderRadius: Radius.tag,
    paddingHorizontal: Space.s8,
    paddingVertical: Space.s4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  text: {
    fontFamily: Fonts.monoMedium,
    fontSize: 11,
    lineHeight: 14,
  },
});
