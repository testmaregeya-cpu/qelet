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
import { Space, Radius, Fonts, Hairline } from '../theme/tokens';
import { triggerHaptic } from '../lib/haptics';
import { parseEtbToSantim, formatSantimForInput } from '../lib/money';
import {
  createPersonalExpense,
  updatePersonalExpense,
} from '../services/personalExpenses';
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  type ExpenseCategoryKey,
  type PaymentMethod,
  type PersonalExpense,
} from '../types/personalExpense';

export interface LogExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (expense: PersonalExpense) => void;
  userId: string;
  initialExpense?: PersonalExpense | null;
}

function getTodayIsoDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategoryKey[];

interface LogExpenseFormProps {
  onClose: () => void;
  onSaved: (expense: PersonalExpense) => void;
  userId: string;
  initialExpense?: PersonalExpense | null;
}

const LogExpenseForm: React.FC<LogExpenseFormProps> = ({
  onClose,
  onSaved,
  userId,
  initialExpense,
}) => {
  const { palette } = useTheme();

  const isEditing = Boolean(initialExpense);

  const [amountEtb, setAmountEtb] = useState(() =>
    initialExpense ? formatSantimForInput(initialExpense.amount_santim) : ''
  );
  const [category, setCategory] = useState<ExpenseCategoryKey>(() =>
    initialExpense ? initialExpense.category : 'transport'
  );
  const [title, setTitle] = useState(() => (initialExpense ? initialExpense.title : ''));
  const [note, setNote] = useState(() => (initialExpense ? initialExpense.note ?? '' : ''));
  const [expenseDate, setExpenseDate] = useState(() =>
    initialExpense ? initialExpense.expense_date : getTodayIsoDate()
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() =>
    initialExpense ? initialExpense.payment_method : 'telebirr'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCategoryMeta = EXPENSE_CATEGORIES[category] ?? EXPENSE_CATEGORIES.other;

  const handleSelectPreset = (preset: string) => {
    triggerHaptic('selection');
    setTitle(preset);
    const match = preset.match(/(\d+)\s*ETB/i);
    if (match && !amountEtb) {
      setAmountEtb(match[1]);
    }
  };

  const handleAddAmount = (addBirr: number) => {
    triggerHaptic('selection');
    try {
      const current = amountEtb ? parseFloat(amountEtb) : 0;
      const next = Math.max(0, current + addBirr);
      setAmountEtb(String(next));
    } catch {
      setAmountEtb(String(addBirr));
    }
  };

  const handleSave = async () => {
    setError(null);

    let amountSantim = 0;
    try {
      amountSantim = parseEtbToSantim(amountEtb);
    } catch {
      setError('Please enter a valid amount');
      return;
    }

    if (amountSantim <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Please enter or pick an item name');
      return;
    }

    setSubmitting(true);
    triggerHaptic('impact');

    try {
      if (isEditing && initialExpense) {
        const updated = await updatePersonalExpense(userId, initialExpense.id, {
          amountSantim,
          category,
          title: cleanTitle,
          note: note.trim(),
          expenseDate,
          paymentMethod,
        });
        triggerHaptic('success');
        onSaved(updated);
        onClose();
      } else {
        const created = await createPersonalExpense(userId, {
          amountSantim,
          category,
          title: cleanTitle,
          note: note.trim(),
          expenseDate,
          paymentMethod,
        });
        triggerHaptic('success');
        onSaved(created);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense');
      triggerHaptic('error');
    } finally {
      setSubmitting(false);
    }
  };

  const todayStr = useMemo(() => getTodayIsoDate(), []);
  const yesterdayStr = useMemo(() => getYesterdayIsoDate(), []);

  return (
    <View
      style={[
        styles.sheetContainer,
        { backgroundColor: palette.cardElevated, borderColor: palette.border },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.categoryAvatar,
              { backgroundColor: activeCategoryMeta.bgColor },
            ]}
          >
            <Feather
              name={activeCategoryMeta.icon}
              size={18}
              color={activeCategoryMeta.color}
            />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>
              {isEditing ? 'Edit Expense' : 'Log Personal Spend'}
            </Text>
            <Text style={[styles.headerSubtitle, { color: palette.textMuted }]}>
              Private to you • Never shared with partner
            </Text>
          </View>
        </View>

        <Pressable
          hitSlop={10}
          onPress={onClose}
          disabled={submitting}
          style={styles.closeBtn}
        >
          <Feather name="x" size={20} color={palette.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollBody}
      >
        {/* Amount Input Hero */}
        <View
          style={[
            styles.amountCard,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.currencyLabel, { color: palette.textMuted }]}>
            ETB (Birr)
          </Text>
          <View style={styles.amountInputRow}>
            <TextInput
              testID="expense-amount-input"
              style={[styles.amountInput, { color: palette.textPrimary }]}
              placeholder="0.00"
              placeholderTextColor={palette.textMuted}
              keyboardType="decimal-pad"
              value={amountEtb}
              onChangeText={(val) => {
                setAmountEtb(val);
                setError(null);
              }}
              autoFocus={!isEditing}
            />
          </View>

          {/* Quick Amount Chips */}
          <View style={styles.quickAmountRow}>
            {[50, 100, 200, 500].map((add) => (
              <Pressable
                key={add}
                style={[
                  styles.quickAmountChip,
                  { backgroundColor: palette.cardElevated, borderColor: palette.border },
                ]}
                onPress={() => handleAddAmount(add)}
              >
                <Text style={[styles.quickAmountText, { color: palette.textPrimary }]}>
                  +{add}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Category Selector */}
        <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
          CATEGORY
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORY_KEYS.map((catKey) => {
            const meta = EXPENSE_CATEGORIES[catKey];
            const isSelected = category === catKey;
            return (
              <Pressable
                key={catKey}
                testID={`cat-chip-${catKey}`}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: isSelected ? meta.bgColor : palette.surface,
                    borderColor: isSelected ? meta.color : palette.border,
                  },
                ]}
                onPress={() => {
                  triggerHaptic('selection');
                  setCategory(catKey);
                  if (activeCategoryMeta.popularPresets.includes(title)) {
                    setTitle('');
                  }
                }}
              >
                <Feather
                  name={meta.icon}
                  size={15}
                  color={isSelected ? meta.color : palette.textMuted}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    {
                      color: isSelected ? meta.color : palette.textPrimary,
                      fontFamily: isSelected ? Fonts.sansSemi : Fonts.sans,
                    },
                  ]}
                >
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Quick Presets */}
        {activeCategoryMeta.popularPresets.length > 0 && (
          <View style={styles.presetsWrap}>
            <Text style={[styles.subSectionLabel, { color: palette.textMuted }]}>
              POPULAR IN {activeCategoryMeta.label.toUpperCase()}
            </Text>
            <View style={styles.presetChipsRow}>
              {activeCategoryMeta.popularPresets.map((preset) => (
                <Pressable
                  key={preset}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor:
                        title === preset ? activeCategoryMeta.bgColor : palette.surface,
                      borderColor:
                        title === preset ? activeCategoryMeta.color : palette.border,
                    },
                  ]}
                  onPress={() => handleSelectPreset(preset)}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      {
                        color: title === preset ? activeCategoryMeta.color : palette.textPrimary,
                      },
                    ]}
                  >
                    {preset}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Custom Title Input */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: palette.textMuted }]}>
            DESCRIPTION / ITEM
          </Text>
          <TextInput
            testID="expense-title-input"
            style={[
              styles.textInput,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                color: palette.textPrimary,
              },
            ]}
            placeholder={`e.g. ${activeCategoryMeta.popularPresets[0] ?? 'Expense'}`}
            placeholderTextColor={palette.textMuted}
            value={title}
            onChangeText={(val) => {
              setTitle(val);
              setError(null);
            }}
          />
        </View>

        {/* Payment Method Pills */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: palette.textMuted }]}>
            PAID VIA
          </Text>
          <View style={styles.paymentMethodsRow}>
            {PAYMENT_METHODS.map((pm) => {
              const isSelected = paymentMethod === pm.key;
              return (
                <Pressable
                  key={pm.key}
                  style={[
                    styles.pmChip,
                    {
                      backgroundColor: isSelected ? palette.textPrimary : palette.surface,
                      borderColor: isSelected ? palette.textPrimary : palette.border,
                    },
                  ]}
                  onPress={() => {
                    triggerHaptic('selection');
                    setPaymentMethod(pm.key);
                  }}
                >
                  <Feather
                    name={pm.icon}
                    size={12}
                    color={isSelected ? palette.background : palette.textMuted}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.pmChipText,
                      {
                        color: isSelected ? palette.background : palette.textPrimary,
                        fontFamily: isSelected ? Fonts.sansSemi : Fonts.sans,
                      },
                    ]}
                  >
                    {pm.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Date Row */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: palette.textMuted }]}>
            DATE
          </Text>
          <View style={styles.dateRow}>
            <Pressable
              style={[
                styles.dateChip,
                {
                  backgroundColor:
                    expenseDate === todayStr ? palette.primary : palette.surface,
                  borderColor:
                    expenseDate === todayStr ? palette.primary : palette.border,
                },
              ]}
              onPress={() => {
                triggerHaptic('selection');
                setExpenseDate(todayStr);
              }}
            >
              <Text
                style={[
                  styles.dateChipText,
                  {
                    color: expenseDate === todayStr ? '#FFFFFF' : palette.textPrimary,
                    fontFamily: expenseDate === todayStr ? Fonts.sansSemi : Fonts.sans,
                  },
                ]}
              >
                Today
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.dateChip,
                {
                  backgroundColor:
                    expenseDate === yesterdayStr ? palette.primary : palette.surface,
                  borderColor:
                    expenseDate === yesterdayStr ? palette.primary : palette.border,
                },
              ]}
              onPress={() => {
                triggerHaptic('selection');
                setExpenseDate(yesterdayStr);
              }}
            >
              <Text
                style={[
                  styles.dateChipText,
                  {
                    color: expenseDate === yesterdayStr ? '#FFFFFF' : palette.textPrimary,
                    fontFamily: expenseDate === yesterdayStr ? Fonts.sansSemi : Fonts.sans,
                  },
                ]}
              >
                Yesterday
              </Text>
            </Pressable>

            <TextInput
              style={[
                styles.dateInput,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  color: palette.textPrimary,
                },
              ]}
              value={expenseDate}
              onChangeText={setExpenseDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.textMuted}
            />
          </View>
        </View>

        {/* Note Input */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: palette.textMuted }]}>
            NOTE (OPTIONAL)
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                color: palette.textPrimary,
              },
            ]}
            placeholder="Add details (e.g. from Kazanchis to Bole)"
            placeholderTextColor={palette.textMuted}
            value={note}
            onChangeText={setNote}
          />
        </View>

        {/* Error Banner */}
        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: '#FEE2E2' }]}>
            <Feather name="alert-circle" size={14} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Submit Button */}
        <Pressable
          testID="save-expense-btn"
          disabled={submitting}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: palette.primary,
              opacity: submitting ? 0.7 : pressed ? 0.9 : 1,
            },
          ]}
          onPress={handleSave}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <View style={styles.btnInner}>
              <Feather
                name={isEditing ? 'check' : 'plus-circle'}
                size={18}
                color="#FFFFFF"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.saveButtonText}>
                {isEditing ? 'Update Expense' : 'Save Expense'}
              </Text>
            </View>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
};

