import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { triggerHaptic } from '../lib/haptics';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';
import type { Shop } from '../types/phase1';
import { StatusBadge } from './StatusBadge';
import type { ShopStatusBadge } from '../types/phase2';

interface ShopQuickActionsModalProps {
  visible: boolean;
  shop: Shop | null;
  balanceText: string;
  status?: ShopStatusBadge;
  isSuperAdmin?: boolean;
  onClose: () => void;
  onAddCharge: (shop: Shop) => void;
  onRecordPayment: (shop: Shop) => void;
  onViewStatement: (shop: Shop) => void;
  onManage?: (shop: Shop) => void;
}

export function ShopQuickActionsModal({
  visible,
  shop,
  balanceText,
  status,
  isSuperAdmin = false,
  onClose,
  onAddCharge,
  onRecordPayment,
  onViewStatement,
  onManage,
}: ShopQuickActionsModalProps) {
  const { palette } = useTheme();

  if (!shop) return null;

  const isInactive = shop.archived || shop.merged_into_shop_id !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header Row */}
          <View style={styles.header}>
            <View style={[styles.monogramBox, { backgroundColor: palette.surfaceMuted }]}>
              <Text style={[styles.monogramText, { color: palette.textPrimary }]}>
                {shop.name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, gap: Space.s4 }}>
              <Text style={[styles.shopName, { color: palette.textPrimary }]} numberOfLines={1}>
                {shop.name}
              </Text>
              <View style={styles.balanceLine}>
                <Text style={[styles.balanceText, { color: palette.textPrimary }]}>
                  {balanceText}
                </Text>
                {status ? <StatusBadge status={status} /> : null}
              </View>
            </View>
            <Pressable hitSlop={12} onPress={onClose} accessibilityLabel="Close actions">
              <Feather name="x" size={20} color={palette.textMuted} />
            </Pressable>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionList}>
            {!isInactive ? (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: palette.primaryButtonBg },
                    pressed && { opacity: 0.9 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add charge at ${shop.name}`}
                  onPress={() => {
                    triggerHaptic('selection');
                    onClose();
                    onAddCharge(shop);
                  }}
                >
                  <Feather name="plus-circle" size={18} color={palette.primaryButtonText} />
                  <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                    Add credit charge
                  </Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { borderColor: palette.borderStrong, backgroundColor: palette.surfaceMuted },
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Record payment for ${shop.name}`}
                  onPress={() => {
                    triggerHaptic('selection');
                    onClose();
                    onRecordPayment(shop);
                  }}
                >
                  <Feather name="check-circle" size={18} color={palette.textPrimary} />
                  <Text style={[styles.secondaryBtnText, { color: palette.textPrimary }]}>
                    Record payment
                  </Text>
                </Pressable>
              </>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.tertiaryBtn,
                { borderColor: palette.border },
                pressed && { backgroundColor: palette.surfaceMuted },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`View full statement and history for ${shop.name}`}
              onPress={() => {
                triggerHaptic('selection');
                onClose();
                onViewStatement(shop);
              }}
            >
              <Feather name="file-text" size={16} color={palette.textSecondary} />
              <Text style={[styles.tertiaryBtnText, { color: palette.textSecondary }]}>
                View ledger statement & history
              </Text>
            </Pressable>

            {isSuperAdmin && onManage ? (
              <Pressable
                style={({ pressed }) => [
                  styles.tertiaryBtn,
                  { borderColor: palette.border },
                  pressed && { backgroundColor: palette.surfaceMuted },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Manage settings for ${shop.name}`}
                onPress={() => {
                  triggerHaptic('selection');
                  onClose();
                  onManage(shop);
                }}
              >
                <Feather name="sliders" size={16} color={palette.textMuted} />
                <Text style={[styles.tertiaryBtnText, { color: palette.textMuted }]}>
                  Manage shop settings
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    borderTopWidth: 1,
    padding: Space.s20,
    gap: Space.s20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s12,
  },
  monogramBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 18,
  },
  shopName: {
    fontFamily: Fonts.sansMedium,
    fontSize: 18,
    lineHeight: 24,
  },
  balanceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  balanceText: {
    fontFamily: Fonts.monoMedium,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  actionList: {
    gap: Space.s12,
  },
  primaryBtn: {
    height: 50,
    borderRadius: Radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
  },
  primaryBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
  },
  secondaryBtn: {
    height: 48,
    borderRadius: Radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
  },
  secondaryBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
  },
  tertiaryBtn: {
    height: 44,
    borderRadius: Radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
  },
  tertiaryBtnText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
});
