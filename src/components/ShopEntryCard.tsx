import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatBillMonthLabel } from '../domain/billing';
import { formatEtb, formatQuantityMilli } from '../lib/money';
import { findMember } from '../lib/shopRules';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';
import type { Member } from '../types/phase1';
import type { LedgerEntry } from '../types/phase2';

interface ShopEntryCardProps {
  entry: LedgerEntry;
  members: readonly Member[];
  hasOpenDispute: boolean;
  onPress: (entryId: string) => void;
}

export const ShopEntryCard = React.memo(function ShopEntryCard({
  entry,
  members,
  hasOpenDispute,
  onPress,
}: ShopEntryCardProps) {
  const { palette } = useTheme();
  const creator = findMember(members, entry.created_by);
  const creatorName = creator?.display_name ?? 'Partner';
  const dotColor = creator?.avatar_color ?? palette.primary;
  const isCharge = entry.type === 'charge';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.entryCard,
        {
          backgroundColor: entry.voided ? palette.surfaceMuted : palette.surface,
          borderColor: palette.border,
        },
        entry.voided && styles.entryVoided,
        pressed && { opacity: 0.88 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${isCharge ? 'Credit charge' : 'Payment'} ${formatEtb(
        entry.total_amount_santim
      )} by ${creatorName} on ${entry.entry_date}`}
      onPress={() => onPress(entry.id)}
    >
      <View style={styles.entryHeader}>
        <View style={[styles.memberDot, { backgroundColor: dotColor }]} />
        <View style={{ flex: 1, gap: Space.s4 }}>
          <Text style={[styles.entryTitle, { color: palette.textPrimary }]}>
            {isCharge ? 'Charge' : 'Payment'} · {creatorName}
          </Text>
          <Text style={[styles.entryDate, { color: palette.textMuted }]}>
            {entry.entry_date}
            {entry.bill_month ? ` · ${formatBillMonthLabel(entry.bill_month)}` : ''}
            {entry.edit_count > 0 ? ' · Edited' : ''}
            {hasOpenDispute ? ' · Disputed' : ''}
          </Text>
        </View>
        <Text
          style={[
            styles.entryAmount,
            { color: isCharge ? palette.textPrimary : palette.primary },
            entry.voided && styles.voidedStrike,
          ]}
        >
          {isCharge ? '+' : '-'}
          {formatEtb(entry.total_amount_santim)}
        </Text>
      </View>

      {isCharge && entry.entry_lines && entry.entry_lines.length > 0 ? (
        <View style={[styles.linesBox, { backgroundColor: palette.background }]}>
          {entry.entry_lines.map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <Text style={[styles.lineText, { color: palette.textPrimary }]}>
                {formatQuantityMilli(line.quantity_milli)} {line.unit} × {line.item_name} @{' '}
                {formatEtb(line.unit_price_santim)}
              </Text>
              <Text style={[styles.lineTotal, { color: palette.textPrimary }]}>
                {formatEtb(line.line_total_santim)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {entry.note ? (
        <Text style={[styles.entryNote, { color: palette.textSecondary }]}>
          Note: {entry.note}
        </Text>
      ) : null}
      {entry.voided ? (
        <Text style={[styles.voidTag, { color: palette.danger }]}>
          Voided: {entry.void_reason ?? 'voided'}
        </Text>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  entryCard: {
    borderRadius: Radius.card,
    padding: Space.s16,
    borderWidth: 1,
    gap: Space.s12,
    marginBottom: Space.s12,
  },
  entryVoided: {
    opacity: 0.65,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s12,
  },
  memberDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  entryTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  entryDate: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  entryAmount: {
    fontFamily: Fonts.monoMedium,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  voidedStrike: {
    textDecorationLine: 'line-through',
  },
  linesBox: {
    borderRadius: Radius.innerCard,
    padding: Space.s12,
    gap: Space.s8,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space.s12,
  },
  lineText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  lineTotal: {
    fontFamily: Fonts.monoMedium,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  entryNote: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  voidTag: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
  },
});
