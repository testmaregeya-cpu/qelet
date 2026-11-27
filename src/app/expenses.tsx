import Feather from '@expo/vector-icons/Feather';
import { Redirect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBottomNav } from '../components/AppBottomNav';
import { LogExpenseModal } from '../components/LogExpenseModal';
import { PersonalExpenseRow } from '../components/PersonalExpenseRow';
import {
  computeMonthlyPersonalAnalytics,
  getAvailableExpenseMonths,
} from '../domain/personalAnalytics';
import { getAddisAbabaDateString } from '../domain/billing';
import { triggerHaptic } from '../lib/haptics';
import { formatEtb } from '../lib/money';
import { isSuperAdmin } from '../lib/shopRules';
import {
  deletePersonalExpense,
  fetchPersonalCategories,
  fetchPersonalExpenses,
  syncPersonalExpensesQueue,
} from '../services/personalExpenses';
import { useSession } from '../state/SessionContext';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Hairline, Radius, Space } from '../theme/tokens';
import {
  EXPENSE_CATEGORIES,
  getCategoryMeta,
  PAYMENT_METHODS,
  type ExpenseCategoryKey,
  type PersonalCategory,
  type PersonalExpense,
} from '../types/personalExpense';

export default function ExpensesScreen() {
  const { palette } = useTheme();
  const { loading, session, householdContext } = useSession();

  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [customCategories, setCustomCategories] = useState<PersonalCategory[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'transactions' | 'analysis'>('transactions');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<PersonalExpense | null>(null);

  const userId = session?.user?.id ?? null;
  const todayStr = useMemo(() => getAddisAbabaDateString(), []);
  const currentYm = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  const loadExpenses = useCallback(async () => {
    if (!userId) return;
    try {
      void syncPersonalExpensesQueue(userId).catch(() => undefined);
      const [expData, catData] = await Promise.all([
        fetchPersonalExpenses(userId),
        fetchPersonalCategories(userId),
      ]);
      setExpenses(expData);
      setCustomCategories(catData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personal expenses');
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    void (async () => {
      try {
        void syncPersonalExpensesQueue(userId).catch(() => undefined);
        const [expData, catData] = await Promise.all([
          fetchPersonalExpenses(userId),
          fetchPersonalCategories(userId),
        ]);
        if (active) {
          setExpenses(expData);
          setCustomCategories(catData);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load personal expenses');
        }
      } finally {
        if (active) {
          setLoadingData(false);
          setRefreshing(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  const onRefresh = useCallback(async () => {
    triggerHaptic('impact');
    setRefreshing(true);
    await loadExpenses();
  }, [loadExpenses]);

  const availableMonths = useMemo(
    () => getAvailableExpenseMonths(expenses, todayStr),
    [expenses, todayStr]
  );

  const activeMonth = selectedMonth && availableMonths.includes(selectedMonth)
    ? selectedMonth
    : availableMonths[0] ?? currentYm;

  const currentMonthExpenses = useMemo(
    () => expenses.filter((e) => e.expense_date.startsWith(activeMonth)),
    [expenses, activeMonth]
  );

  const analytics = useMemo(
    () =>
      computeMonthlyPersonalAnalytics(
        expenses,
        activeMonth,
        todayStr,
        customCategories
      ),
    [expenses, activeMonth, todayStr, customCategories]
  );

  const availableFilterCategories = useMemo(() => {
    const list: {
      key: string;
      label: string;
      icon: keyof typeof Feather.glyphMap;
      color: string;
      bgColor: string;
    }[] = [];

    // Custom categories first
    for (const custom of customCategories) {
      list.push({
        key: custom.name,
        label: custom.name,
        icon: custom.icon || 'tag',
        color: custom.color || '#0284C7',
        bgColor: custom.bg_color || '#E0F2FE',
      });
    }

    // Predefined standard categories
    for (const catKey of Object.keys(EXPENSE_CATEGORIES) as ExpenseCategoryKey[]) {
      const meta = EXPENSE_CATEGORIES[catKey];
      list.push({
        key: catKey,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        bgColor: meta.bgColor,
      });
    }

    return list;
  }, [customCategories]);

  const filteredExpenses = useMemo(() => {
    let result = currentMonthExpenses;

    if (categoryFilter !== 'all') {
      result = result.filter(
        (e) => e.category.toLowerCase() === categoryFilter.toLowerCase()
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.note?.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q)
      );
    }

    return result;
  }, [currentMonthExpenses, categoryFilter, searchQuery]);

  const handleDeleteExpense = (expense: PersonalExpense) => {
    triggerHaptic('impact');
    Alert.alert(
      'Delete Expense',
      `Are you sure you want to delete "${expense.title}" (${formatEtb(expense.amount_santim)})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!session?.user?.id) return;
            try {
              triggerHaptic('success');
              await deletePersonalExpense(session.user.id, expense.id);
              setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Could not delete');
            }
          },
        },
      ]
    );
  };

  const handleEditExpense = (expense: PersonalExpense) => {
    triggerHaptic('selection');
    setEditingExpense(expense);
    setModalVisible(true);
  };

  const handleOpenAddModal = () => {
    triggerHaptic('impact');
    setEditingExpense(null);
    setModalVisible(true);
  };

  const handleExpenseSaved = (saved: PersonalExpense) => {
    setExpenses((prev) => {
      const exists = prev.some((e) => e.id === saved.id);
      if (exists) {
        return prev.map((e) => (e.id === saved.id ? saved : e));
      }
      return [saved, ...prev];
    });
  };

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }
  if (!loading && !householdContext) {
    return <Redirect href="/link-household" />;
  }
  if (!session || !householdContext) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </SafeAreaView>
    );
  }

  const adminUser = isSuperAdmin(householdContext.currentMember.role);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Screen Header */}
        <View style={styles.topHeader}>
          <View>
            <View style={styles.headerTitleRow}>
              <Text style={[styles.screenTitle, { color: palette.textPrimary }]}>Personal Spend</Text>
              <View style={[styles.privacyBadge, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Feather name="lock" size={11} color={palette.textMuted} style={{ marginRight: 4 }} />
                <Text style={[styles.privacyBadgeText, { color: palette.textMuted }]}>Private</Text>
              </View>
            </View>
            <Text style={[styles.screenSubtitle, { color: palette.textMuted }]}>
              Logged only for you • Zero partner visibility
            </Text>
          </View>

          <Pressable
            testID="open-log-expense-btn"
            style={({ pressed }) => [
              styles.primaryLogBtn,
              { backgroundColor: palette.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={handleOpenAddModal}
          >
            <Feather name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.primaryLogBtnText}>Log Spend</Text>
          </Pressable>
        </View>

        {/* Month Selector Carousel */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthScroll}
        >
          {availableMonths.map((ym) => {
            const isSelected = ym === activeMonth;
            const [y, m] = ym.split('-');
            const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
            const label = dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            return (
              <Pressable
                key={ym}
                style={[
                  styles.monthPill,
                  {
                    backgroundColor: isSelected ? palette.textPrimary : palette.cardElevated,
                    borderColor: isSelected ? palette.textPrimary : palette.border,
                  },
                ]}
                onPress={() => {
                  triggerHaptic('selection');
                  setSelectedMonth(ym);
                }}
              >
                <Text
                  style={[
                    styles.monthPillText,
                    {
                      color: isSelected ? palette.background : palette.textPrimary,
                      fontFamily: isSelected ? Fonts.sansSemi : Fonts.sans,
                    },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Hero Card */}
        <View style={[styles.heroCard, { backgroundColor: palette.cardElevated, borderColor: palette.border }]}>
          <View style={styles.heroTopRow}>
            <Text style={[styles.heroPeriodLabel, { color: palette.textMuted }]}>
              {analytics.monthLabel.toUpperCase()} SPENDING
            </Text>
            {analytics.momChangePct !== null && (
              <View
                style={[
                  styles.momBadge,
                  {
                    backgroundColor:
                      analytics.momChangePct > 0
                        ? '#FEE2E2'
                        : analytics.momChangePct < 0
                        ? '#DCFCE7'
                        : palette.surface,
                  },
                ]}
              >
                <Feather
                  name={
                    analytics.momChangePct > 0
                      ? 'trending-up'
                      : analytics.momChangePct < 0
                      ? 'trending-down'
                      : 'minus'
                  }
                  size={12}
                  color={
                    analytics.momChangePct > 0
                      ? '#DC2626'
                      : analytics.momChangePct < 0
                      ? '#16A34A'
                      : palette.textMuted
                  }
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.momBadgeText,
                    {
                      color:
                        analytics.momChangePct > 0
                          ? '#DC2626'
                          : analytics.momChangePct < 0
                          ? '#16A34A'
                          : palette.textMuted,
                    },
                  ]}
                >
                  {analytics.momChangePct > 0 ? '+' : ''}
                  {analytics.momChangePct.toFixed(1)}% vs last month
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.heroAmount, { color: palette.textPrimary }]}>
            {formatEtb(analytics.totalSpentSantim)}
          </Text>

          {/* Sub metrics */}
          <View style={[styles.heroMetricsRow, { borderTopColor: palette.border }]}>
            <View style={styles.heroMetricCol}>
              <Text style={[styles.heroMetricLabel, { color: palette.textMuted }]}>Daily Burn</Text>
              <Text style={[styles.heroMetricValue, { color: palette.textPrimary }]}>
                {formatEtb(analytics.dailyAverageSantim)}/day
              </Text>
            </View>

            <View style={styles.heroMetricDivider} />

            <View style={styles.heroMetricCol}>
              <Text style={[styles.heroMetricLabel, { color: palette.textMuted }]}>Projected Month End</Text>
              <Text style={[styles.heroMetricValue, { color: palette.textPrimary }]}>
                {formatEtb(analytics.projectedMonthEndSantim)}
              </Text>
            </View>

            <View style={styles.heroMetricDivider} />

            <View style={styles.heroMetricCol}>
              <Text style={[styles.heroMetricLabel, { color: palette.textMuted }]}>Items Logged</Text>
              <Text style={[styles.heroMetricValue, { color: palette.textPrimary }]}>
                {analytics.expenseCount}
              </Text>
            </View>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={[styles.tabBar, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Pressable
            testID="tab-transactions"
            style={[
              styles.tabBtn,
              activeTab === 'transactions' && {
                backgroundColor: palette.cardElevated,
                borderColor: palette.border,
                borderWidth: Hairline,
              },
            ]}
            onPress={() => {
              triggerHaptic('selection');
              setActiveTab('transactions');
            }}
          >
            <Feather
              name="list"
              size={15}
              color={activeTab === 'transactions' ? palette.textPrimary : palette.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabBtnText,
                {
                  color: activeTab === 'transactions' ? palette.textPrimary : palette.textMuted,
                  fontFamily: activeTab === 'transactions' ? Fonts.sansSemi : Fonts.sans,
                },
              ]}
            >
              Transactions ({currentMonthExpenses.length})
            </Text>
          </Pressable>

          <Pressable
            testID="tab-analysis"
            style={[
              styles.tabBtn,
              activeTab === 'analysis' && {
                backgroundColor: palette.cardElevated,
                borderColor: palette.border,
                borderWidth: Hairline,
              },
            ]}
            onPress={() => {
              triggerHaptic('selection');
              setActiveTab('analysis');
            }}
          >
            <Feather
              name="pie-chart"
              size={15}
              color={activeTab === 'analysis' ? palette.textPrimary : palette.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabBtnText,
                {
                  color: activeTab === 'analysis' ? palette.textPrimary : palette.textMuted,
                  fontFamily: activeTab === 'analysis' ? Fonts.sansSemi : Fonts.sans,
                },
              ]}
            >
              Deep Analysis ({analytics.insights.length})
            </Text>
          </Pressable>
        </View>

        {/* Error message */}
        {error ? (
          <View style={[styles.errorCard, { backgroundColor: '#FEE2E2' }]}>
            <Feather name="alert-circle" size={15} color="#DC2626" />
            <Text style={styles.errorCardText}>{error}</Text>
          </View>
        ) : null}

        {/* TAB 1: TRANSACTIONS */}
        {activeTab === 'transactions' && (
          <View style={styles.transactionsWrap}>
            {/* Search Bar */}
            <View
              style={[
                styles.searchWrap,
                { backgroundColor: palette.cardElevated, borderColor: palette.border },
              ]}
            >
              <Feather name="search" size={16} color={palette.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                testID="expense-search-input"
                style={[styles.searchInput, { color: palette.textPrimary }]}
                placeholder="Search taxi, coffee, mobile card..."
                placeholderTextColor={palette.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Feather name="x-circle" size={16} color={palette.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {/* Category Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScroll}
            >
              <Pressable
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: categoryFilter === 'all' ? palette.primary : palette.cardElevated,
                    borderColor: categoryFilter === 'all' ? palette.primary : palette.border,
                  },
                ]}
                onPress={() => {
                  triggerHaptic('selection');
                  setCategoryFilter('all');
                }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: categoryFilter === 'all' ? '#FFFFFF' : palette.textPrimary,
                      fontFamily: categoryFilter === 'all' ? Fonts.sansSemi : Fonts.sans,
                    },
                  ]}
                >
                  All ({currentMonthExpenses.length})
                </Text>
              </Pressable>

              {availableFilterCategories.map((cat) => {
                const count = currentMonthExpenses.filter(
                  (e) => e.category.toLowerCase() === cat.key.toLowerCase()
                ).length;
                if (count === 0 && categoryFilter.toLowerCase() !== cat.key.toLowerCase()) {
                  return null;
                }
                const isSelected = categoryFilter.toLowerCase() === cat.key.toLowerCase();
                return (
                  <Pressable
                    key={cat.key}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: isSelected ? cat.bgColor : palette.cardElevated,
                        borderColor: isSelected ? cat.color : palette.border,
                      },
                    ]}
                    onPress={() => {
                      triggerHaptic('selection');
                      setCategoryFilter(isSelected ? 'all' : cat.key);
                    }}
                  >
                    <Feather
                      name={cat.icon}
                      size={12}
                      color={isSelected ? cat.color : palette.textMuted}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.filterChipText,
                        {
                          color: isSelected ? cat.color : palette.textPrimary,
                          fontFamily: isSelected ? Fonts.sansSemi : Fonts.sans,
                        },
                      ]}
                    >
                      {cat.label} ({count})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* List */}
            {loadingData ? (
              <ActivityIndicator style={{ marginVertical: 32 }} size="small" color={palette.primary} />
            ) : filteredExpenses.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: palette.cardElevated, borderColor: palette.border }]}>
                <View style={[styles.emptyIconCircle, { backgroundColor: palette.surface }]}>
                  <Feather name="inbox" size={28} color={palette.textMuted} />
                </View>
                <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>No expenses found</Text>
                <Text style={[styles.emptySubtitle, { color: palette.textMuted }]}>
                  {searchQuery || categoryFilter !== 'all'
                    ? 'Try clearing your search or category filter.'
                    : 'Tap "+ Log Spend" to record your personal daily spending.'}
                </Text>
              </View>
            ) : (
              filteredExpenses.map((expense) => (
                <PersonalExpenseRow
                  key={expense.id}
                  expense={expense}
                  customCategories={customCategories}
                  onPress={handleEditExpense}
                  onDelete={handleDeleteExpense}
                />
              ))
            )}
          </View>
        )}

        {/* TAB 2: DEEP ANALYSIS */}
        {activeTab === 'analysis' && (
          <View style={styles.analysisWrap}>
            {/* Smart Insights Cards */}
            <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
              Smart Spending Insights
            </Text>

            {analytics.insights.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: palette.cardElevated, borderColor: palette.border }]}>
                <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>Building Your Profile</Text>
                <Text style={[styles.emptySubtitle, { color: palette.textMuted }]}>
                  Log a few more items to unlock habit detection, splurge alerts, and shift trends.
                </Text>
              </View>
            ) : (
              analytics.insights.map((insight) => {
                const isAlert = insight.severity === 'alert';
                const isPos = insight.severity === 'positive';
                const badgeBg = isAlert ? '#FEE2E2' : isPos ? '#DCFCE7' : '#E0F2FE';
                const badgeColor = isAlert ? '#DC2626' : isPos ? '#16A34A' : '#0284C7';
                return (
                  <View
                    key={insight.id}
                    style={[
                      styles.insightCard,
                      { backgroundColor: palette.cardElevated, borderColor: palette.border },
                    ]}
                  >
                    <View style={styles.insightHeader}>
                      <View style={[styles.insightBadge, { backgroundColor: badgeBg }]}>
                        <Feather
                          name={
                            insight.type === 'surge'
                              ? 'alert-triangle'
                              : insight.type === 'frequent'
                              ? 'repeat'
                              : insight.type === 'top_item'
                              ? 'star'
                              : insight.type === 'saving'
                              ? 'trending-down'
                              : 'activity'
                          }
                          size={13}
                          color={badgeColor}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.insightBadgeText, { color: badgeColor }]}>
                          {insight.title}
                        </Text>
                      </View>
                      {insight.metric ? (
                        <Text style={[styles.insightMetric, { color: badgeColor }]}>
                          {insight.metric}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.insightBody, { color: palette.textPrimary }]}>
                      {insight.body}
                    </Text>
                  </View>
                );
              })
            )}

            {/* Category Breakdown Progress */}
            <Text style={[styles.sectionTitle, { color: palette.textPrimary, marginTop: Space.s20 }]}>
              Where Your Money Went
            </Text>

            {analytics.categories.length === 0 ? (
              <Text style={[styles.emptySubtitle, { color: palette.textMuted }]}>
                No category data available yet.
              </Text>
            ) : (
              analytics.categories.map((cat) => {
                const meta = getCategoryMeta(cat.category, customCategories);
                return (
                  <View
                    key={cat.category}
                    style={[
                      styles.categoryCard,
                      { backgroundColor: palette.cardElevated, borderColor: palette.border },
                    ]}
                  >
                    <View style={styles.categoryCardTop}>
                      <View style={styles.catLeft}>
                        <View
                          style={[
                            styles.catIconWrap,
                            { backgroundColor: cat.bgColor || meta.bgColor },
                          ]}
                        >
                          <Feather
                            name={cat.icon || meta.icon}
                            size={15}
                            color={cat.color || meta.color}
                          />
                        </View>
                        <View>
                          <Text style={[styles.catName, { color: palette.textPrimary }]}>
                            {cat.label}
                          </Text>
                          <Text style={[styles.catSub, { color: palette.textMuted }]}>
                            {cat.count} purchases • {cat.pctOfTotal}% of total
                          </Text>
                        </View>
                      </View>

                      <View style={styles.catRight}>
                        <Text style={[styles.catAmount, { color: palette.textPrimary }]}>
                          {formatEtb(cat.totalSantim)}
                        </Text>
                        {cat.changeFromLastMonthPct !== null && (
                          <Text
                            style={[
                              styles.catDiff,
                              {
                                color:
                                  cat.changeFromLastMonthPct > 0
                                    ? '#DC2626'
                                    : cat.changeFromLastMonthPct < 0
                                    ? '#16A34A'
                                    : palette.textMuted,
                              },
                            ]}
                          >
                            {cat.changeFromLastMonthPct > 0 ? '+' : ''}
                            {cat.changeFromLastMonthPct.toFixed(0)}% MoM
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Progress Bar */}
                    <View style={[styles.progressBarTrack, { backgroundColor: palette.surface }]}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(100, Math.max(4, cat.pctOfTotal))}%`,
                            backgroundColor: cat.color || meta.color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })
            )}

            {/* Payment Methods Breakdown */}
            <Text style={[styles.sectionTitle, { color: palette.textPrimary, marginTop: Space.s20 }]}>
              Payment Channels
            </Text>

            <View style={[styles.pmOverviewCard, { backgroundColor: palette.cardElevated, borderColor: palette.border }]}>
              {PAYMENT_METHODS.map((pm) => {
                const pmExpenses = currentMonthExpenses.filter((e) => e.payment_method === pm.key);
                const totalSantim = pmExpenses.reduce((s, e) => s + e.amount_santim, 0);
                if (totalSantim === 0) return null;
                const pct = analytics.totalSpentSantim > 0
                  ? Math.round((totalSantim / analytics.totalSpentSantim) * 100)
                  : 0;
                return (
                  <View key={pm.key} style={styles.pmRow}>
                    <View style={styles.pmLeft}>
                      <Feather name={pm.icon} size={15} color={palette.textMuted} style={{ marginRight: 8 }} />
                      <Text style={[styles.pmName, { color: palette.textPrimary }]}>{pm.label}</Text>
                    </View>
                    <View style={styles.pmRight}>
                      <Text style={[styles.pmTotal, { color: palette.textPrimary }]}>
                        {formatEtb(totalSantim)}
                      </Text>
                      <Text style={[styles.pmPct, { color: palette.textMuted }]}>({pct}%)</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Log / Edit Expense Bottom Sheet Modal */}
      <LogExpenseModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingExpense(null);
        }}
        onSaved={handleExpenseSaved}
        userId={session.user.id}
        initialExpense={editingExpense}
        customCategories={customCategories}
        onCategoryCreated={(newCat) => {
          setCustomCategories((prev) => [
            ...prev.filter(
              (c) => c.name.toLowerCase() !== newCat.name.toLowerCase()
            ),
            newCat,
          ].sort((a, b) => a.name.localeCompare(b.name)));
        }}
      />

      {/* Bottom Tab Navigation */}
      <AppBottomNav active="expenses" isSuperAdmin={adminUser} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: Space.s16,
    paddingTop: Space.s8,
    paddingBottom: Space.s24,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.s14,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  screenTitle: {
    fontFamily: Fonts.sansSemi,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.s6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    borderWidth: Hairline,
  },
  privacyBadgeText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  screenSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  primaryLogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.s8,
    paddingHorizontal: Space.s14,
    borderRadius: Radius.pill,
    gap: 4,
  },
  primaryLogBtnText: {
    color: '#FFFFFF',
    fontFamily: Fonts.sansSemi,
    fontSize: 13,
  },
  monthScroll: {
    gap: Space.s6,
    paddingBottom: Space.s12,
  },
  monthPill: {
    paddingVertical: Space.s6,
    paddingHorizontal: Space.s14,
    borderRadius: Radius.pill,
    borderWidth: Hairline,
  },
  monthPillText: {
    fontSize: 13,
  },
  heroCard: {
    padding: Space.s16,
    borderRadius: Radius.card,
    borderWidth: Hairline,
    marginBottom: Space.s14,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.s4,
  },
  heroPeriodLabel: {
    fontFamily: Fonts.sansSemi,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  momBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.s8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  momBadgeText: {
    fontFamily: Fonts.sansSemi,
    fontSize: 11,
  },
  heroAmount: {
    fontFamily: Fonts.sansSemi,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
    marginVertical: Space.s6,
  },
  heroMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: Hairline,
    paddingTop: Space.s10,
    marginTop: Space.s6,
  },
  heroMetricCol: {
    flex: 1,
  },
  heroMetricLabel: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    marginBottom: 2,
  },
  heroMetricValue: {
    fontFamily: Fonts.sansSemi,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  heroMetricDivider: {
    width: Hairline,
    height: 24,
    backgroundColor: '#CCCCCC',
    marginHorizontal: Space.s8,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: Radius.control,
    borderWidth: Hairline,
    padding: 3,
    marginBottom: Space.s14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.s8,
    borderRadius: Radius.control - 2,
  },
  tabBtnText: {
    fontSize: 13,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Space.s10,
    borderRadius: Radius.control,
    gap: Space.s6,
    marginBottom: Space.s12,
  },
  errorCardText: {
    color: '#DC2626',
    fontFamily: Fonts.sans,
    fontSize: 12,
    flex: 1,
  },
  transactionsWrap: {
    gap: Space.s4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: Radius.control,
    borderWidth: Hairline,
    paddingHorizontal: Space.s12,
    marginBottom: Space.s10,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  filterScroll: {
    gap: Space.s6,
    paddingBottom: Space.s10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: Space.s10,
    borderRadius: Radius.pill,
    borderWidth: Hairline,
  },
  filterChipText: {
    fontSize: 12,
  },
  emptyState: {
    padding: Space.s24,
    borderRadius: Radius.card,
    borderWidth: Hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Space.s12,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.s10,
  },
  emptyTitle: {
    fontFamily: Fonts.sansSemi,
    fontSize: 16,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Space.s16,
  },
  analysisWrap: {
    gap: Space.s10,
  },
  sectionTitle: {
    fontFamily: Fonts.sansSemi,
    fontSize: 15,
    marginBottom: Space.s4,
  },
  insightCard: {
    padding: Space.s14,
    borderRadius: Radius.card,
    borderWidth: Hairline,
    marginBottom: Space.s8,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.s6,
  },
  insightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.s8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  insightBadgeText: {
    fontFamily: Fonts.sansSemi,
    fontSize: 12,
  },
  insightMetric: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
  },
  insightBody: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  categoryCard: {
    padding: Space.s12,
    borderRadius: Radius.card,
    borderWidth: Hairline,
    marginBottom: Space.s6,
  },
  categoryCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.s8,
  },
  catLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s10,
    flex: 1,
  },
  catIconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.tag,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catName: {
    fontFamily: Fonts.sansSemi,
    fontSize: 14,
  },
  catSub: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    marginTop: 1,
  },
  catRight: {
    alignItems: 'flex-end',
  },
  catAmount: {
    fontFamily: Fonts.sansSemi,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  catDiff: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11,
    marginTop: 1,
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
  pmOverviewCard: {
    padding: Space.s14,
    borderRadius: Radius.card,
    borderWidth: Hairline,
    gap: Space.s10,
  },
  pmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pmLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pmName: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  pmRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pmTotal: {
    fontFamily: Fonts.sansSemi,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  pmPct: {
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
});
