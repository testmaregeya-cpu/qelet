import Feather from '@expo/vector-icons/Feather';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LedgerHeader } from '../../components/LedgerHeader';
import { ShopEntryCard } from '../../components/ShopEntryCard';
import { StatusBadge } from '../../components/StatusBadge';
import {
  calculateShopLedgerSummary,
  getAddisAbabaDateString,
  resolveDefaultBillMonth,
} from '../../domain/billing';
import { getQuickAddSuggestions } from '../../domain/dashboard';
import { useShopDetail } from '../../hooks/useShopDetail';
import { triggerHaptic } from '../../lib/haptics';
import { formatEtb } from '../../lib/money';
import { buildShopStatementHtml, buildShopStatementText } from '../../lib/statement';
import { exportHtmlStatementAsPdfAndShare } from '../../services/admin';
import { createChargeEntry } from '../../services/ledger';
import { markEntryLoggedTodayAndSyncReminder } from '../../services/notifications';
import {
  createClientRequestId,
  enqueueOfflineMutation,
  isLikelyNetworkError,
} from '../../services/offlineQueue';
import { useSession } from '../../state/SessionContext';
import { useTheme } from '../../theme/ThemeContext';
import { Fonts, Hairline, Radius, Space } from '../../theme/tokens';
import type { LedgerEntry } from '../../types/phase2';
import type { ItemSuggestion } from '../../types/phase4to6';

type HistoryFilter = 'all' | 'charge' | 'payment' | 'disputed' | 'voided';

