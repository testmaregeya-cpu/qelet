import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBottomNav } from '../components/AppBottomNav';
import { PaydayWindowBar } from '../components/PaydayWindowBar';
import { CreateShopModal } from '../components/CreateShopModal';
import { ShopManageModal } from '../components/ShopManageModal';
import { ShopQuickActionsModal } from '../components/ShopQuickActionsModal';
import { ShopRow } from '../components/ShopRow';
import { calculateShopLedgerSummary, getAddisAbabaDateString } from '../domain/billing';
import {
  detectShopPriceAnomalies,
  forecastHouseholdPaydayBill,
} from '../domain/ml/ledgerMl';
import { useHouseholdLedger } from '../hooks/useHouseholdLedger';
import { triggerHaptic } from '../lib/haptics';
import { formatEtb } from '../lib/money';
import { findMember, isSuperAdmin, splitShopsByStatus } from '../lib/shopRules';
import { rotateInviteCode } from '../services/household';
import { isLikelyNetworkError, removeOfflineMutation } from '../services/offlineQueue';
import {
  approveShop,
  mergeShops,
  renameShop,
  setShopArchived,
} from '../services/shops';
import { useSession } from '../state/SessionContext';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Hairline, Radius, Space } from '../theme/tokens';
import type { Shop } from '../types/phase1';
import type { LedgerEntry, ShopLedgerSummary } from '../types/phase2';

type ShopFilter = 'all' | 'unpaid' | 'due' | 'disputed';

