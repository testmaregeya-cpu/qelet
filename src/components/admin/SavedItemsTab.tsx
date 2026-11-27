import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatEtb } from '../../lib/money';
import { useTheme } from '../../theme/ThemeContext';
import { Fonts, Radius, Space } from '../../theme/tokens';
import type { CatalogItem, Category } from '../../types/phase4to6';

interface SavedItemsTabProps {
  categories: readonly Category[];
  catalogItems: readonly CatalogItem[];
  busy: boolean;
  newCategoryName: string;
  onChangeNewCategoryName: (text: string) => void;
  onCreateCategory: () => void;
  onToggleCategoryArchived: (categoryId: string, nextArchived: boolean) => void;
  newItemName: string;
  onChangeNewItemName: (text: string) => void;
  newItemUnit: string;
  onChangeNewItemUnit: (text: string) => void;
  newItemPriceEtb: string;
  onChangeNewItemPriceEtb: (text: string) => void;
  newItemCategoryId: string | null;
  onSelectCategoryId: (id: string | null) => void;
  onCreateCatalogItem: () => void;
  onToggleCatalogItemArchived: (itemId: string, nextArchived: boolean) => void;
  onInputFocus?: (node?: unknown) => void;
}

export function SavedItemsTab({
  categories,
  catalogItems,
  busy,
  newCategoryName,
  onChangeNewCategoryName,
  onCreateCategory,
  onToggleCategoryArchived,
  newItemName,
  onChangeNewItemName,
  newItemUnit,
  onChangeNewItemUnit,
  newItemPriceEtb,
  onChangeNewItemPriceEtb,
  newItemCategoryId,
  onSelectCategoryId,
  onCreateCatalogItem,
  onToggleCatalogItemArchived,
  onInputFocus,
}: SavedItemsTabProps) {
  const { palette } = useTheme();
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <>
      <View
        style={[
          styles.helperBanner,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.mutedBody, { color: palette.textSecondary }]}>
          Optional quick-add shortcuts for household items you often buy on credit (not store inventory).
        </Text>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
          Item groups (optional)
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <View style={styles.row}>
            <TextInput
              style={[
                styles.input,
                {
                  flex: 1,
                  borderColor: palette.borderStrong,
                  color: palette.textPrimary,
                  backgroundColor: palette.background,
                },
              ]}
              value={newCategoryName}
              onFocus={(e) => onInputFocus?.(e.currentTarget)}
              onChangeText={onChangeNewCategoryName}
              accessibilityLabel="New item group name"
              placeholder="Groceries, bakery, dairy"
              placeholderTextColor={palette.textMuted}
            />
            <Pressable
              style={[styles.primarySmallBtn, { backgroundColor: palette.primaryButtonBg }]}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Add item group"
              onPress={onCreateCategory}
            >
              <Text style={[styles.primarySmallText, { color: palette.primaryButtonText }]}>
                Add
              </Text>
            </Pressable>
          </View>

          {categories.length > 0 ? (
            <View style={styles.chipWrap}>
              {categories.map((cat) => (
                <Pressable
                  key={cat.id}
                  style={[
                    styles.chip,
                    {
                      borderColor: cat.archived ? palette.border : palette.primary,
                      backgroundColor: cat.archived ? palette.surfaceMuted : palette.primaryLight,
                    },
                  ]}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`${cat.name}, ${cat.archived ? 'archived, tap to restore' : 'active, tap to archive'}`}
                  onPress={() => onToggleCategoryArchived(cat.id, !cat.archived)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: cat.archived ? palette.textMuted : palette.primary },
                    ]}
                  >
                    {cat.name}
                    {cat.archived ? ' (archived)' : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
          Add quick-add item (optional)
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                borderColor: palette.borderStrong,
                color: palette.textPrimary,
                backgroundColor: palette.background,
              },
            ]}
            value={newItemName}
            onFocus={(e) => onInputFocus?.(e.currentTarget)}
            onChangeText={onChangeNewItemName}
            accessibilityLabel="Quick-add item name"
            placeholder="Item name (e.g. Milk, Sugar, Bread)"
            placeholderTextColor={palette.textMuted}
          />
          <View style={styles.row}>
            <TextInput
              style={[
                styles.input,
                {
                  flex: 1,
                  borderColor: palette.borderStrong,
                  color: palette.textPrimary,
                  backgroundColor: palette.background,
                },
              ]}
              value={newItemUnit}
              onFocus={(e) => onInputFocus?.(e.currentTarget)}
              onChangeText={onChangeNewItemUnit}
              accessibilityLabel="Default unit"
              placeholder="Unit (pcs/kg/L)"
              placeholderTextColor={palette.textMuted}
            />
            <TextInput
              style={[
                styles.input,
                styles.monoInput,
                {
                  flex: 1,
                  borderColor: palette.borderStrong,
                  color: palette.textPrimary,
                  backgroundColor: palette.background,
                },
              ]}
              value={newItemPriceEtb}
              onFocus={(e) => onInputFocus?.(e.currentTarget)}
              onChangeText={onChangeNewItemPriceEtb}
              accessibilityLabel="Usual price in ETB"
              keyboardType="decimal-pad"
              placeholder="Usual ETB"
              placeholderTextColor={palette.textMuted}
            />
          </View>

          {categories.some((c) => !c.archived) ? (
            <View style={styles.chipWrap}>
              {categories
                .filter((c) => !c.archived)
                .map((cat) => {
                  const active = newItemCategoryId === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      style={[
                        styles.chip,
                        {
                          borderColor: active ? palette.primary : palette.borderStrong,
                          backgroundColor: active ? palette.primaryLight : palette.background,
                        },
                      ]}
                      onPress={() => onSelectCategoryId(active ? null : cat.id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: active ? palette.primary : palette.textPrimary },
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                })}
            </View>
          ) : null}

          <Pressable
            style={[styles.primaryBtn, { backgroundColor: palette.primaryButtonBg }]}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Save quick-add item"
            onPress={onCreateCatalogItem}
          >
            <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
              Save quick-add item
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.headerBetween}>
          <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
            Saved quick-add templates
          </Text>
          <Text style={[styles.metaMono, { color: palette.textMuted }]}>{catalogItems.length}</Text>
        </View>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          {catalogItems.length === 0 ? (
            <Text style={[styles.mutedBody, { color: palette.textMuted }]}>
              No quick-add templates yet. You can still type any item freely when adding a charge.
            </Text>
          ) : (
            catalogItems.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.listRow,
                  idx < catalogItems.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: palette.border,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: Space.s4 }}>
                  <Text style={[styles.rowTitle, { color: palette.textPrimary }]}>
                    {item.name}
                    {item.archived ? ' (archived)' : ''}
                  </Text>
                  <Text style={[styles.metaMono, { color: palette.textMuted }]}>
                    {item.default_unit} · {formatEtb(item.default_price_santim)}
                    {item.category_id && categoryMap.get(item.category_id)
                      ? ` · ${categoryMap.get(item.category_id)}`
                      : ''}
                  </Text>
                </View>
                <Pressable
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.archived ? 'Restore' : 'Archive'} ${item.name}`}
                  onPress={() => onToggleCatalogItemArchived(item.id, !item.archived)}
                >
                  <Text style={[styles.actionLink, { color: palette.primary }]}>
                    {item.archived ? 'Restore' : 'Archive'}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  helperBanner: {
    borderWidth: 1,
    borderRadius: Radius.innerCard,
    padding: Space.s12,
  },
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
  row: { flexDirection: 'row', gap: Space.s8, alignItems: 'center' },
  rowTitle: { fontFamily: Fonts.sansMedium, fontSize: 15, lineHeight: 20 },
  metaMono: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  actionLink: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  mutedBody: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 20 },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  monoInput: {
    fontFamily: Fonts.mono,
    fontVariant: ['tabular-nums'],
  },
  primarySmallBtn: {
    height: 44,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySmallText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  primaryBtn: {
    height: 44,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s8 },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s8,
  },
  chipText: { fontFamily: Fonts.sansMedium, fontSize: 12, lineHeight: 16 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.s8,
    gap: Space.s12,
  },
});
