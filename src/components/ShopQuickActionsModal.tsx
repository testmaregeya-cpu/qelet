import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { triggerHaptic } from '../lib/haptics';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Hairline, Radius, Space } from '../theme/tokens';
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

export function ShopQuickActionsModal(props: ShopQuickActionsModalProps) {
  if (!props.shop) return null;
  return <ShopQuickActionsModalContent {...props} shop={props.shop} />;
}

function ShopQuickActionsModalContent({
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
}: ShopQuickActionsModalProps & { shop: Shop }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const isInactive = shop.archived || shop.merged_into_shop_id !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
              paddingBottom: Math.max(Space.s24, insets.bottom + Space.s8),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: palette.borderStrong }]} />

          {/* Header Row */}
          <View style={styles.header}>
            <View style={[styles.monogramBox, { backgroundColor: palette.surfaceMuted }]}>
              <Text style={[styles.monogramText, { color: palette.textPrimary }]}>
                {shop.name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
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
            <Pressable
              hitSlop={12}
              style={[styles.closeBtn, { backgroundColor: palette.surfaceMuted }]}
              onPress={onClose}
              accessibilityLabel="Close actions"
            >
              <Feather name="x" size={16} color={palette.textSecondary} />
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
                    { backgroundColor: palette.surfaceMuted },
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
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: Hairline,
    paddingHorizontal: Space.s20,
    paddingTop: Space.s12,
    gap: Space.s16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Space.s8,
  },
  header: {
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
  },
  monogramText: {
    fontFamily: Fonts.sansSemi,
    fontSize: 18,
  },
  shopName: {
    fontFamily: Fonts.sansSemi,
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
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionList: {
    gap: Space.s10,
    paddingBottom: Space.s8,
  },
  primaryBtn: {
    height: 48,
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
    height: 46,
    borderRadius: Radius.control,
    borderWidth: Hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
  },
  tertiaryBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
});
