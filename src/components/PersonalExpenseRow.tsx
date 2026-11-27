import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Space, Radius, Fonts, Hairline } from '../theme/tokens';
import { formatEtb } from '../lib/money';
import {
  getCategoryMeta,
  PAYMENT_METHODS,
  type PersonalCategory,
  type PersonalExpense,
} from '../types/personalExpense';

export interface PersonalExpenseRowProps {
  expense: PersonalExpense;
  onPress?: (expense: PersonalExpense) => void;
  onDelete?: (expense: PersonalExpense) => void;
  customCategories?: PersonalCategory[];
}

export const PersonalExpenseRow: React.FC<PersonalExpenseRowProps> = ({
  expense,
  onPress,
  onDelete,
  customCategories,
}) => {
  const { palette } = useTheme();

  const categoryMeta = getCategoryMeta(expense.category, customCategories);
  const paymentMeta = PAYMENT_METHODS.find((p) => p.key === expense.payment_method);
  const isPendingSync = expense.id.startsWith('local_');

  return (
    <Pressable
      testID={`expense-row-${expense.id}`}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: palette.cardElevated,
          borderColor: palette.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      onPress={() => onPress?.(expense)}
    >
      <View style={[styles.iconWrap, { backgroundColor: categoryMeta.bgColor }]}>
        <Feather name={categoryMeta.icon} size={20} color={categoryMeta.color} />
      </View>

      <View style={styles.contentWrap}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, { color: palette.textPrimary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {expense.title}
          </Text>
          <Text style={[styles.amount, { color: palette.textPrimary }]}>
            {formatEtb(expense.amount_santim)}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.subLeft}>
            <View
              style={[
                styles.methodBadge,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              {paymentMeta?.icon && (
                <Feather
                  name={paymentMeta.icon}
                  size={10}
                  color={palette.textMuted}
                  style={styles.methodIcon}
                />
              )}
              <Text style={[styles.methodText, { color: palette.textMuted }]}>
                {paymentMeta?.label ?? expense.payment_method}
              </Text>
            </View>

            {expense.note ? (
              <Text
                style={[styles.noteText, { color: palette.textMuted }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {expense.note}
              </Text>
            ) : null}

            {isPendingSync && (
              <View style={[styles.pendingBadge, { backgroundColor: '#FEF3C7' }]}>
                <Feather name="cloud-off" size={10} color="#D97706" />
                <Text style={styles.pendingText}>Offline</Text>
              </View>
            )}
          </View>

          <View style={styles.subRight}>
            <Text style={[styles.dateText, { color: palette.textMuted }]}>
              {expense.expense_date}
            </Text>
            {onDelete && (
              <Pressable
                testID={`delete-expense-${expense.id}`}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.deleteButton,
                  { opacity: pressed ? 0.5 : 0.8 },
                ]}
                onPress={() => onDelete(expense)}
              >
                <Feather name="trash-2" size={14} color={palette.textMuted} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.s12,
    paddingHorizontal: Space.s14,
    borderRadius: Radius.card,
    borderWidth: Hairline,
    marginBottom: Space.s8,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Space.s12,
  },
  contentWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.s4,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    marginRight: Space.s8,
  },
  amount: {
    fontFamily: Fonts.sansSemi,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Space.s8,
  },
  subRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.s6,
    paddingVertical: 2,
    borderRadius: Radius.tag,
    borderWidth: Hairline,
    marginRight: Space.s6,
  },
  methodIcon: {
    marginRight: 4,
  },
  methodText: {
    fontFamily: Fonts.sans,
    fontSize: 11,
  },
  noteText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    flex: 1,
    marginRight: Space.s4,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.s6,
    paddingVertical: 2,
    borderRadius: Radius.tag,
    gap: 3,
  },
  pendingText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 10,
    color: '#D97706',
  },
  dateText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    marginRight: Space.s8,
  },
  deleteButton: {
    padding: Space.s4,
  },
});
