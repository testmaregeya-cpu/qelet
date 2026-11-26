import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Space } from '../theme/tokens';

interface LedgerHeaderProps {
  title: string;
  backLabel?: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}

export function LedgerHeader({
  title,
  backLabel,
  onBack,
  rightSlot,
}: LedgerHeaderProps) {
  const { palette } = useTheme();

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: palette.surface, borderBottomColor: palette.border },
      ]}
    >
      <Pressable
        style={styles.backBtn}
        hitSlop={8}
        onPress={onBack ?? (() => router.back())}
        accessibilityRole="button"
        accessibilityLabel={backLabel ?? 'Back'}
      >
        <Feather name="arrow-left" size={18} color={palette.textPrimary} />
        {backLabel ? (
          <Text style={[styles.backText, { color: palette.textSecondary }]}>
            {backLabel}
          </Text>
        ) : null}
      </Pressable>

      <Text style={[styles.title, { color: palette.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>

      <View style={styles.rightSlot}>{rightSlot}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.s16,
    borderBottomWidth: 1,
    gap: Space.s12,
  },
  backBtn: {
    minWidth: 56,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
  },
  backText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.sansMedium,
    fontSize: 16,
    lineHeight: 20,
  },
  rightSlot: {
    minWidth: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
