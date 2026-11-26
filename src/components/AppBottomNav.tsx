import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { triggerHaptic } from '../lib/haptics';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Hairline, Radius, Space } from '../theme/tokens';

export type NavTab = 'home' | 'insights' | 'admin' | 'settings';

interface AppBottomNavProps {
  active: NavTab;
  isSuperAdmin: boolean;
}

export function AppBottomNav({ active, isSuperAdmin }: AppBottomNavProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

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
        {
          backgroundColor: palette.navSurface,
          borderTopColor: palette.border,
          paddingBottom: Math.max(insets.bottom, Space.s8),
        },
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
              selected && { backgroundColor: palette.tabActiveBg },
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
            <Feather name={tab.icon} size={20} color={color} />
            <Text
              style={[
                styles.label,
                {
                  color: selected ? palette.primary : palette.textMuted,
                  fontFamily: selected ? Fonts.sansSemi : Fonts.sans,
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
    borderTopWidth: Hairline,
    paddingTop: Space.s8,
    paddingHorizontal: Space.s12,
    gap: Space.s6,
  },
  item: {
    flex: 1,
    minHeight: 46,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: Space.s4,
    paddingHorizontal: Space.s8,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
});
