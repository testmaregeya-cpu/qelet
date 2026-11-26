import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatEtb } from '../lib/money';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Hairline, Radius, Space } from '../theme/tokens';
import type { Member, Shop } from '../types/phase1';
import type { ShopLedgerSummary } from '../types/phase2';
import { StatusBadge } from './StatusBadge';

interface ShopRowProps {
  shop: Shop;
  creator?: Member;
  summary?: ShopLedgerSummary;
  openDisputesCount?: number;
  isSuperAdmin: boolean;
  onPress?: (shop: Shop) => void;
  onAddCharge?: (shop: Shop) => void;
  onRecordPayment?: (shop: Shop) => void;
  onManage: (shop: Shop) => void;
  onQuickApprove?: (shopId: string) => void;
}

export const ShopRow = React.memo(function ShopRow({
  shop,
  creator,
  summary,
  openDisputesCount = 0,
  isSuperAdmin,
  onPress,
  onAddCharge,
  onRecordPayment,
  onManage,
  onQuickApprove,
}: ShopRowProps) {
  const { palette } = useTheme();
  const isMerged = shop.merged_into_shop_id !== null;
  const creatorName = creator?.display_name ?? 'Partner';
  const dotColor = creator?.avatar_color ?? palette.primary;

  const balanceText = summary
    ? summary.balanceSantim < 0
      ? `Credit ${formatEtb(Math.abs(summary.balanceSantim))}`
      : formatEtb(summary.balanceSantim)
    : '0 ETB';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor:
            shop.archived || isMerged ? palette.surfaceMuted : palette.surface,
          borderColor: palette.border,
        },
        (shop.archived || isMerged) && styles.cardMuted,
        pressed && onPress && styles.cardPressed,
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${shop.name}, ${balanceText}${summary ? `, ${summary.status.toLowerCase()}` : ''}`}
      onPress={onPress ? () => onPress(shop) : undefined}
    >
      <View style={styles.mainRow}>
        <View style={[styles.monogramBox, { backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.monogramText, { color: palette.textPrimary }]}>
            {shop.name.slice(0, 1).toUpperCase()}
          </Text>
          <View style={[styles.creatorDot, { backgroundColor: dotColor, borderColor: palette.surface }]} />
        </View>

        <View style={styles.info}>
          <View style={styles.topLine}>
            <Text style={[styles.shopName, { color: palette.textPrimary }]} numberOfLines={1}>
              {shop.name}
            </Text>
            {summary && !shop.archived && !isMerged ? (
              <Text
                style={[
                  styles.balanceText,
                  {
                    color:
                      summary.balanceSantim <= 0 ? palette.primary : palette.textPrimary,
                  },
                ]}
              >
                {balanceText}
              </Text>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            {summary && !shop.archived && !isMerged ? (
              <StatusBadge status={summary.status} />
            ) : null}

            {openDisputesCount > 0 ? (
              <View style={[styles.tag, { backgroundColor: palette.orangeLight }]}>
                <Text style={[styles.tagText, { color: palette.orange }]}>
                  {openDisputesCount} disputed
                </Text>
              </View>
            ) : null}

            {shop.needs_review && !shop.archived && !isMerged ? (
              <View style={[styles.tag, { backgroundColor: palette.amberLight }]}>
                <Text style={[styles.tagText, { color: palette.amber }]}>
                  Needs review
                </Text>
              </View>
            ) : null}

            {isMerged ? (
              <View style={[styles.tag, { backgroundColor: palette.neutralBadgeBg }]}>
                <Text style={[styles.tagText, { color: palette.neutralBadge }]}>Merged</Text>
              </View>
            ) : shop.archived ? (
              <View style={[styles.tag, { backgroundColor: palette.neutralBadgeBg }]}>
                <Text style={[styles.tagText, { color: palette.neutralBadge }]}>Archived</Text>
              </View>
            ) : null}

            <Text style={[styles.metaText, { color: palette.textMuted }]}>
              by {creatorName}
            </Text>
          </View>
        </View>

        {!isSuperAdmin && onPress ? (
          <Feather name="chevron-right" size={16} color={palette.textMuted} />
        ) : null}
      </View>

      {!shop.archived && !isMerged && (onAddCharge || onRecordPayment || isSuperAdmin) ? (
        <View style={[styles.actions, { borderTopColor: palette.border }]}>
          <View style={styles.quickActionGroup}>
            {onAddCharge ? (
              <Pressable
                style={({ pressed }) => [
                  styles.quickActionPill,
                  { backgroundColor: palette.primaryLight },
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Add charge at ${shop.name}`}
                onPress={(e) => {
                  e.stopPropagation();
                  onAddCharge(shop);
                }}
              >
                <Feather name="plus" size={13} color={palette.primary} />
                <Text style={[styles.quickActionText, { color: palette.primary }]}>Charge</Text>
              </Pressable>
            ) : null}

            {onRecordPayment ? (
              <Pressable
                style={({ pressed }) => [
                  styles.quickActionPill,
                  { backgroundColor: palette.surfaceMuted },
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Record payment for ${shop.name}`}
                onPress={(e) => {
                  e.stopPropagation();
                  onRecordPayment(shop);
                }}
              >
                <Feather name="check" size={13} color={palette.textPrimary} />
                <Text style={[styles.quickActionText, { color: palette.textPrimary }]}>Pay</Text>
              </Pressable>
            ) : null}
          </View>

          {isSuperAdmin ? (
            <View style={styles.adminActionGroup}>
              {shop.needs_review && onQuickApprove ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { backgroundColor: palette.primaryLight },
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Approve ${shop.name}`}
                  onPress={(e) => {
                    e.stopPropagation();
                    onQuickApprove(shop.id);
                  }}
                >
                  <Feather name="check" size={13} color={palette.primary} />
                  <Text style={[styles.actionBtnText, { color: palette.primary }]}>Approve</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.manageBtn,
                  { backgroundColor: palette.surfaceMuted },
                  pressed && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Manage ${shop.name}`}
                onPress={(e) => {
                  e.stopPropagation();
                  onManage(shop);
                }}
              >
                <Feather name="sliders" size={13} color={palette.textSecondary} />
                <Text style={[styles.manageBtnText, { color: palette.textPrimary }]}>Manage</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Space.s16,
    borderWidth: Hairline,
    gap: Space.s12,
  },
  cardMuted: {
    opacity: 0.72,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s12,
  },
  monogramBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.innerCard,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  monogramText: {
    fontFamily: Fonts.sansSemi,
    fontSize: 17,
    lineHeight: 22,
  },
  creatorDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  info: {
    flex: 1,
    gap: Space.s6,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.s12,
  },
  shopName: {
    flex: 1,
    fontFamily: Fonts.sansSemi,
    fontSize: 16,
    lineHeight: 20,
  },
  balanceText: {
    fontFamily: Fonts.monoMedium,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Space.s8,
  },
  metaText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  tag: {
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s8,
    paddingVertical: Space.s4,
  },
  tagText: {
    fontFamily: Fonts.monoMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.s8,
    borderTopWidth: Hairline,
    paddingTop: Space.s12,
  },
  quickActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  quickActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: 6,
  },
  quickActionText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  adminActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    marginLeft: 'auto',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: 6,
  },
  actionBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: 6,
  },
  manageBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
  },
});
