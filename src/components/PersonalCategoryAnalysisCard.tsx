import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MonthlyCategoryStats } from '../domain/personalAnalytics';
import { formatEtb } from '../lib/money';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Hairline, Radius, Space } from '../theme/tokens';
import {
  PAYMENT_METHODS,
  type PersonalCategory,
  type PersonalExpense,
  getCategoryMeta,
} from '../types/personalExpense';

export interface PersonalCategoryAnalysisCardProps {
  categoryStat: MonthlyCategoryStats;
  purchases: PersonalExpense[];
  customCategories?: PersonalCategory[];
  expanded: boolean;
  onToggle: (categoryKey: string) => void;
  onPressPurchase?: (expense: PersonalExpense) => void;
}

export const PersonalCategoryAnalysisCard: React.FC<PersonalCategoryAnalysisCardProps> = ({
  categoryStat,
  purchases,
  customCategories = [],
  expanded,
  onToggle,
  onPressPurchase,
}) => {
  const { palette } = useTheme();
  const meta = getCategoryMeta(categoryStat.category, customCategories);
  const hasPurchases = purchases.length > 0;
  const purchaseLabel = categoryStat.count === 1 ? '1 purchase' : `${categoryStat.count} purchases`;

  return (
    <View
      testID={`analysis-category-card-${categoryStat.category}`}
      style={[
        styles.card,
        {
          backgroundColor: palette.cardElevated,
          borderColor: expanded ? palette.primary : palette.borderStrong,
        },
      ]}
    >
      <Pressable
        testID={`analysis-category-toggle-${categoryStat.category}`}
        disabled={!hasPurchases}
        accessibilityRole="button"
        accessibilityLabel={`${categoryStat.label}, ${purchaseLabel}, ${formatEtb(categoryStat.totalSantim)}`}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [
          styles.headerPressable,
          pressed && hasPurchases && { opacity: 0.78 },
        ]}
        onPress={() => {
          if (hasPurchases) {
            onToggle(categoryStat.category);
          }
        }}
      >
        <View style={styles.topRow}>
          <View style={styles.catLeft}>
            <View
              style={[
                styles.catIconWrap,
                { backgroundColor: categoryStat.bgColor || meta.bgColor },
              ]}
            >
              <Feather
                name={categoryStat.icon || meta.icon}
                size={16}
                color={categoryStat.color || meta.color}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.catName, { color: palette.textPrimary }]} numberOfLines={1}>
                {categoryStat.label}
              </Text>
              <Text style={[styles.catSub, { color: palette.textMuted }]}>
                {purchaseLabel} · {categoryStat.pctOfTotal}% of total
              </Text>
            </View>
          </View>

          <View style={styles.catRight}>
            <View style={styles.amountRow}>
              <Text style={[styles.catAmount, { color: palette.textPrimary }]}>
                {formatEtb(categoryStat.totalSantim)}
              </Text>
              {hasPurchases ? (
                <Feather
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={expanded ? palette.primary : palette.textMuted}
                  style={{ marginLeft: Space.s4 }}
                />
              ) : null}
            </View>
            {categoryStat.changeFromLastMonthPct !== null ? (
              <Text
                style={[
                  styles.catDiff,
                  {
                    color:
                      categoryStat.changeFromLastMonthPct > 0
                        ? palette.danger
                        : categoryStat.changeFromLastMonthPct < 0
                        ? palette.primary
                        : palette.textMuted,
                  },
                ]}
              >
                {categoryStat.changeFromLastMonthPct > 0 ? '+' : ''}
                {categoryStat.changeFromLastMonthPct.toFixed(0)}% vs last mo
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.progressBarTrack, { backgroundColor: palette.surfaceMuted }]}>
          <View
            style={[
              styles.progressBarFill,
              {
                width:
                  categoryStat.totalSantim > 0
                    ? `${Math.min(100, Math.max(4, categoryStat.pctOfTotal))}%`
                    : '0%',
                backgroundColor: categoryStat.color || meta.color,
              },
            ]}
          />
        </View>
      </Pressable>

      {expanded && hasPurchases ? (
        <View
          testID={`analysis-category-purchases-${categoryStat.category}`}
          style={[
            styles.purchasesWrap,
            {
              backgroundColor: palette.background,
              borderColor: palette.border,
            },
          ]}
        >
          {purchases.map((item, idx) => {
            const pmLabel =
              PAYMENT_METHODS.find((m) => m.key === item.payment_method)?.label ??
              item.payment_method;
            return (
              <Pressable
                key={item.id}
                testID={`analysis-purchase-row-${item.id}`}
                style={({ pressed }) => [
                  styles.purchaseRow,
                  idx < purchases.length - 1 && {
                    borderBottomWidth: Hairline,
                    borderBottomColor: palette.border,
                  },
                  pressed && { opacity: 0.72 },
                ]}
                onPress={() => onPressPurchase?.(item)}
              >
                <View style={styles.purchaseLeft}>
                  <Text
                    style={[styles.purchaseTitle, { color: palette.textPrimary }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={[styles.purchaseMeta, { color: palette.textMuted }]}
                    numberOfLines={1}
                  >
                    {item.expense_date} · {pmLabel}
                    {item.note ? ` · ${item.note}` : ''}
                  </Text>
                </View>

                <View style={styles.purchaseRight}>
                  <Text style={[styles.purchaseAmount, { color: palette.textPrimary }]}>
                    {formatEtb(item.amount_santim)}
                  </Text>
                  <Feather name="chevron-right" size={14} color={palette.textMuted} />
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: Space.s12,
    borderRadius: Radius.card,
    borderWidth: 1,
    marginBottom: Space.s8,
  },
  headerPressable: {
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.s8,
    gap: Space.s8,
  },
  catLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s10,
    flex: 1,
  },
  catIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: {
    fontFamily: Fonts.sansSemi,
    fontSize: 14,
  },
  catSub: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  catRight: {
    alignItems: 'flex-end',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catAmount: {
    fontFamily: Fonts.sansSemi,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  catDiff: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  progressBarTrack: {
    height: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  purchasesWrap: {
    marginTop: Space.s12,
    borderRadius: Radius.control,
    borderWidth: 1,
    overflow: 'hidden',
  },
  purchaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s10,
    gap: Space.s8,
  },
  purchaseLeft: {
    flex: 1,
  },
  purchaseTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  purchaseMeta: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    marginTop: 2,
  },
  purchaseRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
  },
  purchaseAmount: {
    fontFamily: Fonts.monoMedium,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
