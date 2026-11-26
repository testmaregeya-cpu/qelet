import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Space, Radius, Fonts } from '../theme/tokens';
import { triggerHaptic } from '../lib/haptics';
import { formatEtb } from '../lib/money';
import {
  checkIsPlatformAdmin,
  fetchPlatformMetrics,
  fetchPlatformUsers,
  fetchPlatformHouseholds,
  banPlatformUser,
  unbanPlatformUser,
  type PlatformMetrics,
  type PlatformUserItem,
  type PlatformHouseholdItem,
} from '../services/platformAdmin';

export default function PlatformConsoleScreen() {
  const { palette } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'households'>('users');
  const [searchQuery, setSearchQuery] = useState('');

  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [users, setUsers] = useState<PlatformUserItem[]>([]);
  const [households, setHouseholds] = useState<PlatformHouseholdItem[]>([]);

  // Ban modal state
  const [banModalUser, setBanModalUser] = useState<PlatformUserItem | null>(null);
  const [banReason, setBanReason] = useState('Terms violation');
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const admin = await checkIsPlatformAdmin();
      setIsAdmin(admin);

      if (!admin) {
        setLoading(false);
        return;
      }

      const [m, u, h] = await Promise.all([
        fetchPlatformMetrics(),
        fetchPlatformUsers(),
        fetchPlatformHouseholds(),
      ]);

      setMetrics(m);
      setUsers(u);
      setHouseholds(h);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platform data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    checkIsPlatformAdmin()
      .then((admin) => {
        if (!active) return;
        setIsAdmin(admin);
        if (!admin) {
          setLoading(false);
          return;
        }
        return Promise.all([
          fetchPlatformMetrics(),
          fetchPlatformUsers(),
          fetchPlatformHouseholds(),
        ]).then(([m, u, h]) => {
          if (!active) return;
          setMetrics(m);
          setUsers(u);
          setHouseholds(h);
          setError(null);
        });
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load platform data');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  const handleConfirmBan = async () => {
    if (!banModalUser) return;
    setMutating(true);
    triggerHaptic('selection');

    try {
      await banPlatformUser(banModalUser.user_id, banReason);
      triggerHaptic('success');
      setBanModalUser(null);
      setBanReason('Terms violation');
      await loadData();
    } catch (err) {
      triggerHaptic('error');
      Alert.alert('Action Failed', err instanceof Error ? err.message : 'Could not suspend user');
    } finally {
      setMutating(false);
    }
  };

  const handleConfirmUnban = async (user: PlatformUserItem) => {
    setMutating(true);
    triggerHaptic('selection');

    try {
      await unbanPlatformUser(user.user_id);
      triggerHaptic('success');
      await loadData();
    } catch (err) {
      triggerHaptic('error');
      Alert.alert('Action Failed', err instanceof Error ? err.message : 'Could not unban user');
    } finally {
      setMutating(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q) ||
        u.household_name.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const filteredHouseholds = useMemo(() => {
    if (!searchQuery.trim()) return households;
    const q = searchQuery.toLowerCase();
    return households.filter(
      (h) =>
        h.household_name.toLowerCase().includes(q) ||
        h.invite_code.toLowerCase().includes(q)
    );
  }, [households, searchQuery]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={[styles.loadingText, { color: palette.textSecondary }]}>
          Authenticating platform administrator...
        </Text>
      </SafeAreaView>
    );
  }

  if (isAdmin === false) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.background, padding: Space.s24 }]}>
        <Feather name="shield-off" size={48} color={palette.danger} />
        <Text style={[styles.deniedTitle, { color: palette.textPrimary }]}>Access Denied</Text>
        <Text style={[styles.deniedDesc, { color: palette.textSecondary }]}>
          Your account is not registered as a platform administrator.
        </Text>
        <Pressable
          style={[styles.backBtn, { backgroundColor: palette.primary }]}
          onPress={() => router.replace('/shops')}
        >
          <Text style={[styles.backBtnText, { color: palette.accentButtonText }]}>
            Back to Household
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <Pressable
          style={({ pressed }) => [styles.headerBackBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather name="arrow-left" size={20} color={palette.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>
              Platform Console
            </Text>
            <View style={[styles.superBadge, { backgroundColor: palette.primaryLight }]}>
              <Feather name="shield" size={12} color={palette.primary} />
              <Text style={[styles.superBadgeText, { color: palette.primary }]}>Master</Text>
            </View>
          </View>
          <Text style={[styles.headerSub, { color: palette.textMuted }]}>
            Multi-household governance & safety controls
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: palette.dangerLight }]}>
            <Feather name="alert-triangle" size={16} color={palette.danger} />
            <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
          </View>
        ) : null}

        {/* KPI Metrics Dashboard */}
        {metrics ? (
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>Total Households</Text>
              <Text style={[styles.metricVal, { color: palette.textPrimary }]}>{metrics.total_households}</Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>Registered Users</Text>
              <Text style={[styles.metricVal, { color: palette.textPrimary }]}>{metrics.total_users}</Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>Active Shops</Text>
              <Text style={[styles.metricVal, { color: palette.textPrimary }]}>{metrics.total_shops}</Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>Gross Credit</Text>
              <Text style={[styles.metricVal, { color: palette.primary }]}>
                {formatEtb(metrics.gross_credit_santim)}
              </Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>Total Settled</Text>
              <Text style={[styles.metricVal, { color: palette.textPrimary }]}>
                {formatEtb(metrics.gross_payments_santim)}
              </Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.metricLabel, { color: palette.textSecondary }]}>Suspended</Text>
              <Text style={[styles.metricVal, { color: metrics.total_banned_users > 0 ? palette.danger : palette.textMuted }]}>
                {metrics.total_banned_users}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Tab Controls */}
        <View style={styles.tabBar}>
          <Pressable
            style={[
              styles.tabBtn,
              activeTab === 'users' && {
                borderBottomColor: palette.primary,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => {
              triggerHaptic('selection');
              setActiveTab('users');
            }}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'users' ? palette.primary : palette.textSecondary },
              ]}
            >
              All Users ({users.length})
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.tabBtn,
              activeTab === 'households' && {
                borderBottomColor: palette.primary,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => {
              triggerHaptic('selection');
              setActiveTab('households');
            }}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'households' ? palette.primary : palette.textSecondary },
              ]}
            >
              All Households ({households.length})
            </Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Feather name="search" size={15} color={palette.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: palette.textPrimary }]}
            placeholder={activeTab === 'users' ? 'Search by email, name, household...' : 'Search households...'}
            placeholderTextColor={palette.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')}>
              <Feather name="x" size={14} color={palette.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* Users Tab List */}
        {activeTab === 'users' ? (
          <View style={styles.listSection}>
            {filteredUsers.length === 0 ? (
              <Text style={[styles.emptyNote, { color: palette.textMuted }]}>No matching users found.</Text>
            ) : (
              filteredUsers.map((u) => (
                <View
                  key={u.user_id}
                  style={[
                    styles.userCard,
                    { backgroundColor: palette.surface, borderColor: palette.border },
                    u.is_banned && { borderColor: palette.dangerLight, backgroundColor: palette.dangerLight + '20' },
                  ]}
                >
                  <View style={styles.userCardTop}>
                    <View style={styles.userInfo}>
                      <Text style={[styles.userName, { color: palette.textPrimary }]}>{u.display_name}</Text>
                      <Text style={[styles.userEmail, { color: palette.textMuted }]}>{u.email}</Text>
                    </View>

                    <View style={styles.badgesCol}>
                      {u.is_banned ? (
                        <View style={[styles.pillBadge, { backgroundColor: palette.dangerLight }]}>
                          <Text style={[styles.pillBadgeText, { color: palette.danger }]}>Suspended</Text>
                        </View>
                      ) : (
                        <View style={[styles.pillBadge, { backgroundColor: palette.primaryLight }]}>
                          <Text style={[styles.pillBadgeText, { color: palette.primary }]}>{u.role}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.userMetaRow}>
                    <Feather name="home" size={12} color={palette.textMuted} />
                    <Text style={[styles.householdTag, { color: palette.textSecondary }]}>
                      {u.household_name}
                    </Text>
                    {u.ban_reason ? (
                      <Text style={[styles.banReasonTag, { color: palette.danger }]}>
                        Reason: {u.ban_reason}
                      </Text>
                    ) : null}
                  </View>

                  {/* Ban / Unban Trigger */}
                  <View style={styles.userActionRow}>
                    {u.is_banned ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.actionPillBtn,
                          { backgroundColor: palette.primaryLight, borderColor: palette.primary },
                          pressed && { opacity: 0.8 },
                        ]}
                        disabled={mutating}
                        onPress={() => void handleConfirmUnban(u)}
                      >
                        <Feather name="check" size={13} color={palette.primary} />
                        <Text style={[styles.actionPillText, { color: palette.primary }]}>
                          Reinstate Account
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={({ pressed }) => [
                          styles.actionPillBtn,
                          { backgroundColor: palette.dangerLight, borderColor: palette.danger },
                          pressed && { opacity: 0.8 },
                        ]}
                        disabled={mutating}
                        onPress={() => {
                          triggerHaptic('selection');
                          setBanModalUser(u);
                        }}
                      >
                        <Feather name="slash" size={13} color={palette.danger} />
                        <Text style={[styles.actionPillText, { color: palette.danger }]}>
                          Suspend User
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}

        {/* Households Tab List */}
        {activeTab === 'households' ? (
          <View style={styles.listSection}>
            {filteredHouseholds.length === 0 ? (
              <Text style={[styles.emptyNote, { color: palette.textMuted }]}>No matching households found.</Text>
            ) : (
              filteredHouseholds.map((h) => (
                <View
                  key={h.household_id}
                  style={[styles.householdCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
                >
                  <View style={styles.householdHeader}>
                    <Text style={[styles.householdName, { color: palette.textPrimary }]}>
                      {h.household_name}
                    </Text>
                    <View style={[styles.codeBadge, { backgroundColor: palette.background, borderColor: palette.border }]}>
                      <Text style={[styles.codeBadgeText, { color: palette.textSecondary }]}>
                        Invite: {h.invite_code}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.householdStatsRow}>
                    <View style={styles.hStat}>
                      <Text style={[styles.hStatVal, { color: palette.textPrimary }]}>{h.member_count}</Text>
                      <Text style={[styles.hStatLbl, { color: palette.textMuted }]}>Members</Text>
                    </View>
                    <View style={styles.hStat}>
                      <Text style={[styles.hStatVal, { color: palette.textPrimary }]}>{h.shop_count}</Text>
                      <Text style={[styles.hStatLbl, { color: palette.textMuted }]}>Shops</Text>
                    </View>
                    <View style={styles.hStat}>
                      <Text style={[styles.hStatVal, { color: palette.primary }]}>
                        {formatEtb(h.total_balance_santim)}
                      </Text>
                      <Text style={[styles.hStatLbl, { color: palette.textMuted }]}>Net Balance</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* Suspend User Confirmation Modal */}
      <Modal visible={Boolean(banModalUser)} transparent animationType="fade" onRequestClose={() => setBanModalUser(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.modalHeader}>
              <Feather name="alert-octagon" size={24} color={palette.danger} />
              <Text style={[styles.modalTitle, { color: palette.textPrimary }]}>
                Suspend User Account
              </Text>
            </View>

            <Text style={[styles.modalDesc, { color: palette.textSecondary }]}>
              Suspending {banModalUser?.display_name} ({banModalUser?.email}) will immediately block them from recording charges or payments.
            </Text>

            <View style={styles.reasonGroup}>
              <Text style={[styles.reasonLabel, { color: palette.textSecondary }]}>Suspension Reason</Text>
              <TextInput
                style={[styles.reasonInput, { backgroundColor: palette.background, borderColor: palette.borderStrong, color: palette.textPrimary }]}
                value={banReason}
                onChangeText={setBanReason}
                placeholder="Reason for suspension"
                placeholderTextColor={palette.textMuted}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: palette.borderStrong }]}
                disabled={mutating}
                onPress={() => setBanModalUser(null)}
              >
                <Text style={[styles.modalCancelText, { color: palette.textPrimary }]}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBanBtn, { backgroundColor: palette.danger }]}
                disabled={mutating}
                onPress={() => void handleConfirmBan()}
              >
                {mutating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalBanText}>Confirm Suspend</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: Fonts.sans, fontSize: 14, marginTop: Space.s12 },
  deniedTitle: { fontFamily: Fonts.sansSemi, fontSize: 20, marginTop: Space.s16 },
  deniedDesc: { fontFamily: Fonts.sans, fontSize: 14, textAlign: 'center', marginTop: Space.s8 },
  backBtn: {
    paddingHorizontal: Space.s20,
    paddingVertical: Space.s12,
    borderRadius: Radius.control,
    marginTop: Space.s24,
  },
  backBtnText: { fontFamily: Fonts.sansSemi, fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.s16,
    paddingVertical: Space.s12,
    borderBottomWidth: 1,
    gap: Space.s12,
  },
  headerBackBtn: { padding: Space.s4 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.s8 },
  headerTitle: { fontFamily: Fonts.sansSemi, fontSize: 18 },
  superBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.s8,
    paddingVertical: 2,
    borderRadius: Radius.tag,
  },
  superBadgeText: { fontFamily: Fonts.sansSemi, fontSize: 11 },
  headerSub: { fontFamily: Fonts.sans, fontSize: 12 },
  scrollContent: { padding: Space.s16, gap: Space.s16 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    padding: Space.s12,
    borderRadius: Radius.control,
  },
  errorText: { fontFamily: Fonts.sansMedium, fontSize: 13, flex: 1 },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.s8,
  },
  metricCard: {
    width: '48.5%',
    padding: Space.s12,
    borderRadius: Radius.card,
    borderWidth: 1,
    gap: 4,
  },
  metricLabel: { fontFamily: Fonts.sans, fontSize: 11 },
  metricVal: { fontFamily: Fonts.monoMedium, fontSize: 18 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#E3E3DC',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Space.s12,
    alignItems: 'center',
  },
  tabText: { fontFamily: Fonts.sansSemi, fontSize: 14 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    paddingHorizontal: Space.s12,
    height: 44,
    borderRadius: Radius.control,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontFamily: Fonts.sans, fontSize: 14 },
  listSection: { gap: Space.s12 },
  emptyNote: { fontFamily: Fonts.sans, fontSize: 13, textAlign: 'center', padding: Space.s20 },
  userCard: {
    padding: Space.s12,
    borderRadius: Radius.card,
    borderWidth: 1,
    gap: Space.s8,
  },
  userCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontFamily: Fonts.sansSemi, fontSize: 15 },
  userEmail: { fontFamily: Fonts.sans, fontSize: 12 },
  badgesCol: { alignItems: 'flex-end' },
  pillBadge: {
    paddingHorizontal: Space.s8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  pillBadgeText: { fontFamily: Fonts.sansMedium, fontSize: 11 },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
  },
  householdTag: { fontFamily: Fonts.sans, fontSize: 12 },
  banReasonTag: { fontFamily: Fonts.sans, fontSize: 12, marginLeft: Space.s8 },
  userActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Space.s4,
  },
  actionPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  actionPillText: { fontFamily: Fonts.sansMedium, fontSize: 12 },
  householdCard: {
    padding: Space.s16,
    borderRadius: Radius.card,
    borderWidth: 1,
    gap: Space.s12,
  },
  householdHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  householdName: { fontFamily: Fonts.sansSemi, fontSize: 16 },
  codeBadge: {
    paddingHorizontal: Space.s8,
    paddingVertical: 2,
    borderRadius: Radius.tag,
    borderWidth: 1,
  },
  codeBadgeText: { fontFamily: Fonts.mono, fontSize: 11 },
  householdStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: Space.s8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#E3E3DC',
  },
  hStat: { alignItems: 'center', gap: 2 },
  hStatVal: { fontFamily: Fonts.monoMedium, fontSize: 15 },
  hStatLbl: { fontFamily: Fonts.sans, fontSize: 11 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Space.s20,
  },
  modalContent: {
    borderRadius: Radius.card,
    padding: Space.s20,
    borderWidth: 1,
    gap: Space.s16,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: Space.s8 },
  modalTitle: { fontFamily: Fonts.sansSemi, fontSize: 18 },
  modalDesc: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
  reasonGroup: { gap: Space.s8 },
  reasonLabel: { fontFamily: Fonts.sansMedium, fontSize: 12 },
  reasonInput: {
    height: 44,
    borderRadius: Radius.control,
    borderWidth: 1,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  modalActions: { flexDirection: 'row', gap: Space.s12, marginTop: Space.s8 },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  modalBanBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBanText: { fontFamily: Fonts.sansSemi, fontSize: 14, color: '#FFFFFF' },
});
