import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  COMMON_UNITS,
  type EditableChargeLine,
  filterLineSuggestions,
} from '../lib/chargeForm';
import { triggerHaptic } from '../lib/haptics';
import { formatEtb, formatSantimForInput } from '../lib/money';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Hairline, Radius, Space } from '../theme/tokens';
import type { ItemSuggestion } from '../types/phase4to6';

interface ChargeLinesEditorProps {
  lines: readonly EditableChargeLine[];
  lineTotals: readonly (number | null)[];
  mergedSuggestions: readonly ItemSuggestion[];
  onUpdateLine: (key: string, patch: Partial<EditableChargeLine>) => void;
  onRemoveLine: (key: string) => void;
  onAddLine: () => void;
  onInputFocus?: (node?: unknown) => void;
}

export function ChargeLinesEditor({
  lines,
  lineTotals,
  mergedSuggestions,
  onUpdateLine,
  onRemoveLine,
  onAddLine,
  onInputFocus,
}: ChargeLinesEditorProps) {
  const { palette } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.label, { color: palette.textSecondary }]}>Items</Text>
      {lines.map((line, index) => {
        const lineTotal = lineTotals[index] ?? null;
        const suggestions = filterLineSuggestions(mergedSuggestions, line.itemName, 5);

        return (
          <View
            key={line.key}
            style={[
              styles.lineCard,
              {
                backgroundColor: palette.background,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.lineHeader}>
              <Text style={[styles.lineIndex, { color: palette.textMuted }]}>
                Item #{index + 1}
              </Text>
              {lines.length > 1 ? (
                <Pressable
                  style={styles.removeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove item ${index + 1}`}
                  onPress={() => {
                    triggerHaptic('selection');
                    onRemoveLine(line.key);
                  }}
                >
                  <Feather name="trash-2" size={13} color={palette.danger} />
                  <Text style={[styles.removeLineText, { color: palette.danger }]}>Remove</Text>
                </Pressable>
              ) : null}
            </View>

            <TextInput
              style={[
                styles.input,
                {
                  borderColor: palette.borderStrong,
                  color: palette.textPrimary,
                  backgroundColor: palette.surface,
                },
              ]}
              value={line.itemName}
              onFocus={(e) => onInputFocus?.(e.currentTarget)}
              onChangeText={(text) =>
                onUpdateLine(line.key, { itemName: text, catalogItemId: null })
              }
              accessibilityLabel={`Item ${index + 1} name`}
              placeholder="Bread, milk, cooking oil"
              placeholderTextColor={palette.textMuted}
              maxLength={80}
            />

            {suggestions.length > 0 ? (
              <View style={styles.suggestionRow}>
                {suggestions.map((sug) => (
                  <Pressable
                    key={sug.key}
                    style={[
                      styles.suggestionChip,
                      { backgroundColor: palette.primaryLight },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Use suggested item ${sug.item_name}`}
                    onPress={() => {
                      triggerHaptic('selection');
                      onUpdateLine(line.key, {
                        catalogItemId: sug.catalog_item_id,
                        itemName: sug.item_name,
                        unit: sug.unit,
                        unitPriceEtb:
                          sug.unit_price_santim > 0
                            ? formatSantimForInput(sug.unit_price_santim)
                            : line.unitPriceEtb,
                      });
                    }}
                  >
                    <Text style={[styles.suggestionText, { color: palette.primary }]}>
                      {sug.item_name}
                      {sug.unit_price_santim > 0
                        ? ` · ${formatEtb(sug.unit_price_santim)}`
                        : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.qtyPriceRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.subLabel, { color: palette.textSecondary }]}>Quantity</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.monoInput,
                    {
                      borderColor: palette.borderStrong,
                      color: palette.textPrimary,
                      backgroundColor: palette.surface,
                    },
                  ]}
                  value={line.quantity}
                  onFocus={(e) => onInputFocus?.(e.currentTarget)}
                  onChangeText={(text) => onUpdateLine(line.key, { quantity: text })}
                  accessibilityLabel={`Item ${index + 1} quantity`}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  placeholderTextColor={palette.textMuted}
                />
              </View>
              <View style={{ flex: 1.3 }}>
                <Text style={[styles.subLabel, { color: palette.textSecondary }]}>
                  Unit price (ETB)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.monoInput,
                    {
                      borderColor: palette.borderStrong,
                      color: palette.textPrimary,
                      backgroundColor: palette.surface,
                    },
                  ]}
                  value={line.unitPriceEtb}
                  onFocus={(e) => onInputFocus?.(e.currentTarget)}
                  onChangeText={(text) => onUpdateLine(line.key, { unitPriceEtb: text })}
                  accessibilityLabel={`Item ${index + 1} unit price in ETB`}
                  keyboardType="decimal-pad"
                  placeholder="50"
                  placeholderTextColor={palette.textMuted}
                />
              </View>
            </View>

            <View style={styles.unitRow}>
              {COMMON_UNITS.map((u) => {
                const activeUnit = line.unit === u;
                return (
                  <Pressable
                    key={u}
                    style={[
                      styles.unitChip,
                      {
                        borderColor: activeUnit ? palette.primary : palette.borderStrong,
                        backgroundColor: activeUnit ? palette.primaryLight : palette.surface,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeUnit }}
                    accessibilityLabel={`Unit ${u}`}
                    onPress={() => {
                      triggerHaptic('selection');
                      onUpdateLine(line.key, { unit: u });
                    }}
                  >
                    <Text
                      style={[
                        styles.unitChipText,
                        { color: activeUnit ? palette.primary : palette.textSecondary },
                      ]}
                    >
                      {u}
                    </Text>
                  </Pressable>
                );
              })}
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={[styles.lineTotalPreview, { color: palette.textPrimary }]}>
                  {lineTotal !== null ? formatEtb(lineTotal) : '—'}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      <Pressable
        style={({ pressed }) => [
          styles.addLineBtn,
          { borderColor: palette.borderStrong },
          pressed && { opacity: 0.8 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add another item"
        onPress={() => {
          triggerHaptic('selection');
          onAddLine();
        }}
      >
        <Feather name="plus" size={15} color={palette.primary} />
        <Text style={[styles.addLineText, { color: palette.primary }]}>Add another item</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Space.s16,
    borderWidth: Hairline,
    gap: Space.s12,
  },
  label: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  subLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: Space.s4,
  },
  lineCard: {
    borderRadius: Radius.innerCard,
    padding: Space.s12,
    borderWidth: Hairline,
    gap: Space.s12,
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineIndex: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
    minHeight: 32,
    paddingHorizontal: Space.s4,
  },
  removeLineText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
  },
  input: {
    height: 44,
    borderWidth: Hairline,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  monoInput: {
    fontFamily: Fonts.mono,
    fontVariant: ['tabular-nums'],
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.s8,
  },
  suggestionChip: {
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: 5,
  },
  suggestionText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  qtyPriceRow: {
    flexDirection: 'row',
    gap: Space.s12,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  unitChip: {
    borderWidth: Hairline,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: 5,
  },
  unitChipText: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  lineTotalPreview: {
    fontFamily: Fonts.monoMedium,
    fontSize: 14,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  addLineBtn: {
    height: 44,
    flexDirection: 'row',
    gap: Space.s8,
    borderWidth: Hairline,
    borderStyle: 'dashed',
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLineText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
});
