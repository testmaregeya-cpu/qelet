import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { triggerHaptic } from '../lib/haptics';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';

export type NavTab = 'home' | 'insights' | 'admin' | 'settings';

interface AppBottomNavProps {
  active: NavTab;
  isSuperAdmin: boolean;
}

export function AppBottomNav({ active, isSuperAdmin }: AppBottomNavProps) {
  const { palette } = useTheme();

  const tabs: {
    key: NavTab;
    label: string;
    href: '/shops' | '/insights' | '/admin' | '/settings';
    icon: keyof typeof Feather.glyphMap;
  }[] = [
    { key: 'home', label: 'Ledger', href: '/shops', icon: 'book-open' },
    { key: 'insights', label: 'Insights', href: '/insights', icon: 'bar-chart-2' },
    ...(isSuperAdmin
      ? [
          {
            key: 'admin' as const,
            label: 'Admin',
            href: '/admin' as const,
            icon: 'shield' as const,
          },
        ]
      : []),
    { key: 'settings', label: 'Settings', href: '/settings', icon: 'sliders' },
  ];

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: palette.navSurface, borderTopColor: palette.border },
      ]}
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        const color = selected ? palette.primary : palette.textMuted;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [
              styles.item,
              selected && { backgroundColor: palette.surfaceMuted },
              pressed && { opacity: 0.75 },
            ]}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) {
                triggerHaptic('selection');
                router.replace(tab.href);
              }
            }}
          >
            <Feather name={tab.icon} size={18} color={color} />
            <Text
              style={[
                styles.label,
                {
                  color: selected ? palette.textPrimary : palette.textMuted,
                  fontFamily: selected ? Fonts.sansMedium : Fonts.sans,
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: Space.s8,
    paddingHorizontal: Space.s12,
    gap: Space.s4,
  },
  item: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s4,
    paddingVertical: Space.s4,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
});
