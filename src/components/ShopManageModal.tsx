import Feather from '@expo/vector-icons/Feather';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Hairline, Radius, Space } from '../theme/tokens';
import type { Shop } from '../types/phase1';

interface ShopManageModalProps {
  shop: Shop | null;
  mergeTargets: Shop[];
  busy: boolean;
  onClose: () => void;
  onApprove: (shopId: string) => Promise<void>;
  onRename: (shopId: string, newName: string) => Promise<void>;
  onToggleArchive: (shopId: string, archived: boolean) => Promise<void>;
  onMerge: (sourceShopId: string, targetShopId: string) => Promise<void>;
}

export function ShopManageModal(props: ShopManageModalProps) {
  if (!props.shop) {
    return null;
  }

  return <ShopManageModalContent key={props.shop.id} {...props} shop={props.shop} />;
}

function ShopManageModalContent({
  shop,
  mergeTargets,
  busy,
  onClose,
  onApprove,
  onRename,
  onToggleArchive,
  onMerge,
}: Omit<ShopManageModalProps, 'shop'> & { shop: Shop }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [nameInput, setNameInput] = useState(shop.name);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const isMerged = shop.merged_into_shop_id !== null;
  const availableTargets = mergeTargets.filter(
    (candidate) =>
      candidate.id !== shop.id &&
      !candidate.archived &&
      candidate.merged_into_shop_id === null
  );

  const handleRename = async () => {
    setLocalError(null);
    try {
      await onRename(shop.id, nameInput);
      onClose();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const handleAction = async (fn: () => Promise<void>) => {
    setLocalError(null);
    try {
      await fn();
      onClose();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
              paddingBottom: Math.max(Space.s24, insets.bottom + Space.s12),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: palette.borderStrong }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.textPrimary }]} numberOfLines={1}>
              Manage shop
            </Text>
            <Pressable
              onPress={onClose}
              disabled={busy}
              hitSlop={8}
              style={[styles.closeBtn, { backgroundColor: palette.surfaceMuted }]}
            >
              <Feather name="x" size={16} color={palette.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {localError ? (
              <View style={[styles.errorBox, { backgroundColor: palette.dangerLight }]}>
                <Text style={[styles.errorText, { color: palette.danger }]}>{localError}</Text>
              </View>
            ) : null}

            {isMerged ? (
              <Text style={[styles.mutedNote, { color: palette.textSecondary }]}>
                This shop was merged into another shop and stays read-only for audit history.
              </Text>
            ) : (
              <>
                {shop.needs_review ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      { backgroundColor: palette.primary },
                      busy && styles.disabled,
                      pressed && { opacity: 0.88 },
                    ]}
                    disabled={busy}
                    onPress={() => void handleAction(() => onApprove(shop.id))}
                  >
                    <Feather name="check" size={16} color={palette.accentButtonText} />
                    <Text style={[styles.approveBtnText, { color: palette.accentButtonText }]}>
                      Approve shop
                    </Text>
                  </Pressable>
                ) : null}

                <View style={styles.section}>
                  <Text style={[styles.label, { color: palette.textSecondary }]}>Shop name</Text>
                  <View style={styles.renameRow}>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          flex: 1,
                          borderColor: palette.border,
                          color: palette.textPrimary,
                          backgroundColor: palette.background,
                        },
                      ]}
                      value={nameInput}
                      onChangeText={setNameInput}
                      editable={!busy}
                      placeholder="Shop name"
                      placeholderTextColor={palette.textMuted}
                      maxLength={80}
                    />
                    <Pressable
                      style={[
                        styles.smallBtn,
                        { backgroundColor: palette.primaryButtonBg },
                        busy && styles.disabled,
                      ]}
                      disabled={busy}
                      onPress={() => void handleRename()}
                    >
                      <Text style={[styles.smallBtnText, { color: palette.primaryButtonText }]}>
                        Save
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {!shop.archived && availableTargets.length > 0 ? (
                  <View style={[styles.section, styles.dividedSection, { borderTopColor: palette.border }]}>
                    <Text style={[styles.label, { color: palette.textSecondary }]}>
                      Merge into existing shop
                    </Text>
                    <Text style={[styles.mutedNote, { color: palette.textSecondary }]}>
                      Moves all entries and remembered prices to the chosen shop and archives {shop.name}. This cannot be undone.
                    </Text>
                    <View style={styles.targetList}>
                      {availableTargets.map((target) => {
                        const selected = selectedTargetId === target.id;
                        return (
                          <Pressable
                            key={target.id}
                            style={[
                              styles.targetChip,
                              {
                                borderColor: selected ? palette.primary : 'transparent',
                                backgroundColor: selected
                                  ? palette.primaryLight
                                  : palette.surfaceMuted,
                              },
                            ]}
                            disabled={busy}
                            onPress={() => setSelectedTargetId(target.id)}
                          >
                            <Text
                              style={[
                                styles.targetChipText,
                                {
                                  color: selected ? palette.primary : palette.textPrimary,
                                  fontFamily: selected ? Fonts.sansSemi : Fonts.sansMedium,
                                },
                              ]}
                            >
                              {target.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {selectedTargetId ? (
                      <Pressable
                        style={[
                          styles.actionBtn,
                          {
                            backgroundColor: palette.amberLight,
                            borderWidth: Hairline,
                            borderColor: palette.amber,
                          },
                          busy && styles.disabled,
                        ]}
                        disabled={busy}
                        onPress={() =>
                          void handleAction(() => onMerge(shop.id, selectedTargetId))
                        }
                      >
                        <Text style={[styles.mergeBtnText, { color: palette.amber }]}>
                          Confirm merge
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                <View style={[styles.section, styles.dividedSection, { borderTopColor: palette.border }]}>
                  <Pressable
                    style={[
                      styles.actionBtn,
                      shop.archived
                        ? { backgroundColor: palette.primary }
                        : {
                            backgroundColor: palette.dangerLight,
                            borderWidth: Hairline,
                            borderColor: palette.danger,
                          },
                      busy && styles.disabled,
                    ]}
                    disabled={busy}
                    onPress={() =>
                      void handleAction(() => onToggleArchive(shop.id, !shop.archived))
                    }
                  >
                    <Text
                      style={
                        shop.archived
                          ? [styles.approveBtnText, { color: palette.accentButtonText }]
                          : [styles.archiveBtnText, { color: palette.danger }]
                      }
                    >
                      {shop.archived ? 'Restore shop' : 'Archive shop'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 13, 10, 0.48)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: Hairline,
    maxHeight: '84%',
    paddingHorizontal: Space.s20,
    paddingTop: Space.s12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Space.s12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.s16,
  },
  title: {
    fontFamily: Fonts.sansSemi,
    fontSize: 18,
    lineHeight: 24,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: Space.s16,
    paddingBottom: Space.s16,
  },
  label: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  renameRow: {
    flexDirection: 'row',
    gap: Space.s8,
    alignItems: 'center',
  },
  input: {
    height: 44,
    borderWidth: Hairline,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  smallBtn: {
    height: 44,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
  section: {
    gap: Space.s8,
  },
  dividedSection: {
    borderTopWidth: Hairline,
    paddingTop: Space.s16,
  },
  mutedNote: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
  },
  targetList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.s8,
  },
  targetChip: {
    borderWidth: Hairline,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s8,
  },
  targetChipText: {
    fontSize: 13,
    lineHeight: 16,
  },
  actionBtn: {
    height: 46,
    flexDirection: 'row',
    gap: Space.s8,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
  },
  mergeBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
  archiveBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
  },
  errorBox: {
    padding: Space.s12,
    borderRadius: Radius.control,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  disabled: {
    opacity: 0.55,
  },
});