export const LogExpenseModal: React.FC<LogExpenseModalProps> = ({
  visible,
  onClose,
  onSaved,
  userId,
  initialExpense,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        {visible ? (
          <LogExpenseForm
            key={initialExpense?.id ?? 'new-expense'}
            onClose={onClose}
            onSaved={onSaved}
            userId={userId}
            initialExpense={initialExpense}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetContainer: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: Hairline,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 34 : Space.s24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.s20,
    paddingTop: Space.s20,
    paddingBottom: Space.s12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s10,
  },
  categoryAvatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.sansSemi,
    fontSize: 17,
  },
  headerSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    padding: Space.s6,
  },
  scrollBody: {
    paddingHorizontal: Space.s20,
    paddingBottom: Space.s16,
  },
  amountCard: {
    padding: Space.s16,
    borderRadius: Radius.card,
    borderWidth: Hairline,
    alignItems: 'center',
    marginBottom: Space.s16,
  },
  currencyLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  amountInputRow: {
    marginVertical: Space.s8,
  },
  amountInput: {
    fontFamily: Fonts.sansSemi,
    fontSize: 38,
    textAlign: 'center',
    minWidth: 160,
    fontVariant: ['tabular-nums'],
  },
  quickAmountRow: {
    flexDirection: 'row',
    gap: Space.s8,
    marginTop: Space.s4,
  },
  quickAmountChip: {
    paddingVertical: Space.s4,
    paddingHorizontal: Space.s10,
    borderRadius: Radius.pill,
    borderWidth: Hairline,
  },
  quickAmountText: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemi,
    fontSize: 11,
    letterSpacing: 0.6,
    marginBottom: Space.s8,
  },
  subSectionLabel: {
    fontFamily: Fonts.sansSemi,
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: Space.s6,
  },
  categoryScroll: {
    gap: Space.s8,
    paddingBottom: Space.s12,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.s8,
    paddingHorizontal: Space.s12,
    borderRadius: Radius.pill,
    borderWidth: Hairline,
    gap: 6,
  },
  categoryChipText: {
    fontSize: 13,
  },
  presetsWrap: {
    marginBottom: Space.s14,
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.s6,
  },
  presetChip: {
    paddingVertical: 5,
    paddingHorizontal: Space.s10,
    borderRadius: Radius.pill,
    borderWidth: Hairline,
  },
  presetChipText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  fieldGroup: {
    marginBottom: Space.s14,
  },
  fieldLabel: {
    fontFamily: Fonts.sansSemi,
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: Space.s6,
  },
  textInput: {
    height: 44,
    borderRadius: Radius.control,
    borderWidth: Hairline,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  paymentMethodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.s6,
  },
  pmChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: Space.s10,
    borderRadius: Radius.tag,
    borderWidth: Hairline,
  },
  pmChipText: {
    fontSize: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  dateChip: {
    paddingVertical: Space.s8,
    paddingHorizontal: Space.s12,
    borderRadius: Radius.control,
    borderWidth: Hairline,
  },
  dateChipText: {
    fontSize: 13,
  },
  dateInput: {
    flex: 1,
    height: 38,
    borderRadius: Radius.control,
    borderWidth: Hairline,
    paddingHorizontal: Space.s10,
    fontFamily: Fonts.mono,
    fontSize: 13,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Space.s10,
    borderRadius: Radius.control,
    gap: Space.s6,
    marginBottom: Space.s12,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  saveButton: {
    height: 48,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.s6,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontFamily: Fonts.sansSemi,
    fontSize: 15,
  },
});
