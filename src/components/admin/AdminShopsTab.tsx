import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { Fonts, Radius, Space } from '../../theme/tokens';
import type { Shop } from '../../types/phase1';

interface AdminShopsTabProps {
  shops: readonly Shop[];
  onManageShop: (shop: Shop) => void;
}

export function AdminShopsTab({ shops, onManageShop }: AdminShopsTabProps) {
  const { palette } = useTheme();

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.headerBetween}>
        <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>All shops</Text>
        <Text style={[styles.metaMono, { color: palette.textMuted }]}>{shops.length}</Text>
      </View>
      <View
        style={[
          styles.card,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        {shops.map((shop, idx) => (
          <View
            key={shop.id}
            style={[
              styles.listRow,
              idx < shops.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: palette.border,
              },
            ]}
          >
            <View style={{ flex: 1, gap: Space.s4 }}>
              <Text style={[styles.rowTitle, { color: palette.textPrimary }]}>{shop.name}</Text>
              <Text style={[styles.metaMono, { color: palette.textMuted }]}>
                {shop.needs_review ? 'Needs review · ' : ''}
                {shop.merged_into_shop_id
                  ? 'Merged'
                  : shop.archived
                    ? 'Archived'
                    : 'Active'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Manage ${shop.name}`}
              onPress={() => onManageShop(shop)}
            >
              <Text style={[styles.actionLink, { color: palette.primary }]}>Manage</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionBlock: { gap: Space.s8 },
  headerBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Space.s16,
    gap: Space.s12,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.s8,
    gap: Space.s12,
  },
  rowTitle: { fontFamily: Fonts.sansMedium, fontSize: 15, lineHeight: 20 },
  metaMono: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  actionLink: { fontFamily: Fonts.sansMedium, fontSize: 13 },
});