export default function ShopDetailScreen() {
  const { palette } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const shopId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

  const { loading, session, householdContext } = useSession();
  const householdId = householdContext?.household.id ?? null;

  const {
    shop,
    entries,
    disputes,
    priceMemory,
    catalogItems,
    categories,
    loadingData,
    refreshing,
    error,
    setError,
    reload: loadShopDetail,
    refresh,
  } = useShopDetail(householdId, shopId);

  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [busy, setBusy] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const openDisputeIds = useMemo(
    () => new Set(disputes.filter((d) => d.status === 'open').map((d) => d.entry_id)),
    [disputes]
  );

  const summary = useMemo(
    () => calculateShopLedgerSummary(entries, getAddisAbabaDateString()),
    [entries]
  );

  const quickAddItems = useMemo(
    () => getQuickAddSuggestions(priceMemory, catalogItems, categories, 6),
    [priceMemory, catalogItems, categories]
  );

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      switch (historyFilter) {
        case 'charge':
          return entry.type === 'charge' && !entry.voided;
        case 'payment':
          return entry.type === 'payment' && !entry.voided;
        case 'disputed':
          return openDisputeIds.has(entry.id);
        case 'voided':
          return entry.voided;
        default:
          return true;
      }
    });
  }, [entries, historyFilter, openDisputeIds]);

  const members = useMemo(
    () => householdContext?.members ?? [],
    [householdContext?.members]
  );

  const handleOpenEntry = useCallback((entryId: string) => {
    router.push({ pathname: '/entry/[id]', params: { id: entryId } });
  }, []);

  const renderEntry = useCallback(
    ({ item }: { item: LedgerEntry }) => (
      <ShopEntryCard
        entry={item}
        members={members}
        hasOpenDispute={openDisputeIds.has(item.id)}
        onPress={handleOpenEntry}
      />
    ),
    [members, openDisputeIds, handleOpenEntry]
  );

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }
  if (!loading && !householdContext) {
    return <Redirect href="/link-household" />;
  }
  if (!householdContext || !shopId) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </SafeAreaView>
    );
  }

  const { household } = householdContext;
  const isInactive = Boolean(shop && (shop.archived || shop.merged_into_shop_id !== null));
  const billsNewestFirst = [...summary.bills].reverse();

  const handleQuickAddItem = async (item: ItemSuggestion) => {
    if (!shop || isInactive || busy || !householdId) return;
    setError(null);
    setStatusNote(null);
    setBusy(true);
    const requestId = createClientRequestId();
    const today = getAddisAbabaDateString();
    const { billMonth } = resolveDefaultBillMonth(entries, today);
    const lineDraft = {
      catalog_item_id: item.catalog_item_id,
      item_name: item.item_name,
      quantity_milli: 1000,
      unit: item.unit,
      unit_price_santim: item.unit_price_santim,
    };

    try {
      await createChargeEntry({
        shopId: shop.id,
        entryDate: today,
        billMonth,
        note: '',
        lines: [lineDraft],
        clientRequestId: requestId,
      });
      triggerHaptic('success');
      await loadShopDetail();
    } catch (err) {
      if (isLikelyNetworkError(err)) {
        await enqueueOfflineMutation({
          id: requestId,
          kind: 'charge',
          householdId,
          shopId: shop.id,
          createdAt: new Date().toISOString(),
          payload: {
            shopId: shop.id,
            entryDate: today,
            billMonth,
            note: '',
            lines: [lineDraft],
            clientRequestId: requestId,
          },
        });
        await markEntryLoggedTodayAndSyncReminder(today).catch(() => undefined);
        triggerHaptic('success');
        setStatusNote(`Saved "${item.item_name}" offline — will sync automatically.`);
      } else {
        triggerHaptic('error');
        setError(err instanceof Error ? err.message : 'Quick add failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleShareStatementText = async () => {
    if (!shop) return;
    const message = buildShopStatementText({
      householdName: household.name,
      shopName: shop.name,
      generatedDate: getAddisAbabaDateString(),
      summary,
      entries,
      members,
    });
    await Share.share({ message });
  };

  const handleShareStatementPdf = async () => {
    if (!shop) return;
    setError(null);
    setBusy(true);
    try {
      const html = buildShopStatementHtml({
        householdName: household.name,
        shopName: shop.name,
        generatedDate: getAddisAbabaDateString(),
        summary,
        entries,
        members,
      });
      await exportHtmlStatementAsPdfAndShare(html, `${shop.name} statement`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setBusy(false);
    }
  };

  const listHeader = (
    <View style={styles.headerSections}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: palette.dangerLight }]}>
          <Feather name="alert-circle" size={16} color={palette.danger} />
          <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
        </View>
      ) : null}

      {statusNote ? (
        <View style={[styles.infoBox, { backgroundColor: palette.amberLight }]}>
          <Feather name="wifi-off" size={15} color={palette.amber} />
          <Text style={[styles.infoText, { color: palette.amber }]}>{statusNote}</Text>
        </View>
      ) : null}

      {loadingData ? (
        <ActivityIndicator style={{ marginTop: Space.s24 }} color={palette.primary} />
      ) : !shop ? (
        <View
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>Shop not found.</Text>
        </View>
      ) : (
        <>
          {/* Shop Ledger Summary Card */}
          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={styles.balanceHeader}>
              <View style={{ flex: 1, gap: Space.s4 }}>
                <Text style={[styles.balanceSubLabel, { color: palette.textSecondary }]}>
                  {summary.balanceSantim < 0 ? 'Credit balance' : 'Current balance owed'}
                </Text>
                <Text style={[styles.balanceBig, { color: palette.textPrimary }]}>
                  {summary.balanceSantim < 0
                    ? formatEtb(summary.unappliedCreditSantim)
                    : formatEtb(summary.balanceSantim)}
                </Text>
              </View>
              <StatusBadge status={summary.status} />
            </View>

            <View
              style={[
                styles.totalsBar,
                { borderTopColor: palette.border, borderBottomColor: palette.border },
              ]}
            >
              <View style={styles.totalCell}>
                <Text style={[styles.totalLabel, { color: palette.textMuted }]}>Charged</Text>
                <Text style={[styles.totalNum, { color: palette.textPrimary }]}>
                  {formatEtb(summary.totalChargedSantim)}
                </Text>
              </View>
              <View style={[styles.totalDivider, { backgroundColor: palette.border }]} />
              <View style={styles.totalCell}>
                <Text style={[styles.totalLabel, { color: palette.textMuted }]}>Paid</Text>
                <Text style={[styles.totalNum, { color: palette.primary }]}>
                  {formatEtb(summary.totalPaidSantim)}
                </Text>
              </View>
            </View>

            {!isInactive ? (
              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: palette.primaryButtonBg },
                    pressed && { opacity: 0.9 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add charge at ${shop.name}`}
                  onPress={() =>
                    router.push({ pathname: '/add-charge', params: { shopId: shop.id } })
                  }
                >
                  <Feather name="plus" size={16} color={palette.primaryButtonText} />
                  <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                    Add charge
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    {
                      backgroundColor: palette.surfaceMuted,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Record payment for ${shop.name}`}
                  onPress={() =>
                    router.push({ pathname: '/record-payment', params: { shopId: shop.id } })
                  }
                >
                  <Feather name="check" size={16} color={palette.textPrimary} />
                  <Text style={[styles.secondaryBtnText, { color: palette.textPrimary }]}>
                    Record payment
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[styles.inactiveNotice, { color: palette.amber }]}>
                Archived or merged — read only for history.
              </Text>
            )}

            <View style={styles.shareRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.shareActionBtn,
                  { borderColor: palette.borderStrong, backgroundColor: palette.background },
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Share shop statement as text"
                onPress={() => void handleShareStatementText()}
              >
                <Feather name="share-2" size={14} color={palette.textSecondary} />
                <Text style={[styles.shareActionText, { color: palette.textPrimary }]}>
                  Share text
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.shareActionBtn,
                  { borderColor: palette.borderStrong, backgroundColor: palette.background },
                  pressed && { opacity: 0.8 },
                ]}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Export shop statement as PDF"
                onPress={() => void handleShareStatementPdf()}
              >
                <Feather name="file-text" size={14} color={palette.primary} />
                <Text style={[styles.shareActionText, { color: palette.primary }]}>Export PDF</Text>
              </Pressable>
            </View>
          </View>

          {/* 1-Tap Quick-Add */}
          {!isInactive && quickAddItems.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
                Quick add today
              </Text>
              <View style={styles.quickWrap}>
                {quickAddItems.map((item) => (
                  <Pressable
                    key={item.key}
                    style={({ pressed }) => [
                      styles.quickChip,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.borderStrong,
                      },
                      pressed && { opacity: 0.8 },
                    ]}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Quick add 1 ${item.unit} ${item.item_name} for ${formatEtb(
                      item.unit_price_santim
                    )}`}
                    onPress={() => void handleQuickAddItem(item)}
                  >
                    <Feather name="plus" size={13} color={palette.primary} />
                    <Text style={[styles.quickChipText, { color: palette.textPrimary }]}>
                      {item.item_name}
                    </Text>
                    <Text style={[styles.quickChipPrice, { color: palette.textMuted }]}>
                      {formatEtb(item.unit_price_santim)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Monthly Bills */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
                Monthly bills
              </Text>
              <Text style={[styles.sectionMeta, { color: palette.textMuted }]}>
                Oldest paid first
              </Text>
            </View>

            {billsNewestFirst.length === 0 ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
                <Text style={[styles.emptyText, { color: palette.textMuted }]}>No bills yet.</Text>
              </View>
            ) : (
              <View
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
                {billsNewestFirst.map((bill, idx) => (
                  <View
                    key={bill.billMonth}
                    style={[
                      styles.billRow,
                      idx < billsNewestFirst.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: palette.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, gap: Space.s4 }}>
                      <Text style={[styles.billMonth, { color: palette.textPrimary }]}>
                        {bill.label}
                      </Text>
                      <Text style={[styles.billMeta, { color: palette.textSecondary }]}>
                        Charged {formatEtb(bill.chargedSantim)} / Paid {formatEtb(bill.paidSantim)}
                      </Text>
                    </View>
                    <View style={styles.billRight}>
                      <Text style={[styles.billRemaining, { color: palette.textPrimary }]}>
                        {formatEtb(bill.remainingSantim)}
                      </Text>
                      <StatusBadge status={bill.status} />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Ledger History Header + Filters */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>History</Text>
              <Text style={[styles.sectionMeta, { color: palette.textMuted }]}>
                {filteredEntries.length}
              </Text>
            </View>

            {entries.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipsRow}
              >
                {(
                  [
                    ['all', 'All'],
                    ['charge', 'Charges'],
                    ['payment', 'Payments'],
                    ['disputed', 'Disputed'],
                    ['voided', 'Voided'],
                  ] as const
                ).map(([key, label]) => {
                  const active = historyFilter === key;
                  return (
                    <Pressable
                      key={key}
                      style={[
                        styles.filterChip,
                        {
                          borderColor: active ? palette.primary : 'transparent',
                          backgroundColor: active ? palette.primaryLight : palette.surfaceMuted,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        triggerHaptic('selection');
                        setHistoryFilter(key);
                      }}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          {
                            color: active ? palette.primary : palette.textSecondary,
                            fontFamily: active ? Fonts.sansSemi : Fonts.sansMedium,
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        </>
      )}
    </View>
  );

  const emptyHistory =
    !loadingData && shop ? (
      <View
        style={[
          styles.card,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.emptyText, { color: palette.textMuted }]}>
          {entries.length === 0
            ? 'No charges or payments recorded yet.'
            : 'No entries match this filter.'}
        </Text>
      </View>
    ) : undefined;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <LedgerHeader title={shop?.name ?? 'Shop ledger'} backLabel="Ledger" />

      <FlatList
        data={loadingData || !shop ? [] : filteredEntries}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyHistory}
        contentContainerStyle={styles.container}
        initialNumToRender={12}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={palette.primary}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: {
    paddingHorizontal: Space.s16,
    paddingTop: Space.s16,
    paddingBottom: Space.s32,
  },
  headerSections: {
    gap: Space.s24,
    marginBottom: Space.s12,
  },
  card: {
    borderRadius: Radius.card,
    padding: Space.s16,
    borderWidth: Hairline,
    gap: Space.s16,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.s12,
  },
  balanceSubLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  balanceBig: {
    fontFamily: Fonts.sansSemi,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  totalsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: Hairline,
    borderBottomWidth: Hairline,
    paddingVertical: Space.s12,
  },
  totalCell: {
    flex: 1,
    gap: Space.s4,
  },
  totalDivider: {
    width: 1,
    height: 28,
    marginHorizontal: Space.s12,
  },
  totalLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  totalNum: {
    fontFamily: Fonts.monoMedium,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.s8,
  },
  primaryBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
    borderRadius: Radius.control,
  },
  primaryBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
    borderRadius: Radius.control,
  },
  secondaryBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
  inactiveNotice: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  shareRow: {
    flexDirection: 'row',
    gap: Space.s8,
  },
  shareActionBtn: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s6,
    borderWidth: Hairline,
    borderRadius: Radius.pill,
  },
  shareActionText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
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
    fontVariant: ['tabular-nums'],
  },
  filterChipsRow: {
    gap: Space.s8,
  },
  filterChip: {
    borderWidth: Hairline,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: 6,
  },
  filterChipText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  quickWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.s8,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s6,
    borderWidth: Hairline,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: 6,
  },
  quickChipText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  quickChipPrice: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.s8,
    gap: Space.s12,
  },
  billMonth: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  billMeta: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  billRight: {
    alignItems: 'flex-end',
    gap: Space.s4,
  },
  billRemaining: {
    fontFamily: Fonts.monoMedium,
    fontSize: 14,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
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
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    borderRadius: Radius.control,
    padding: Space.s12,
  },
  infoText: {
    flex: 1,
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
});

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const { palette } = useTheme();
  return (
    <SafeAreaView style={[styles.centered, { backgroundColor: palette.background, padding: Space.s24 }]}>
      <Feather name="alert-triangle" size={36} color={palette.danger} style={{ marginBottom: Space.s16 }} />
      <Text style={[styles.balanceBig, { color: palette.textPrimary, fontSize: 20, textAlign: 'center', marginBottom: Space.s8 }]}>
        Shop Ledger Unavailable
      </Text>
      <Text style={[styles.emptyText, { color: palette.textSecondary, marginBottom: Space.s24 }]}>
        {error?.message || 'Could not load shop ledger statement.'}
      </Text>
      <Pressable
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: palette.primaryButtonBg, width: '100%', height: 44, opacity: pressed ? 0.9 : 1 },
        ]}
        onPress={retry}
      >
        <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>Retry</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.secondaryBtn,
          { borderColor: palette.border, width: '100%', height: 44, marginTop: Space.s12, opacity: pressed ? 0.85 : 1 },
        ]}
        onPress={() => router.replace('/shops')}
      >
        <Text style={[styles.secondaryBtnText, { color: palette.textPrimary }]}>Back to Ledger</Text>
      </Pressable>
    </SafeAreaView>
  );
}
