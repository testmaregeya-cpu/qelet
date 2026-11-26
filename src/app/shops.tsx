import Feather from '@expo/vector-icons/Feather';
import { Redirect, router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
import { StatusBadge } from '../components/StatusBadge';
import { calculateShopLedgerSummary, getAddisAbabaDateString } from '../domain/billing';
import { buildTopBalanceShops, buildUpcomingAndDueShops } from '../domain/dashboard';
import { useHouseholdLedger } from '../hooks/useHouseholdLedger';
import { triggerHaptic } from '../lib/haptics';
import { formatEtb } from '../lib/money';
import { findMember, isSuperAdmin, splitShopsByStatus } from '../lib/shopRules';
import { rotateInviteCode } from '../services/household';
import { removeOfflineMutation } from '../services/offlineQueue';
import {
  approveShop,
  mergeShops,
  renameShop,
  setShopArchived,
} from '../services/shops';
import { useSession } from '../state/SessionContext';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';
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
    priceMemory,
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

  const upcomingAndDue = useMemo(
    () => buildUpcomingAndDueShops(shops, summariesByShop),
    [shops, summariesByShop]
  );

  const topBalances = useMemo(
    () => buildTopBalanceShops(shops, summariesByShop, 3),
    [shops, summariesByShop]
  );

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

  const activeShopMap = useMemo(() => {
    const map = new Map<string, Shop>();
    for (const s of shops) {
      if (!s.archived && s.merged_into_shop_id === null) {
        map.set(s.id, s);
      }
    }
    return map;
  }, [shops]);

  const quickMemoryButtons = useMemo(
    () =>
      priceMemory
        .filter((m) => m.last_unit_price_santim > 0 && activeShopMap.has(m.shop_id))
        .slice(0, 6),
    [priceMemory, activeShopMap]
  );

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
        setError(err instanceof Error ? err.message : 'Failed to approve shop');
      } finally {
        setMutating(false);
      }
    },
    [loadAll, setError]
  );

  const activeShopsExist =
    grouped.needsReview.length + grouped.activeApproved.length > 0;

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
      setError(err instanceof Error ? err.message : 'Failed to rotate invite code');
    } finally {
      setMutating(false);
    }
  };

  const failedPending = pendingMutations.find((m) => Boolean(m.lastError));

  const headerElement = (
    <View style={styles.headerSections}>
      {/* Top Context Row */}
      <View style={styles.topRow}>
        <View style={{ flex: 1, gap: Space.s4 }}>
          <Text style={[styles.appWordmark, { color: palette.textMuted }]}>Qelet ledger</Text>
          <Text style={[styles.householdName, { color: palette.textPrimary }]} numberOfLines={1}>
            {household.name}
          </Text>
        </View>

        <View
          style={[
            styles.memberChip,
            { backgroundColor: palette.surface, borderColor: palette.border },
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
      </View>

      {/* Focal Moment: Household Balance Sheet + Payday Window */}
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

        <View style={styles.quickActionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryActionBtn,
              { backgroundColor: palette.primaryButtonBg },
              !activeShopsExist && styles.disabled,
              pressed && { opacity: 0.9 },
            ]}
            disabled={!activeShopsExist}
            accessibilityRole="button"
            accessibilityLabel="Add credit charge"
            onPress={() => {
              triggerHaptic('selection');
              router.push('/add-charge');
            }}
          >
            <Feather name="plus" size={16} color={palette.primaryButtonText} />
            <Text style={[styles.primaryActionText, { color: palette.primaryButtonText }]}>
              Add charge
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryActionBtn,
              {
                borderColor: palette.borderStrong,
                backgroundColor: palette.surfaceMuted,
              },
              !activeShopsExist && styles.disabled,
              pressed && { opacity: 0.85 },
            ]}
            disabled={!activeShopsExist}
            accessibilityRole="button"
            accessibilityLabel="Record payment"
            onPress={() => {
              triggerHaptic('selection');
              router.push('/record-payment');
            }}
          >
            <Feather name="check" size={16} color={palette.textPrimary} />
            <Text style={[styles.secondaryActionText, { color: palette.textPrimary }]}>
              Record payment
            </Text>
          </Pressable>
        </View>

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
              <Text style={[styles.pendingSub, { color: palette.danger }]}>
                Last attempt: {failedPending.lastError}
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

      {/* Quick-Add From Remembered Prices */}
      {quickMemoryButtons.length > 0 ? (
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>Quick add</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickStrip}
          >
            {quickMemoryButtons.map((mem) => {
              const shopName = activeShopMap.get(mem.shop_id)?.name ?? 'Shop';
              return (
                <Pressable
                  key={`${mem.shop_id}:${mem.item_key}`}
                  style={({ pressed }) => [
                    styles.quickChip,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Quick add ${mem.item_name} at ${shopName}`}
                  onPress={() =>
                    router.push({
                      pathname: '/add-charge',
                      params: {
                        shopId: mem.shop_id,
                        presetItemName: mem.item_name,
                        presetUnit: mem.last_unit,
                        presetPriceSantim: String(mem.last_unit_price_santim),
                      },
                    })
                  }
                >
                  <View style={styles.quickChipTop}>
                    <Text style={[styles.quickChipTitle, { color: palette.textPrimary }]}>
                      {mem.item_name}
                    </Text>
                    <Text style={[styles.quickChipPrice, { color: palette.primary }]}>
                      {formatEtb(mem.last_unit_price_santim)}
                    </Text>
                  </View>
                  <Text style={[styles.quickChipSub, { color: palette.textMuted }]}>{shopName}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Upcoming & Due */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
            Upcoming & due
          </Text>
          <Text style={[styles.sectionMeta, { color: palette.textMuted }]}>Days 24–26</Text>
        </View>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          {upcomingAndDue.length === 0 ? (
            <Text style={[styles.mutedText, { color: palette.textMuted }]}>
              No overdue or due-soon balances right now.
            </Text>
          ) : (
            upcomingAndDue.map(({ shop, summary }, idx) => (
              <View
                key={shop.id}
                style={[
                  styles.dashRow,
                  idx < upcomingAndDue.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: palette.border,
                  },
                ]}
              >
                <Pressable
                  style={styles.dashLeft}
                  accessibilityRole="button"
                  accessibilityLabel={`${shop.name}, balance ${formatEtb(summary.balanceSantim)}`}
                  onPress={() => {
                    triggerHaptic('selection');
                    setQuickActionShop(shop);
                  }}
                >
                  <Text style={[styles.dashName, { color: palette.textPrimary }]} numberOfLines={1}>
                    {shop.name}
                  </Text>
                  <View style={styles.dashMeta}>
                    <StatusBadge status={summary.status} />
                    <Text style={[styles.dashAmount, { color: palette.textPrimary }]}>
                      {formatEtb(summary.balanceSantim)}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.payChip,
                    { backgroundColor: palette.primaryLight },
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Pay ${shop.name}`}
                  onPress={() =>
                    router.push({ pathname: '/record-payment', params: { shopId: shop.id } })
                  }
                >
                  <Text style={[styles.payChipText, { color: palette.primary }]}>Pay</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Top Balances */}
      {topBalances.length > 0 ? (
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>Top balances</Text>
          <View
            style={[
              styles.card,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            {topBalances.map(({ shop, summary }, index) => (
              <Pressable
                key={shop.id}
                style={[
                  styles.dashRow,
                  index < topBalances.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: palette.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${shop.name}, balance ${formatEtb(summary.balanceSantim)}`}
                onPress={() => {
                  triggerHaptic('selection');
                  setQuickActionShop(shop);
                }}
              >
                <Text style={[styles.rankNum, { color: palette.textMuted }]}>
                  {String(index + 1).padStart(2, '0')}
                </Text>
                <Text
                  style={[styles.dashName, { color: palette.textPrimary, flex: 1 }]}
                  numberOfLines={1}
                >
                  {shop.name}
                </Text>
                <Text style={[styles.dashAmount, { color: palette.textPrimary }]}>
                  {formatEtb(summary.balanceSantim)}
                </Text>
              </Pressable>
            ))}
          </View>
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

      {/* All Shops Controls (Header + Search + Filter + Collapsible Add) */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitlePair}>
            <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>All shops</Text>
            <Text style={[styles.sectionMeta, { color: palette.textMuted }]}>
              {filteredApprovedShops.length}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.addToggleBtn,
              {
                borderColor: palette.borderStrong,
                backgroundColor: palette.surface,
              },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add new shop"
            onPress={() => {
              triggerHaptic('selection');
              setShowCreateShopModal(true);
            }}
          >
            <Feather
              name="plus"
              size={13}
              color={palette.textPrimary}
            />
            <Text
              style={[
                styles.addToggleText,
                { color: palette.textPrimary },
              ]}
            >
              Add shop
            </Text>
          </Pressable>
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
                { borderColor: palette.borderStrong, backgroundColor: palette.surface },
              ]}
            >
              <Feather name="search" size={14} color={palette.textMuted} />
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
                  <Feather name="x" size={14} color={palette.textMuted} />
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
                  ['all', 'All'],
                  ['unpaid', 'Unpaid'],
                  ['due', 'Due soon/now'],
                  ['disputed', 'Disputed'],
                ] as const
              ).map(([key, label]) => {
                const active = shopFilter === key;
                return (
                  <Pressable
                    key={key}
                    style={[
                      styles.filterChip,
                      {
                        borderColor: active ? palette.primary : palette.borderStrong,
                        backgroundColor: active ? palette.primaryLight : palette.surface,
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
                        { color: active ? palette.primary : palette.textSecondary },
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
    gap: Space.s24,
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
  appWordmark: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  householdName: {
    fontFamily: Fonts.sansMedium,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s8,
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
    padding: Space.s20,
    borderWidth: 1,
    gap: Space.s16,
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
    fontFamily: Fonts.sansMedium,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.5,
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
  quickActionRow: {
    flexDirection: 'row',
    gap: Space.s8,
  },
  primaryActionBtn: {
    flex: 1,
    height: 44,
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
  secondaryActionBtn: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
    borderWidth: 1,
    borderRadius: Radius.control,
  },
  secondaryActionText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
  inviteBox: {
    borderRadius: Radius.innerCard,
    borderWidth: 1,
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
    borderWidth: 1,
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
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
  },
  smallPrimaryText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  smallSecondaryBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: Radius.control,
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
    borderWidth: 1,
    borderRadius: Radius.control,
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
    borderWidth: 1,
    gap: Space.s12,
  },
  quickStrip: {
    gap: Space.s8,
  },
  quickChip: {
    borderWidth: 1,
    borderRadius: Radius.innerCard,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s8,
    gap: Space.s4,
  },
  quickChipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  quickChipTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  quickChipPrice: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  quickChipSub: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  dashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.s8,
    gap: Space.s12,
  },
  dashLeft: {
    flex: 1,
    gap: Space.s4,
  },
  dashName: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  dashMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  dashAmount: {
    fontFamily: Fonts.monoMedium,
    fontSize: 14,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  rankNum: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    width: 24,
    fontVariant: ['tabular-nums'],
  },
  payChip: {
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s8,
  },
  payChipText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  addRow: {
    flexDirection: 'row',
    gap: Space.s8,
    alignItems: 'center',
  },
  addInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  addBtn: {
    height: 44,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
  filterBlock: {
    gap: Space.s8,
  },
  searchWrap: {
    height: 40,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
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
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s4,
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
