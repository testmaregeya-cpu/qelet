import Feather from '@expo/vector-icons/Feather';
import { Redirect } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBottomNav } from '../components/AppBottomNav';
import { formatBillMonthLabel, getAddisAbabaDateString } from '../domain/billing';
import { computeMonthlyInsights, getAvailableInsightMonths } from '../domain/insights';
import { useHouseholdLedger } from '../hooks/useHouseholdLedger';
import { formatEtb, formatQuantityMilli } from '../lib/money';
import { isSuperAdmin } from '../lib/shopRules';
import { useSession } from '../state/SessionContext';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';

export default function InsightsScreen() {
  const { palette } = useTheme();
  const { loading, session, householdContext } = useSession();
  const { shops, entries, loadingData, refreshing, error, refreshAll } = useHouseholdLedger({
    includeDisputesAndMemory: false,
  });

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const months = useMemo(
    () => getAvailableInsightMonths(entries, getAddisAbabaDateString()),
    [entries]
  );

  const activeMonth = selectedMonth && months.includes(selectedMonth) ? selectedMonth : months[0];

  const report = useMemo(() => {
    if (!householdContext || !activeMonth) return null;
    return computeMonthlyInsights(entries, shops, householdContext.members, activeMonth);
  }, [entries, shops, householdContext, activeMonth]);

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }
  if (!loading && !householdContext) {
    return <Redirect href="/link-household" />;
  }
  if (!householdContext) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </SafeAreaView>
    );
  }

  const adminUser = isSuperAdmin(householdContext.currentMember.role);

  const handleRefresh = async () => {
    await refreshAll();
  };

  const settledRatioPct =
    report && report.totalChargedSantim > 0
      ? Math.min(
          100,
          Math.round((report.totalPaidSantim / report.totalChargedSantim) * 100)
        )
      : report && report.totalPaidSantim > 0
        ? 100
        : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: palette.surface, borderBottomColor: palette.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>
          Monthly insights
        </Text>
        <Text style={[styles.headerMeta, { color: palette.textMuted }]}>
          {report?.label ?? ''}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={palette.primary}
          />
        }
      >
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: palette.dangerLight }]}>
            <Feather name="alert-circle" size={16} color={palette.danger} />
            <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthRow}
        >
          {months.map((m) => {
            const active = m === activeMonth;
            return (
              <Pressable
                key={m}
                style={[
                  styles.monthChip,
                  {
                    borderColor: active ? palette.primary : palette.borderStrong,
                    backgroundColor: active ? palette.primaryLight : palette.surface,
                  },
                ]}
                onPress={() => setSelectedMonth(m)}
              >
                <Text
                  style={[
                    styles.monthText,
                    { color: active ? palette.primary : palette.textPrimary },
                  ]}
                >
                  {formatBillMonthLabel(m)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loadingData || !report ? (
          <ActivityIndicator style={{ marginTop: Space.s24 }} color={palette.primary} />
        ) : (
          <>
            {/* Unified Monthly Summary Sheet */}
            <View
              style={[
                styles.card,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              <View style={styles.summaryRow}>
                <View style={styles.summaryCol}>
                  <Text style={[styles.summaryLabel, { color: palette.textSecondary }]}>
                    Charged
                  </Text>
                  <Text style={[styles.summaryValue, { color: palette.textPrimary }]}>
                    {formatEtb(report.totalChargedSantim)}
                  </Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: palette.border }]} />
                <View style={styles.summaryCol}>
                  <Text style={[styles.summaryLabel, { color: palette.textSecondary }]}>Paid</Text>
                  <Text style={[styles.summaryValue, { color: palette.primary }]}>
                    {formatEtb(report.totalPaidSantim)}
                  </Text>
                </View>
              </View>

              <View style={[styles.settledStrip, { borderTopColor: palette.border }]}>
                <View style={styles.settledLabelRow}>
                  <Text style={[styles.settledLabel, { color: palette.textMuted }]}>
                    Settled against charges
                  </Text>
                  <Text style={[styles.settledPct, { color: palette.textPrimary }]}>
                    {settledRatioPct}%
                  </Text>
                </View>
                <View style={[styles.barTrackThin, { backgroundColor: palette.surfaceMuted }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${settledRatioPct}%`,
                        backgroundColor: palette.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* Primary Chart: Spend by Shop */}
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
                  Spend by shop
                </Text>
                <Text style={[styles.sectionMeta, { color: palette.textMuted }]}>
                  {report.byShop.length} shops
                </Text>
              </View>

              <View
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
                {report.byShop.length === 0 ? (
                  <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                    No charges recorded for {report.label}.
                  </Text>
                ) : (
                  <View style={styles.chartBody}>
                    {/* Ruled axis reference */}
                    <View style={[styles.gridHeader, { borderBottomColor: palette.border }]}>
                      <Text style={[styles.gridLabel, { color: palette.textMuted }]}>Shop</Text>
                      <Text style={[styles.gridLabel, { color: palette.textMuted }]}>Share / ETB</Text>
                    </View>
                    {report.byShop.map((s, idx) => {
                      const isTopShop = idx === 0;
                      const maxShopCharged = report.byShop[0]?.chargedSantim ?? 0;
                      const fillWidthPct =
                        maxShopCharged > 0
                          ? Math.max(Math.round((s.chargedSantim / maxShopCharged) * 100), 4)
                          : 0;
                      return (
                        <View
                          key={s.shopId}
                          style={[
                            styles.shopBarGroup,
                            idx < report.byShop.length - 1 && {
                              borderBottomWidth: 1,
                              borderBottomColor: palette.border,
                            },
                          ]}
                        >
                          <View style={styles.barHeader}>
                            <Text style={[styles.barLabel, { color: palette.textPrimary }]} numberOfLines={1}>
                              {s.shopName}
                            </Text>
                            <View style={styles.barRightStats}>
                              <Text style={[styles.shareMono, { color: palette.textMuted }]}>
                                {s.sharePercent}%
                              </Text>
                              <Text style={[styles.barValue, { color: palette.textPrimary }]}>
                                {formatEtb(s.chargedSantim)}
                              </Text>
                            </View>
                          </View>
                          <View style={[styles.barTrack, { backgroundColor: palette.surfaceMuted }]}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  width: `${fillWidthPct}%`,
                                  backgroundColor: isTopShop
                                    ? palette.primary
                                    : palette.textMuted,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

            {/* Partner Share Stacked Comparison */}
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
                Household split
              </Text>
              <View
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
                {report.totalChargedSantim > 0 ? (
                  <View style={[styles.stackedBar, { backgroundColor: palette.surfaceMuted }]}>
                    {report.byPerson.map((p) =>
                      p.chargedSantim > 0 ? (
                        <View
                          key={p.userId}
                          style={{
                            flex: p.chargedSantim,
                            backgroundColor: p.avatarColor,
                            height: '100%',
                          }}
                        />
                      ) : null
                    )}
                  </View>
                ) : null}

                {report.byPerson.map((p, idx) => (
                  <View
                    key={p.userId}
                    style={[
                      styles.personRow,
                      idx < report.byPerson.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: palette.border,
                      },
                    ]}
                  >
                    <View style={[styles.personDot, { backgroundColor: p.avatarColor }]} />
                    <View style={{ flex: 1, gap: Space.s4 }}>
                      <Text style={[styles.barLabel, { color: palette.textPrimary }]}>
                        {p.displayName}
                      </Text>
                      {p.paidSantim > 0 ? (
                        <Text style={[styles.subMeta, { color: palette.primary }]}>
                          Payments logged: {formatEtb(p.paidSantim)}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.barRightStats}>
                      <Text style={[styles.shareMono, { color: palette.textMuted }]}>
                        {p.sharePercent}%
                      </Text>
                      <Text style={[styles.barValue, { color: palette.textPrimary }]}>
                        {formatEtb(p.chargedSantim)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Top Items Ruled Table */}
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>Top items</Text>
              <View
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
                {report.topItems.length === 0 ? (
                  <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                    No item lines recorded for {report.label}.
                  </Text>
                ) : (
                  report.topItems.slice(0, 15).map((item, idx) => (
                    <View
                      key={item.itemKey}
                      style={[
                        styles.itemRow,
                        idx < Math.min(report.topItems.length, 15) - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: palette.border,
                        },
                      ]}
                    >
                      <Text style={[styles.rankCol, { color: palette.textMuted }]}>
                        {String(idx + 1).padStart(2, '0')}
                      </Text>
                      <View style={{ flex: 1, gap: Space.s4 }}>
                        <Text style={[styles.barLabel, { color: palette.textPrimary }]}>
                          {item.itemName}
                        </Text>
                        <Text style={[styles.subMeta, { color: palette.textMuted }]}>
                          {formatQuantityMilli(item.totalQuantityMilli)} {item.unit} ·{' '}
                          {item.lineCount} entries
                        </Text>
                      </View>
                      <Text style={[styles.barValue, { color: palette.textPrimary }]}>
                        {formatEtb(item.totalSantim)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <AppBottomNav active="insights" isSuperAdmin={adminUser} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.s16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 18,
    lineHeight: 24,
  },
  headerMeta: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
  },
  container: {
    paddingHorizontal: Space.s16,
    paddingTop: Space.s16,
    paddingBottom: Space.s32,
    gap: Space.s24,
  },
  monthRow: {
    gap: Space.s8,
  },
  monthChip: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s8,
  },
  monthText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Space.s16,
    gap: Space.s12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryCol: {
    flex: 1,
    gap: Space.s4,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    marginHorizontal: Space.s16,
  },
  summaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: 22,
    lineHeight: 28,
    fontVariant: ['tabular-nums'],
  },
  settledStrip: {
    borderTopWidth: 1,
    paddingTop: Space.s12,
    gap: Space.s8,
  },
  settledLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settledLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  settledPct: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  barTrackThin: {
    height: 6,
    borderRadius: Radius.tag,
    overflow: 'hidden',
  },
  sectionBlock: {
    gap: Space.s8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionMeta: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
  },
  chartBody: {
    gap: Space.s12,
  },
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: Space.s8,
  },
  gridLabel: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 16,
  },
  shopBarGroup: {
    paddingBottom: Space.s12,
    gap: Space.s8,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Space.s12,
  },
  barRightStats: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.s8,
  },
  barLabel: {
    flex: 1,
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  shareMono: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  barValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: 14,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 6,
    borderRadius: Radius.tag,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.tag,
  },
  stackedBar: {
    height: 8,
    borderRadius: Radius.tag,
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 2,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s12,
    paddingVertical: Space.s8,
  },
  personDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subMeta: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.s8,
    gap: Space.s12,
  },
  rankCol: {
    width: 24,
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    borderRadius: Radius.control,
    padding: Space.s12,
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
});
