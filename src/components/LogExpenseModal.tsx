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
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Space, Radius, Fonts, Hairline } from '../theme/tokens';
import { triggerHaptic } from '../lib/haptics';
import { formatEtb, formatSantimForInput, parseEtbToSantim } from '../lib/money';
import { predictPersonalExpenseDefaults } from '../domain/ml/personalMl';
import {
  computeKeyboardSheetStyle,
  useKeyboardAwareScroll,
  useSafeAreaInsetsSafe,
} from '../lib/useKeyboardInset';
import {
  createPersonalCategory,
  createPersonalExpense,
  updatePersonalExpense,
} from '../services/personalExpenses';
import {
  CATEGORY_COLOR_PRESETS,
  CATEGORY_ICON_PRESETS,
  EXPENSE_CATEGORIES,
  getCategoryMeta,
  PAYMENT_METHODS,
  type ExpenseCategoryKey,
  type PaymentMethod,
  type PersonalCategory,
  type PersonalExpense,
} from '../types/personalExpense';

export interface LogExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (expense: PersonalExpense) => void;
  userId: string;
  initialExpense?: PersonalExpense | null;
  customCategories?: PersonalCategory[];
  expenseHistory?: PersonalExpense[];
  onCategoryCreated?: (newCategory: PersonalCategory) => void;
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
  customCategories?: PersonalCategory[];
  expenseHistory?: PersonalExpense[];
  onCategoryCreated?: (newCategory: PersonalCategory) => void;
}