export default function ShopsScreen() {
  const { palette } = useTheme();
  const { loading, session, householdContext, refreshHousehold } = useSession();
  const {
    shops,
    entries,
    disputes,
    pendingMutations,
    loadingData: loadingShops,
    refreshing,
    error,
    setError,
    reload: loadAll,
    refreshAll,
    syncOfflineQueueNow,
  } = useHouseholdLedger();

  const [searchQuery, setSearchQuery] = useState('');
  const [shopFilter, setShopFilter] = useState<ShopFilter>('all');
  const [showCreateShopModal, setShowCreateShopModal] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [quickActionShop, setQuickActionShop] = useState<Shop | null>(null);

  const todayDate = getAddisAbabaDateString();
  const grouped = useMemo(() => splitShopsByStatus(shops), [shops]);

  const summariesByShop = useMemo(() => {
    const byShop = new Map<string, LedgerEntry[]>();
    for (const entry of entries) {
      const bucket = byShop.get(entry.shop_id);
      if (bucket) {
        bucket.push(entry);
      } else {
        byShop.set(entry.shop_id, [entry]);
      }
    }

    const map = new Map<string, ShopLedgerSummary>();
    for (const shop of shops) {
      map.set(shop.id, calculateShopLedgerSummary(byShop.get(shop.id) ?? [], todayDate));
    }
    return map;
  }, [shops, entries, todayDate]);

  const openDisputesByShop = useMemo(() => {
    const entryToShop = new Map<string, string>();
    for (const entry of entries) {
      entryToShop.set(entry.id, entry.shop_id);
    }
    const counts = new Map<string, number>();
    for (const dispute of disputes) {
      if (dispute.status !== 'open') continue;
      const shopId = entryToShop.get(dispute.entry_id);
      if (shopId) {
        counts.set(shopId, (counts.get(shopId) ?? 0) + 1);
      }
    }
    return counts;
  }, [entries, disputes]);

  const filterCounts = useMemo(() => {
    let unpaid = 0;
    let due = 0;
    let disputed = 0;
    for (const shop of grouped.activeApproved) {
      const summary = summariesByShop.get(shop.id);
      if (summary && summary.balanceSantim > 0) {
        unpaid += 1;
        if (
          summary.status === 'OVERDUE' ||
          summary.status === 'DUE NOW' ||
          summary.status === 'DUE SOON'
        ) {
          due += 1;
        }
      }
      if ((openDisputesByShop.get(shop.id) ?? 0) > 0) {
        disputed += 1;
      }
    }
    return {
      all: grouped.activeApproved.length,
      unpaid,
      due,
      disputed,
    };
  }, [grouped.activeApproved, summariesByShop, openDisputesByShop]);

  const filteredApprovedShops = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return grouped.activeApproved.filter((shop) => {
      if (query && !shop.name.toLowerCase().includes(query)) {
        return false;
      }
      const summary = summariesByShop.get(shop.id);
      if (shopFilter === 'unpaid') {
        return Boolean(summary && summary.balanceSantim > 0);
      }
      if (shopFilter === 'due') {
        return Boolean(
          summary &&
            summary.balanceSantim > 0 &&
            (summary.status === 'OVERDUE' ||
              summary.status === 'DUE NOW' ||
              summary.status === 'DUE SOON')
        );
      }
      if (shopFilter === 'disputed') {
        return (openDisputesByShop.get(shop.id) ?? 0) > 0;
      }
      return true;
    });
  }, [grouped.activeApproved, searchQuery, shopFilter, summariesByShop, openDisputesByShop]);

  const totalOwedSantim = useMemo(() => {
    let total = 0;
    for (const shop of shops) {
      if (shop.archived || shop.merged_into_shop_id !== null) continue;
      const summary = summariesByShop.get(shop.id);
      if (summary && summary.balanceSantim > 0) {
        total += summary.balanceSantim;
      }
    }
    return total;
  }, [shops, summariesByShop]);

  const paydayForecast = useMemo(
    () => forecastHouseholdPaydayBill({ entries, shops, todayDate }),
    [entries, shops, todayDate]
  );

  const topPriceAlert = useMemo(() => {
    const alerts = detectShopPriceAnomalies({ entries, shops });
    return alerts.find((a) => a.direction === 'increase') ?? null;
  }, [entries, shops]);

  const openShopDetail = useCallback((shop: Shop) => {
    router.push({ pathname: '/shop/[id]', params: { id: shop.id } });
  }, []);

  const handleDirectAddCharge = useCallback((shop: Shop) => {
    router.push({ pathname: '/add-charge', params: { shopId: shop.id } });
  }, []);

  const handleDirectRecordPayment = useCallback((shop: Shop) => {
    router.push({ pathname: '/record-payment', params: { shopId: shop.id } });
  }, []);

  const handleQuickApprove = useCallback(
    async (shopId: string) => {
      setError(null);
      setMutating(true);
      try {
        await approveShop(shopId);
        triggerHaptic('success');
        await loadAll();
      } catch (err) {
        triggerHaptic('error');
        setError(
          isLikelyNetworkError(err)
            ? 'You are offline. Connect to the internet to approve this shop.'
            : err instanceof Error
              ? err.message
              : 'Failed to approve shop'
        );
      } finally {
        setMutating(false);
      }
    },
    [loadAll, setError]
  );

  const members = useMemo(
    () => householdContext?.members ?? [],
    [householdContext?.members]
  );
  const adminUser = householdContext ? isSuperAdmin(householdContext.currentMember.role) : false;

  const renderApprovedShop = useCallback(
    ({ item: shop }: { item: Shop }) => (
      <View style={styles.shopItemWrap}>
        <ShopRow
          shop={shop}
          creator={findMember(members, shop.created_by)}
          summary={summariesByShop.get(shop.id)}
          openDisputesCount={openDisputesByShop.get(shop.id) ?? 0}
          isSuperAdmin={adminUser}
          onPress={setQuickActionShop}
          onAddCharge={handleDirectAddCharge}
          onRecordPayment={handleDirectRecordPayment}
          onManage={setSelectedShop}
        />
      </View>
    ),
    [
      members,
      summariesByShop,
      openDisputesByShop,
      adminUser,
      handleDirectAddCharge,
      handleDirectRecordPayment,
    ]
  );

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }
  if (!loading && !householdContext) {
    return <Redirect href="/link-household" />;
  }
  if (!householdContext || !session) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </SafeAreaView>
    );
  }

  const { household, currentMember } = householdContext;
  const partner = members.find((m) => m.user_id !== currentMember.user_id);

  const handleShareInvite = async () => {
    await Share.share({
      message: `Join our Qelet household "${household.name}" with invite code: ${household.invite_code}`,
    });
  };

  const handleRotateInvite = async () => {
    setError(null);
    setMutating(true);
    try {
      await rotateInviteCode(household.id);
      triggerHaptic('success');
      await refreshHousehold();
    } catch (err) {
      triggerHaptic('error');
      setError(
        isLikelyNetworkError(err)
          ? 'You are offline. Connect to the internet to rotate invite code.'
          : err instanceof Error
            ? err.message
            : 'Failed to rotate invite code'
      );
    } finally {
      setMutating(false);
    }
  };

  const failedPending = pendingMutations.find((m) => Boolean(m.lastError));

  const headerElement = (
    <View style={styles.headerSections}>
      {/* Top Context Row */}
      <View style={styles.topRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.appWordmark, { color: palette.textMuted }]}>Qelet ledger</Text>
          <Text style={[styles.householdName, { color: palette.textPrimary }]} numberOfLines={1}>
            {household.name}
          </Text>
        </View>

        <View style={styles.topActionsRow}>
          <View
            style={[
              styles.memberChip,
              { backgroundColor: palette.surfaceMuted },
            ]}
          >
            <View
              style={[
                styles.memberDot,
                { backgroundColor: currentMember.avatar_color ?? palette.primary },
              ]}
            />
            <Text style={[styles.memberChipText, { color: palette.textSecondary }]}>
              {currentMember.display_name}
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.topAddShopBtn,
              { backgroundColor: palette.primary },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add new shop"
            onPress={() => {
              triggerHaptic('selection');
              setShowCreateShopModal(true);
            }}
          >
            <Feather name="plus" size={14} color={palette.accentButtonText} />
            <Text style={[styles.topAddShopText, { color: palette.accentButtonText }]}>
              Add shop
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Household Balance Card */}
      <View
        style={[
          styles.ledgerCard,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <View style={styles.balanceBlock}>
          <Text style={[styles.balanceLabel, { color: palette.textSecondary }]}>
            Total owed across shops
          </Text>
          <Text style={[styles.balanceValue, { color: palette.textPrimary }]}>
            {formatEtb(totalOwedSantim)}
          </Text>
          {partner ? (
            <View style={styles.syncRow}>
              <View
                style={[styles.partnerDot, { backgroundColor: partner.avatar_color ?? palette.primary }]}
              />
              <Text style={[styles.partnerText, { color: palette.textMuted }]}>
                Synced live with {partner.display_name}
              </Text>
            </View>
          ) : null}
        </View>

        <PaydayWindowBar todayDate={todayDate} />

        {(paydayForecast.additionalExpectedSantim > 0 || topPriceAlert) ? (
          <View style={[styles.mlLedgerStrip, { borderTopColor: palette.border }]}>
            {paydayForecast.additionalExpectedSantim > 0 ? (
              <View style={styles.mlLedgerRow}>
                <Text style={[styles.mlLedgerLabel, { color: palette.textSecondary }]}>
                  Est. Day 24 payday bill
                </Text>
                <Text style={[styles.mlLedgerValue, { color: palette.textPrimary }]}>
                  ~{formatEtb(paydayForecast.projectedPaydayTotalSantim)}
                </Text>
              </View>
            ) : null}
            {topPriceAlert ? (
              <Text style={[styles.mlPriceAlertText, { color: palette.amber }]} numberOfLines={1}>
                Price jump: {topPriceAlert.itemName} at {topPriceAlert.shopName} (+
                {topPriceAlert.percentChange}%)
              </Text>
            ) : null}
          </View>
        ) : null}

        {!partner ? (
          <View
            style={[
              styles.inviteBox,
              { backgroundColor: palette.background, borderColor: palette.border },
            ]}
          >
            <View style={{ flex: 1, gap: Space.s4 }}>
              <Text style={[styles.inviteLabel, { color: palette.textSecondary }]}>
                Invite partner
              </Text>
              <Text style={[styles.inviteCode, { color: palette.textPrimary }]}>
                {household.invite_code}
              </Text>
            </View>
            <View style={styles.inviteActions}>
              <Pressable
                style={[styles.smallPrimaryBtn, { backgroundColor: palette.primary }]}
                accessibilityRole="button"
                accessibilityLabel="Share household invite code"
                onPress={() => void handleShareInvite()}
              >
                <Feather name="share-2" size={14} color={palette.accentButtonText} />
                <Text style={[styles.smallPrimaryText, { color: palette.accentButtonText }]}>
                  Share
                </Text>
              </Pressable>
              {adminUser ? (
                <Pressable
                  style={[
                    styles.smallSecondaryBtn,
                    { borderColor: palette.borderStrong, backgroundColor: palette.surface },
                  ]}
                  disabled={mutating}
                  accessibilityRole="button"
                  accessibilityLabel="Rotate invite code"
                  onPress={() => void handleRotateInvite()}
                >
                  <Feather name="rotate-cw" size={14} color={palette.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {pendingMutations.length > 0 ? (
        <View
          style={[
            styles.pendingBanner,
            { backgroundColor: palette.amberLight, borderColor: palette.amber },
          ]}
        >
          <View style={{ flex: 1, gap: Space.s4 }}>
            <Text style={[styles.pendingTitle, { color: palette.amber }]}>
              {pendingMutations.length} offline{' '}
              {pendingMutations.length === 1 ? 'entry' : 'entries'} waiting to sync
            </Text>
            {failedPending?.lastError ? (
              <Text
                style={[
                  styles.pendingSub,
                  {
                    color: isLikelyNetworkError(failedPending.lastError)
                      ? palette.textMuted
                      : palette.danger,
                  },
                ]}
              >
                {isLikelyNetworkError(failedPending.lastError)
                  ? 'Waiting for connection to sync...'
                  : `Last attempt: ${failedPending.lastError}`}
              </Text>
            ) : null}
          </View>
          <View style={styles.inviteActions}>
            <Pressable
              style={[styles.smallPrimaryBtn, { backgroundColor: palette.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Retry offline sync now"
              onPress={() => void syncOfflineQueueNow()}
            >
              <Text style={[styles.smallPrimaryText, { color: palette.accentButtonText }]}>
                Sync now
              </Text>
            </Pressable>
            {failedPending ? (
              <Pressable
                style={[
                  styles.smallSecondaryBtn,
                  { borderColor: palette.danger, backgroundColor: palette.surface },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Discard stuck offline item"
                onPress={() => void removeOfflineMutation(failedPending.id).then(loadAll)}
              >
                <Feather name="trash-2" size={13} color={palette.danger} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: palette.dangerLight }]}>
          <Feather name="alert-circle" size={16} color={palette.danger} />
          <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
        </View>
      ) : null}

      {!loadingShops && grouped.needsReview.length > 0 ? (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: palette.amber }]}>Needs review</Text>
            <Text style={[styles.sectionMeta, { color: palette.textMuted }]}>
              {grouped.needsReview.length}
            </Text>
          </View>
          <View style={styles.shopList}>
            {grouped.needsReview.map((shop) => (
              <ShopRow
                key={shop.id}
                shop={shop}
                creator={findMember(members, shop.created_by)}
                summary={summariesByShop.get(shop.id)}
                openDisputesCount={openDisputesByShop.get(shop.id) ?? 0}
                isSuperAdmin={adminUser}
                onPress={setQuickActionShop}
                onAddCharge={handleDirectAddCharge}
                onRecordPayment={handleDirectRecordPayment}
                onManage={setSelectedShop}
                onQuickApprove={(id) => void handleQuickApprove(id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Shops Section Header + Search & Filter Chips */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitlePair}>
            <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Shops</Text>
            <Text style={[styles.sectionMeta, { color: palette.textMuted }]}>
              {filteredApprovedShops.length}
            </Text>
          </View>
        </View>

        {grouped.activeApproved.length === 0 && grouped.needsReview.length === 0 ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                alignItems: 'center',
                padding: Space.s24,
                gap: Space.s12,
              },
            ]}
          >
            <Feather name="shopping-bag" size={32} color={palette.textMuted} />
            <Text style={[styles.sectionTitle, { color: palette.textPrimary, textAlign: 'center' }]}>
              No shops in this household yet
            </Text>
            <Text style={[styles.helperNote, { color: palette.textSecondary, textAlign: 'center' }]}>
              Add neighborhood shops to track credit purchases and debt payments in ETB.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.primaryActionBtn,
                { backgroundColor: palette.primaryButtonBg, marginTop: Space.s8 },
                pressed && { opacity: 0.9 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add your first shop"
              onPress={() => {
                triggerHaptic('selection');
                setShowCreateShopModal(true);
              }}
            >
              <Feather name="plus" size={16} color={palette.primaryButtonText} />
              <Text style={[styles.primaryActionText, { color: palette.primaryButtonText }]}>
                Add your first shop
              </Text>
            </Pressable>
          </View>
        ) : null}

        {grouped.activeApproved.length > 0 ? (
          <View style={styles.filterBlock}>
            <View
              style={[
                styles.searchWrap,
                { borderColor: palette.border, backgroundColor: palette.surfaceMuted },
              ]}
            >
              <Feather name="search" size={15} color={palette.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: palette.textPrimary }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                accessibilityLabel="Search shops"
                placeholder="Search shops..."
                placeholderTextColor={palette.textMuted}
                returnKeyType="search"
              />
              {searchQuery ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear shop search"
                  onPress={() => setSearchQuery('')}
                >
                  <Feather name="x" size={15} color={palette.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}
            >
              {(
                [
                  ['all', `All (${filterCounts.all})`],
                  ['unpaid', `Unpaid (${filterCounts.unpaid})`],
                  ['due', `Due (${filterCounts.due})`],
                  ['disputed', `Disputed (${filterCounts.disputed})`],
                ] as const
              ).map(([key, label]) => {
                const active = shopFilter === key;
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
                      setShopFilter(key);
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
          </View>
        ) : null}
      </View>
    </View>
  );

  const footerElement = (
    <View style={styles.footerWrap}>
      {loadingShops ? (
        <ActivityIndicator style={{ marginTop: Space.s20 }} color={palette.primary} />
      ) : null}

      {!loadingShops && adminUser && grouped.archivedOrMerged.length > 0 ? (
        <View style={styles.sectionBlock}>
          <Pressable
            style={styles.toggleRow}
            accessibilityRole="button"
            accessibilityLabel={
              showArchived ? 'Hide archived or merged shops' : 'Show archived or merged shops'
            }
            onPress={() => setShowArchived((v) => !v)}
          >
            <Feather
              name={showArchived ? 'chevron-down' : 'chevron-right'}
              size={16}
              color={palette.textSecondary}
            />
            <Text style={[styles.toggleArchived, { color: palette.textSecondary }]}>
              {showArchived ? 'Hide' : 'Show'} archived or merged ({grouped.archivedOrMerged.length})
            </Text>
          </Pressable>
          {showArchived ? (
            <View style={styles.shopList}>
              {grouped.archivedOrMerged.map((shop) => (
                <ShopRow
                  key={shop.id}
                  shop={shop}
                  creator={findMember(members, shop.created_by)}
                  summary={summariesByShop.get(shop.id)}
                  isSuperAdmin={adminUser}
                  onPress={openShopDetail}
                  onManage={setSelectedShop}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const emptyElement = loadingShops ? undefined : (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.emptyText, { color: palette.textMuted }]}>
        {grouped.activeApproved.length === 0 && grouped.needsReview.length === 0
          ? 'No shops added yet. Add your first shop above to start tracking credit in ETB.'
          : 'No shops match the selected filter.'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <FlatList
          data={loadingShops ? [] : filteredApprovedShops}
          keyExtractor={(item) => item.id}
          renderItem={renderApprovedShop}
          ListHeaderComponent={headerElement}
          ListEmptyComponent={emptyElement}
          ListFooterComponent={footerElement}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refreshAll()}
              tintColor={palette.primary}
            />
          }
        />
      </KeyboardAvoidingView>

      <ShopManageModal
        shop={selectedShop}
        mergeTargets={shops}
        busy={mutating}
        onClose={() => setSelectedShop(null)}
        onApprove={async (shopId) => {
          setMutating(true);
          try {
            await approveShop(shopId);
            await loadAll();
          } finally {
            setMutating(false);
          }
        }}
        onRename={async (shopId, newName) => {
          setMutating(true);
          try {
            await renameShop(shopId, newName);
            await loadAll();
          } finally {
            setMutating(false);
          }
        }}
        onToggleArchive={async (shopId, archived) => {
          setMutating(true);
          try {
            await setShopArchived(shopId, archived);
            await loadAll();
          } finally {
            setMutating(false);
          }
        }}
        onMerge={async (sourceShopId, targetShopId) => {
          setMutating(true);
          try {
            await mergeShops(sourceShopId, targetShopId);
            await loadAll();
          } finally {
            setMutating(false);
          }
        }}
      />

      <ShopQuickActionsModal
        visible={Boolean(quickActionShop)}
        shop={quickActionShop}
        balanceText={
          quickActionShop && summariesByShop.get(quickActionShop.id)
            ? summariesByShop.get(quickActionShop.id)!.balanceSantim < 0
              ? `Credit ${formatEtb(Math.abs(summariesByShop.get(quickActionShop.id)!.balanceSantim))}`
              : formatEtb(summariesByShop.get(quickActionShop.id)!.balanceSantim)
            : '0 ETB'
        }
        status={quickActionShop ? summariesByShop.get(quickActionShop.id)?.status : undefined}
        isSuperAdmin={adminUser}
        onClose={() => setQuickActionShop(null)}
        onAddCharge={(s) => handleDirectAddCharge(s)}
        onRecordPayment={(s) => handleDirectRecordPayment(s)}
        onViewStatement={(s) => openShopDetail(s)}
        onManage={(s) => setSelectedShop(s)}
      />

      <CreateShopModal
        visible={showCreateShopModal}
        onClose={() => setShowCreateShopModal(false)}
        onCreated={() => {
          void loadAll();
        }}
        householdId={household.id}
        userId={session.user.id}
        isSuperAdmin={adminUser}
        existingShopNames={shops.map((s) => s.name)}
      />

      <AppBottomNav active="home" isSuperAdmin={adminUser} />
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
    gap: Space.s16,
    marginBottom: Space.s12,
  },
  shopItemWrap: {
    marginBottom: Space.s12,
  },
  footerWrap: {
    marginTop: Space.s8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.s12,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  topAddShopBtn: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
  },
  topAddShopText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
  },
  appWordmark: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  householdName: {
    fontFamily: Fonts.sansSemi,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s6,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: 6,
  },
  memberDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  memberChipText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  ledgerCard: {
    borderRadius: Radius.card,
    padding: Space.s16,
    borderWidth: Hairline,
    gap: Space.s12,
  },
  balanceBlock: {
    gap: Space.s4,
  },
  balanceLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  balanceValue: {
    fontFamily: Fonts.sansSemi,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    marginTop: Space.s4,
  },
  partnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  partnerText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  mlLedgerStrip: {
    borderTopWidth: Hairline,
    paddingTop: Space.s10,
    gap: Space.s4,
  },
  mlLedgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.s8,
  },
  mlLedgerLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  mlLedgerValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: 13,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  mlPriceAlertText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: Space.s8,
  },
  primaryActionBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
    borderRadius: Radius.control,
  },
  primaryActionText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
  inviteBox: {
    borderRadius: Radius.innerCard,
    borderWidth: Hairline,
    padding: Space.s12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s12,
  },
  inviteLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  inviteCode: {
    fontFamily: Fonts.monoMedium,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  inviteActions: {
    flexDirection: 'row',
    gap: Space.s8,
  },
  pendingBanner: {
    borderRadius: Radius.innerCard,
    borderWidth: Hairline,
    padding: Space.s12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s12,
  },
  pendingTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  pendingSub: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  smallPrimaryBtn: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
  },
  smallPrimaryText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  smallSecondaryBtn: {
    width: 36,
    height: 36,
    borderWidth: Hairline,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBlock: {
    gap: Space.s8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.s8,
  },
  sectionTitlePair: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.s8,
  },
  addToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
    borderWidth: Hairline,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s4,
  },
  addToggleText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
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
  card: {
    borderRadius: Radius.card,
    padding: Space.s16,
    borderWidth: Hairline,
    gap: Space.s12,
  },
  filterBlock: {
    gap: Space.s8,
  },
  searchWrap: {
    height: 42,
    borderWidth: Hairline,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
    paddingVertical: 0,
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
  helperNote: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  shopList: {
    gap: Space.s12,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  mutedText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    paddingVertical: Space.s4,
  },
  toggleArchived: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
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
  disabled: {
    opacity: 0.5,
  },
});
