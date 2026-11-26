import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Space, Radius, Fonts } from '../theme/tokens';
import { triggerHaptic } from '../lib/haptics';
import { createShop } from '../services/shops';
import type { Shop } from '../types/phase1';

export interface CreateShopModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (shop: Shop) => void;
  householdId: string;
  userId: string;
  isSuperAdmin?: boolean;
  existingShopNames?: string[];
}

const PRESET_TEMPLATES = [
  'Suq (ሱቅ)',
  'Mini Market',
  'Bakery (ዳቦ ቤት)',
  'Butcher (ሥጋ ቤት)',
  'Pharmacy (ፋርማሲ)',
  'Enjera (እንጀራ)',
];

export const CreateShopModal: React.FC<CreateShopModalProps> = ({
  visible,
  onClose,
  onCreated,
  householdId,
  userId,
  isSuperAdmin = true,
  existingShopNames = [],
}) => {
  const { palette } = useTheme();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const isDuplicate = useMemo(() => {
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    return existingShopNames.some((n) => n.trim().toLowerCase() === lower);
  }, [trimmed, existingShopNames]);

  const isValid = trimmed.length >= 2 && trimmed.length <= 80 && !isDuplicate;

  const handleSelectPreset = (preset: string) => {
    triggerHaptic('selection');
    setName(preset);
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    setName('');
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setError(null);
    setSubmitting(true);
    triggerHaptic('selection');

    try {
      const created = await createShop({
        householdId,
        name: trimmed,
        createdBy: userId,
      });
      triggerHaptic('success');
      setName('');
      onCreated(created);
      onClose();
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Failed to create shop');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View
          style={[
            styles.sheet,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: palette.textPrimary }]}>
                New Shop
              </Text>
              <Text style={[styles.subtitle, { color: palette.textMuted }]}>
                Add a store to record credit purchases and debt payments
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: palette.surfaceMuted },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Close shop creation dialog"
              onPress={handleClose}
            >
              <Feather name="x" size={18} color={palette.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            {/* Presets */}
            <View style={styles.presetsBlock}>
              <Text style={[styles.inputLabel, { color: palette.textSecondary }]}>
                Quick presets
              </Text>
              <View style={styles.presetChipsRow}>
                {PRESET_TEMPLATES.map((preset) => (
                  <Pressable
                    key={preset}
                    style={({ pressed }) => [
                      styles.presetChip,
                      {
                        backgroundColor:
                          name === preset ? palette.primaryLight : palette.background,
                        borderColor:
                          name === preset ? palette.primary : palette.border,
                      },
                      pressed && { opacity: 0.8 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Use preset ${preset}`}
                    onPress={() => handleSelectPreset(preset)}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        {
                          color:
                            name === preset
                              ? palette.primary
                              : palette.textPrimary,
                        },
                      ]}
                    >
                      {preset}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Input */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: palette.textSecondary }]}>
                  Shop name
                </Text>
                <Text style={[styles.charCount, { color: palette.textMuted }]}>
                  {name.length}/80
                </Text>
              </View>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: palette.background,
                    borderColor: isDuplicate
                      ? palette.danger
                      : palette.borderStrong,
                    color: palette.textPrimary,
                  },
                ]}
                placeholder="e.g. Abebe Suq, Bole Mini Market"
                placeholderTextColor={palette.textMuted}
                value={name}
                onChangeText={(val) => {
                  setName(val);
                  if (error) setError(null);
                }}
                maxLength={80}
                autoFocus
                editable={!submitting}
                returnKeyType="done"
                onSubmitEditing={() => void handleSubmit()}
              />
              {isDuplicate ? (
                <Text style={[styles.errorHelper, { color: palette.danger }]}>
                  A shop with this name already exists in your household.
                </Text>
              ) : null}
            </View>

            {/* Role / Review Status Indicator */}
            <View
              style={[
                styles.roleNotice,
                {
                  backgroundColor: isSuperAdmin
                    ? palette.surfaceMuted
                    : palette.amberLight,
                  borderColor: isSuperAdmin ? palette.border : palette.amber,
                },
              ]}
            >
              <Feather
                name={isSuperAdmin ? 'check-circle' : 'info'}
                size={14}
                color={isSuperAdmin ? palette.primary : palette.amber}
              />
              <Text
                style={[
                  styles.roleNoticeText,
                  { color: isSuperAdmin ? palette.textSecondary : palette.amber },
                ]}
              >
                {isSuperAdmin
                  ? 'As Super Admin, this shop will be immediately active.'
                  : 'New shop will be created and flagged for admin review.'}
              </Text>
            </View>

            {error ? (
              <View
                style={[
                  styles.errorBanner,
                  { backgroundColor: palette.dangerLight },
                ]}
              >
                <Feather name="alert-circle" size={14} color={palette.danger} />
                <Text style={[styles.errorBannerText, { color: palette.danger }]}>
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Actions */}
            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.cancelBtn,
                  { borderColor: palette.borderStrong },
                  pressed && { opacity: 0.8 },
                ]}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Cancel shop creation"
                onPress={handleClose}
              >
                <Text style={[styles.cancelText, { color: palette.textPrimary }]}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  { backgroundColor: palette.primaryButtonBg },
                  (!isValid || submitting) && styles.disabledBtn,
                  pressed && { opacity: 0.9 },
                ]}
                disabled={!isValid || submitting}
                accessibilityRole="button"
                accessibilityLabel="Confirm create shop"
                onPress={() => void handleSubmit()}
              >
                {submitting ? (
                  <ActivityIndicator
                    size="small"
                    color={palette.primaryButtonText}
                  />
                ) : (
                  <>
                    <Feather
                      name="plus"
                      size={16}
                      color={palette.primaryButtonText}
                    />
                    <Text
                      style={[
                        styles.submitText,
                        { color: palette.primaryButtonText },
                      ]}
                    >
                      Create Shop
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: 1,
    paddingTop: Space.s20,
    paddingHorizontal: Space.s20,
    paddingBottom: Platform.OS === 'ios' ? Space.s32 : Space.s24,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Space.s16,
    gap: Space.s12,
  },
  title: {
    fontFamily: Fonts.sansSemi,
    fontSize: 20,
    lineHeight: 24,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    marginTop: Space.s4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    gap: Space.s16,
  },
  presetsBlock: {
    gap: Space.s8,
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.s8,
  },
  presetChip: {
    paddingVertical: Space.s8,
    paddingHorizontal: Space.s12,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  presetChipText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  inputGroup: {
    gap: Space.s8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  charCount: {
    fontFamily: Fonts.mono,
    fontSize: 11,
  },
  input: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    height: 48,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
  },
  errorHelper: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: Space.s4,
  },
  roleNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    padding: Space.s12,
    borderRadius: Radius.control,
    borderWidth: 1,
  },
  roleNoticeText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    padding: Space.s8,
    borderRadius: Radius.control,
  },
  errorBannerText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Space.s12,
    marginTop: Space.s8,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
  },
  submitBtn: {
    flex: 2,
    height: 48,
    borderRadius: Radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  submitText: {
    fontFamily: Fonts.sansSemi,
    fontSize: 15,
  },
});