const LogExpenseForm: React.FC<LogExpenseFormProps> = ({
  onClose,
  onSaved,
  userId,
  initialExpense,
  customCategories = [],
  expenseHistory = [],
  onCategoryCreated,
}) => {
  const { palette } = useTheme();

  const isEditing = Boolean(initialExpense);

  const [amountEtb, setAmountEtb] = useState(() =>
    initialExpense ? formatSantimForInput(initialExpense.amount_santim) : ''
  );
  const [category, setCategory] = useState<string>(() =>
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
  const [categoryManuallyPicked, setCategoryManuallyPicked] = useState(() =>
    Boolean(initialExpense)
  );
  const [paymentManuallyPicked, setPaymentManuallyPicked] = useState(() =>
    Boolean(initialExpense)
  );
  const [focusedField, setFocusedField] = useState<
    'amount' | 'catName' | 'title' | 'date' | 'note' | null
  >(null);

  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsetsSafe();
  const { scrollRef, keyboardHeight, handleInputFocus, scrollViewHandlers } =
    useKeyboardAwareScroll();

  const sheetLayout = useMemo(
    () =>
      computeKeyboardSheetStyle(
        keyboardHeight,
        windowHeight,
        insets.top,
        insets.bottom,
        0.92
      ),
    [keyboardHeight, windowHeight, insets.top, insets.bottom]
  );

  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [selectedPresetColor, setSelectedPresetColor] = useState(CATEGORY_COLOR_PRESETS[0]);
  const [selectedPresetIcon, setSelectedPresetIcon] = useState<keyof typeof Feather.glyphMap>('tag');
  const [creatingCategoryLoading, setCreatingCategoryLoading] = useState(false);
  const [createCategoryError, setCreateCategoryError] = useState<string | null>(null);

  const mlPrediction = useMemo(() => {
    if (isEditing || isCreatingCategory) return null;
    return predictPersonalExpenseDefaults({
      title,
      note,
      expenses: expenseHistory,
      customCategories,
    });
  }, [isEditing, isCreatingCategory, title, note, expenseHistory, customCategories]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setError(null);
    if (!isEditing && !isCreatingCategory) {
      const pred = predictPersonalExpenseDefaults({
        title: val,
        note,
        expenses: expenseHistory,
        customCategories,
      });
      if (pred && pred.categoryConfidence >= 0.72 && !categoryManuallyPicked) {
        setCategory(pred.suggestedCategory);
      }
    }
  };

  const applyMlPrediction = () => {
    if (!mlPrediction) return;
    triggerHaptic('selection');
    setCategory(mlPrediction.suggestedCategory);
    setCategoryManuallyPicked(true);
    if (mlPrediction.suggestedPaymentMethod) {
      setPaymentMethod(mlPrediction.suggestedPaymentMethod);
      setPaymentManuallyPicked(true);
    }
    if (!amountEtb.trim() && mlPrediction.suggestedAmountSantim) {
      setAmountEtb(formatSantimForInput(mlPrediction.suggestedAmountSantim));
    }
  };

  const activeCategoryMeta = useMemo(() => {
    return getCategoryMeta(category, customCategories);
  }, [category, customCategories]);

  const activePresets = useMemo(() => {
    const std = EXPENSE_CATEGORIES[category as ExpenseCategoryKey];
    return std ? std.popularPresets : [];
  }, [category]);

  const handleSelectPreset = (preset: string) => {
    triggerHaptic('selection');
    setTitle(preset);
    const match = preset.match(/(\d+)\s*ETB/i);
    if (match && !amountEtb) {
      setAmountEtb(match[1]);
    }
  };

  const handleCreateCategory = async () => {
    const clean = newCatName.trim();
    if (!clean) {
      setCreateCategoryError('Please enter a category name');
      return;
    }
    setCreatingCategoryLoading(true);
    setCreateCategoryError(null);
    triggerHaptic('impact');

    try {
      const created = await createPersonalCategory(userId, {
        name: clean,
        icon: selectedPresetIcon,
        color: selectedPresetColor.color,
        bgColor: selectedPresetColor.bgColor,
      });
      triggerHaptic('success');
      onCategoryCreated?.(created);
      setCategory(created.name);
      setIsCreatingCategory(false);
      setNewCatName('');
    } catch (err) {
      setCreateCategoryError(
        err instanceof Error ? err.message : 'Failed to create category'
      );
    } finally {
      setCreatingCategoryLoading(false);
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
        {
          backgroundColor: palette.cardElevated,
          borderColor: palette.border,
          maxHeight: sheetLayout.maxHeight,
          paddingBottom: sheetLayout.paddingBottom,
        },
      ]}
    >
      <View style={[styles.handle, { backgroundColor: palette.borderStrong }]} />

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
              Private to you · Never shared with partner
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
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
        {...scrollViewHandlers}
      >
        {/* Amount Input Hero */}
        <View
          style={[
            styles.amountCard,
            {
              backgroundColor: palette.background,
              borderColor: focusedField === 'amount' ? palette.primary : palette.borderStrong,
              borderWidth: focusedField === 'amount' ? 1.5 : 1,
            },
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
              onFocus={(e) => {
                setFocusedField('amount');
                handleInputFocus(e.currentTarget);
              }}
              onBlur={() => setFocusedField((prev) => (prev === 'amount' ? null : prev))}
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
        <View style={styles.categorySectionHeader}>
          <Text style={[styles.sectionLabel, { color: palette.textSecondary, marginBottom: 0 }]}>
            Category
          </Text>
          <Pressable
            testID="toggle-new-category-btn"
            style={styles.newCatLink}
            onPress={() => {
              triggerHaptic('selection');
              setIsCreatingCategory((prev) => !prev);
            }}
          >
            <Feather
              name={isCreatingCategory ? 'x-circle' : 'plus-circle'}
              size={13}
              color={palette.primary}
            />
            <Text style={[styles.newCatLinkText, { color: palette.primary }]}>
              {isCreatingCategory ? 'Cancel' : 'New Category'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {/* Custom Categories First */}
          {customCategories.map((custom) => {
            const isSelected =
              category.toLowerCase() === custom.name.toLowerCase() || category === custom.id;
            return (
              <Pressable
                key={custom.id}
                testID={`custom-cat-chip-${custom.name}`}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: isSelected ? custom.bg_color : palette.surface,
                    borderColor: isSelected ? custom.color : palette.border,
                  },
                ]}
                onPress={() => {
                  triggerHaptic('selection');
                  setCategory(custom.name);
                  setCategoryManuallyPicked(true);
                }}
              >
                <Feather
                  name={custom.icon || 'tag'}
                  size={15}
                  color={isSelected ? custom.color : palette.textMuted}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    {
                      color: isSelected ? custom.color : palette.textPrimary,
                      fontFamily: isSelected ? Fonts.sansSemi : Fonts.sans,
                    },
                  ]}
                >
                  {custom.name}
                </Text>
              </Pressable>
            );
          })}

          {/* Standard Predefined Categories */}
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
                  setCategoryManuallyPicked(true);
                  if (activePresets.includes(title)) {
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

        {/* Inline Custom Category Creator Card */}
        {isCreatingCategory && (
          <View
            testID="create-category-card"
            style={[
              styles.createCatCard,
              { backgroundColor: palette.surface, borderColor: palette.borderStrong },
            ]}
          >
            <View style={styles.createCatHeader}>
              <Text style={[styles.createCatTitle, { color: palette.textPrimary }]}>
                New Custom Category
              </Text>
              <Pressable onPress={() => setIsCreatingCategory(false)} hitSlop={8}>
                <Feather name="x" size={15} color={palette.textMuted} />
              </Pressable>
            </View>

            <TextInput
              testID="new-category-name-input"
              style={[
                styles.textInput,
                {
                  backgroundColor: palette.background,
                  borderColor:
                    focusedField === 'catName' ? palette.primary : palette.borderStrong,
                  borderWidth: focusedField === 'catName' ? 1.5 : 1,
                  color: palette.textPrimary,
                  marginBottom: Space.s10,
                },
              ]}
              placeholder="e.g. Gym, Church / Tithe, Pet Care, Repairs"
              placeholderTextColor={palette.textMuted}
              value={newCatName}
              onFocus={(e) => {
                setFocusedField('catName');
                handleInputFocus(e.currentTarget);
              }}
              onBlur={() => setFocusedField((prev) => (prev === 'catName' ? null : prev))}
              onChangeText={(val) => {
                setNewCatName(val);
                setCreateCategoryError(null);
              }}
              autoFocus
            />

            {/* Color Presets */}
            <Text style={[styles.subSectionLabel, { color: palette.textSecondary }]}>
              Category color
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.colorPresetsRow}
            >
              {CATEGORY_COLOR_PRESETS.map((cp) => {
                const isPicked = selectedPresetColor.color === cp.color;
                return (
                  <Pressable
                    key={cp.color}
                    style={[
                      styles.colorBubble,
                      { backgroundColor: cp.color },
                      isPicked && styles.colorBubbleSelected,
                    ]}
                    onPress={() => {
                      triggerHaptic('selection');
                      setSelectedPresetColor(cp);
                    }}
                  >
                    {isPicked && <Feather name="check" size={12} color="#FFFFFF" />}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Icon Presets */}
            <Text
              style={[
                styles.subSectionLabel,
                { color: palette.textSecondary, marginTop: Space.s8 },
              ]}
            >
              Category icon
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.iconPresetsRow}
            >
              {CATEGORY_ICON_PRESETS.map((ic) => {
                const isPicked = selectedPresetIcon === ic;
                return (
                  <Pressable
                    key={ic}
                    style={[
                      styles.iconBubble,
                      {
                        backgroundColor: isPicked
                          ? selectedPresetColor.bgColor
                          : palette.surface,
                        borderColor: isPicked
                          ? selectedPresetColor.color
                          : palette.border,
                      },
                    ]}
                    onPress={() => {
                      triggerHaptic('selection');
                      setSelectedPresetIcon(ic);
                    }}
                  >
                    <Feather
                      name={ic}
                      size={15}
                      color={isPicked ? selectedPresetColor.color : palette.textMuted}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            {createCategoryError && (
              <Text style={styles.catErrorText}>{createCategoryError}</Text>
            )}

            <Pressable
              testID="save-custom-category-btn"
              disabled={creatingCategoryLoading}
              style={[
                styles.createCatSaveBtn,
                {
                  backgroundColor: selectedPresetColor.color,
                  opacity: creatingCategoryLoading ? 0.6 : 1,
                },
              ]}
              onPress={handleCreateCategory}
            >
              {creatingCategoryLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={styles.btnInner}>
                  <Feather
                    name="check"
                    size={14}
                    color="#FFFFFF"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.createCatSaveBtnText}>Save & Select Category</Text>
                </View>
              )}
            </Pressable>
          </View>
        )}

        {/* Quick Presets */}
        {activePresets.length > 0 && (
          <View style={styles.presetsWrap}>
            <Text style={[styles.subSectionLabel, { color: palette.textSecondary }]}>
              Popular in {activeCategoryMeta.label}
            </Text>
            <View style={styles.presetChipsRow}>
              {activePresets.map((preset) => (
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
                        color:
                          title === preset ? activeCategoryMeta.color : palette.textPrimary,
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
          <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>
            Description / Item
          </Text>
          <TextInput
            testID="expense-title-input"
            style={[
              styles.textInput,
              {
                backgroundColor: palette.background,
                borderColor: focusedField === 'title' ? palette.primary : palette.borderStrong,
                borderWidth: focusedField === 'title' ? 1.5 : 1,
                color: palette.textPrimary,
              },
            ]}
            placeholder={`e.g. ${activePresets[0] ?? activeCategoryMeta.label ?? 'Expense'}`}
            placeholderTextColor={palette.textMuted}
            value={title}
            onFocus={(e) => {
              setFocusedField('title');
              handleInputFocus(e.currentTarget);
            }}
            onBlur={() => setFocusedField((prev) => (prev === 'title' ? null : prev))}
            onChangeText={handleTitleChange}
          />
          {mlPrediction &&
          (mlPrediction.suggestedCategory.toLowerCase() !== category.toLowerCase() ||
            (mlPrediction.suggestedPaymentMethod &&
              !paymentManuallyPicked &&
              mlPrediction.suggestedPaymentMethod !== paymentMethod) ||
            (!amountEtb.trim() && mlPrediction.suggestedAmountSantim !== null)) ? (
            <Pressable
              testID="ml-suggestion-pill"
              style={({ pressed }) => [
                styles.mlHintRow,
                {
                  backgroundColor: palette.primaryLight,
                  borderColor: palette.primary,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              onPress={applyMlPrediction}
            >
              <Feather name="zap" size={13} color={palette.primary} />
              <Text style={[styles.mlHintText, { color: palette.primary }]} numberOfLines={1}>
                Learned match: {mlPrediction.suggestedCategoryLabel}
                {mlPrediction.suggestedPaymentMethod
                  ? ` · ${PAYMENT_METHODS.find((m) => m.key === mlPrediction.suggestedPaymentMethod)?.label ?? mlPrediction.suggestedPaymentMethod}`
                  : ''}
                {!amountEtb.trim() && mlPrediction.suggestedAmountSantim
                  ? ` · ~${formatEtb(mlPrediction.suggestedAmountSantim)}`
                  : ''}
              </Text>
              <Text style={[styles.mlApplyLabel, { color: palette.primary }]}>Apply</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Payment Method Pills */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>
            Paid via
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
                    setPaymentManuallyPicked(true);
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
          <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>
            Date
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
                  backgroundColor: palette.background,
                  borderColor: focusedField === 'date' ? palette.primary : palette.borderStrong,
                  borderWidth: focusedField === 'date' ? 1.5 : 1,
                  color: palette.textPrimary,
                },
              ]}
              value={expenseDate}
              onFocus={(e) => {
                setFocusedField('date');
                handleInputFocus(e.currentTarget);
              }}
              onBlur={() => setFocusedField((prev) => (prev === 'date' ? null : prev))}
              onChangeText={setExpenseDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.textMuted}
            />
          </View>
        </View>

        {/* Note Input */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>
            Note (optional)
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: palette.background,
                borderColor: focusedField === 'note' ? palette.primary : palette.borderStrong,
                borderWidth: focusedField === 'note' ? 1.5 : 1,
                color: palette.textPrimary,
              },
            ]}
            placeholder="Add details (e.g. from Kazanchis to Bole)"
            placeholderTextColor={palette.textMuted}
            value={note}
            onFocus={(e) => {
              setFocusedField('note');
              handleInputFocus(e.currentTarget);
            }}
            onBlur={() => setFocusedField((prev) => (prev === 'note' ? null : prev))}
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
  customCategories = [],
  expenseHistory = [],
  onCategoryCreated,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior="padding"
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        {visible ? (
          <LogExpenseForm
            key={initialExpense?.id ?? 'new-expense'}
            onClose={onClose}
            onSaved={onSaved}
            userId={userId}
            initialExpense={initialExpense}
            customCategories={customCategories}
            expenseHistory={expenseHistory}
            onCategoryCreated={onCategoryCreated}
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
    paddingTop: Space.s12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Space.s4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.s20,
    paddingTop: Space.s8,
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
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: Space.s16,
  },
  currencyLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
  },
  amountInputRow: {
    marginVertical: Space.s8,
  },
  amountInput: {
    fontFamily: Fonts.sansSemi,
    fontSize: 38,
    textAlign: 'center',
    minWidth: 160,
    paddingVertical: 0,
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
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    marginBottom: Space.s8,
  },
  subSectionLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
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
    marginBottom: Space.s16,
  },
  fieldLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    marginBottom: Space.s8,
  },
  textInput: {
    height: 44,
    borderRadius: Radius.control,
    borderWidth: 1,
    paddingHorizontal: Space.s12,
    paddingVertical: 0,
    textAlignVertical: 'center',
    fontFamily: Fonts.sans,
    fontSize: 15,
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
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: Space.s12,
    borderRadius: Radius.control,
    borderWidth: Hairline,
  },
  dateChipText: {
    fontSize: 13,
  },
  dateInput: {
    flex: 1,
    height: 44,
    borderRadius: Radius.control,
    borderWidth: 1,
    paddingHorizontal: Space.s12,
    paddingVertical: 0,
    textAlignVertical: 'center',
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
  categorySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.s8,
  },
  newCatLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  newCatLinkText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
  },
  createCatCard: {
    padding: Space.s12,
    borderRadius: Radius.card,
    borderWidth: Hairline,
    marginBottom: Space.s14,
  },
  createCatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.s8,
  },
  createCatTitle: {
    fontFamily: Fonts.sansSemi,
    fontSize: 13,
  },
  colorPresetsRow: {
    flexDirection: 'row',
    gap: Space.s8,
    paddingVertical: Space.s4,
  },
  colorBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorBubbleSelected: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  iconPresetsRow: {
    flexDirection: 'row',
    gap: Space.s8,
    paddingVertical: Space.s4,
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: Radius.control,
    borderWidth: Hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catErrorText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: '#DC2626',
    marginTop: Space.s6,
  },
  createCatSaveBtn: {
    height: 38,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.s10,
  },
  createCatSaveBtnText: {
    color: '#FFFFFF',
    fontFamily: Fonts.sansSemi,
    fontSize: 13,
  },
  mlHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s6,
    marginTop: Space.s8,
    paddingHorizontal: Space.s10,
    paddingVertical: Space.s8,
    borderRadius: Radius.control,
    borderWidth: 1,
  },
  mlHintText: {
    flex: 1,
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
  },
  mlApplyLabel: {
    fontFamily: Fonts.sansSemi,
    fontSize: 12,
  },
});
