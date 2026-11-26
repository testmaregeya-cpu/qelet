import Feather from '@expo/vector-icons/Feather';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LedgerHeader } from '../../components/LedgerHeader';
import { formatBillMonthLabel } from '../../domain/billing';
import { createTrailingDebouncer } from '../../lib/debounce';
import {
  canEditOrVoidEntry,
  canRaiseDispute,
  canResolveDispute,
  describeEntryHistoryRecord,
} from '../../lib/entryHistory';
import { triggerHaptic } from '../../lib/haptics';
import { formatEtb, formatQuantityMilli } from '../../lib/money';
import { findMember } from '../../lib/shopRules';
import {
  fetchEntryDetail,
  fetchEntryHistory,
  raiseDispute,
  resolveDispute,
  subscribeToLedgerRealtime,
  voidEntry,
} from '../../services/ledger';
import { fetchShops } from '../../services/shops';
import { useSession } from '../../state/SessionContext';
import { useTheme } from '../../theme/ThemeContext';
import { Fonts, Radius, Space } from '../../theme/tokens';
import type { Shop } from '../../types/phase1';
import type { LedgerEntry } from '../../types/phase2';
import type { Dispute, EntryHistoryRecord } from '../../types/phase3';

const VOID_PRESET_REASONS = ['Wrong amount', 'Duplicate entry', 'Wrong shop'] as const;

export default function EntryDetailScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Array.isArray(id) ? id[0] : id;

  const { loading, session, householdContext } = useSession();
  const [entry, setEntry] = useState<LedgerEntry | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [history, setHistory] = useState<EntryHistoryRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [disputeNote, setDisputeNote] = useState('');
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const householdId = householdContext?.household.id ?? null;

  const loadDetail = useCallback(async () => {
    if (!householdId || !entryId) return;
    try {
      const [{ entry: nextEntry, disputes: nextDisputes }, nextHistory, shopList] =
        await Promise.all([
          fetchEntryDetail(entryId),
          fetchEntryHistory(entryId),
          fetchShops(householdId),
        ]);
      setError(null);
      setEntry(nextEntry);
      setDisputes(nextDisputes);
      setHistory(nextHistory);
      if (nextEntry) {
        setShop(shopList.find((s) => s.id === nextEntry.shop_id) ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entry');
    } finally {
      setLoadingData(false);
    }
  }, [householdId, entryId]);

  useEffect(() => {
    if (!householdId || !entryId) return;
    let active = true;

    void Promise.all([
      fetchEntryDetail(entryId),
      fetchEntryHistory(entryId),
      fetchShops(householdId),
    ])
      .then(([{ entry: nextEntry, disputes: nextDisputes }, nextHistory, shopList]) => {
        if (!active) return;
        setError(null);
        setEntry(nextEntry);
        setDisputes(nextDisputes);
        setHistory(nextHistory);
        if (nextEntry) {
          setShop(shopList.find((s) => s.id === nextEntry.shop_id) ?? null);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load entry');
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    const debouncedReload = createTrailingDebouncer(() => {
      if (active) void loadDetail();
    }, 350);
    const unsub = subscribeToLedgerRealtime(householdId, debouncedReload.trigger);
    return () => {
      active = false;
      debouncedReload.cancel();
      unsub();
    };
  }, [householdId, entryId, loadDetail]);

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }
  if (!loading && !householdContext) {
    return <Redirect href="/link-household" />;
  }
  if (!householdContext || !session || !entryId) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </SafeAreaView>
    );
  }

  const { members } = householdContext;
  const currentUserId = session.user.id;
  const creator = entry ? findMember(members, entry.created_by) : undefined;
  const openDispute = disputes.find((d) => d.status === 'open') ?? null;

  const canEditOrVoid = entry ? canEditOrVoidEntry(entry, currentUserId) : false;
  const canFlag = entry ? canRaiseDispute(entry, disputes, currentUserId) : false;
  const canResolve =
    entry && openDispute ? canResolveDispute(entry, openDispute, currentUserId) : false;

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDetail();
    setRefreshing(false);
  };

  const handleRaiseDispute = async () => {
    if (!entry) return;
    setError(null);
    setMutating(true);
    try {
      await raiseDispute(entry.id, disputeNote);
      triggerHaptic('success');
      setDisputeNote('');
      setShowDisputeForm(false);
      await loadDetail();
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Failed to flag dispute');
    } finally {
      setMutating(false);
    }
  };

  const handleResolveDispute = async () => {
    if (!openDispute) return;
    setError(null);
    setMutating(true);
    try {
      await resolveDispute(openDispute.id, resolutionNote);
      triggerHaptic('success');
      setResolutionNote('');
      await loadDetail();
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    } finally {
      setMutating(false);
    }
  };

  const handleVoidEntry = async () => {
    if (!entry) return;
    setError(null);
    setMutating(true);
    try {
      await voidEntry(entry.id, voidReason);
      triggerHaptic('success');
      setVoidReason('');
      setShowVoidModal(false);
      await loadDetail();
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Failed to void entry');
    } finally {
      setMutating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <LedgerHeader title="Entry detail" backLabel="Back" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
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

          {loadingData ? (
            <ActivityIndicator style={{ marginTop: Space.s24 }} color={palette.primary} />
          ) : !entry ? (
            <View
              style={[
                styles.card,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              <Text style={[styles.mutedText, { color: palette.textMuted }]}>Entry not found.</Text>
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: entry.voided ? palette.surfaceMuted : palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View style={styles.headerRow}>
                  <View
                    style={[
                      styles.memberDot,
                      { backgroundColor: creator?.avatar_color ?? palette.primary },
                    ]}
                  />
                  <View style={{ flex: 1, gap: Space.s4 }}>
                    <Text style={[styles.entryType, { color: palette.textPrimary }]}>
                      {entry.type === 'charge' ? 'Credit charge' : 'Payment'} · {shop?.name ?? 'Shop'}
                    </Text>
                    <Text style={[styles.metaText, { color: palette.textMuted }]}>
                      Added by {creator?.display_name ?? 'Partner'} · {entry.entry_date}
                      {entry.bill_month
                        ? ` · ${formatBillMonthLabel(entry.bill_month)}`
                        : ''}
                    </Text>
                  </View>
                </View>

                <Text
                  style={[
                    styles.amountBig,
                    { color: entry.voided ? palette.textMuted : palette.textPrimary },
                    entry.voided && styles.voidedStrike,
                  ]}
                >
                  {entry.type === 'charge' ? '+' : '-'}
                  {formatEtb(entry.total_amount_santim)}
                </Text>

                {(entry.edit_count > 0 || openDispute || entry.voided) ? (
                  <View style={styles.badgeRow}>
                    {entry.edit_count > 0 ? (
                      <View style={[styles.tag, { backgroundColor: palette.openBg }]}>
                        <Text style={[styles.tagText, { color: palette.openText }]}>
                          Edited {entry.edit_count}×
                        </Text>
                      </View>
                    ) : null}
                    {openDispute ? (
                      <View style={[styles.tag, { backgroundColor: palette.orangeLight }]}>
                        <Text style={[styles.tagText, { color: palette.orange }]}>Disputed</Text>
                      </View>
                    ) : null}
                    {entry.voided ? (
                      <View style={[styles.tag, { backgroundColor: palette.dangerLight }]}>
                        <Text style={[styles.tagText, { color: palette.danger }]}>Voided</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {entry.voided ? (
                  <View style={[styles.voidBanner, { backgroundColor: palette.dangerLight }]}>
                    <Text style={[styles.voidBannerTitle, { color: palette.danger }]}>
                      Voided — excluded from shop balance
                    </Text>
                    <Text style={[styles.voidBannerText, { color: palette.danger }]}>
                      Reason: {entry.void_reason}
                    </Text>
                  </View>
                ) : null}

                {entry.type === 'charge' && entry.entry_lines && entry.entry_lines.length > 0 ? (
                  <View style={[styles.linesBox, { backgroundColor: palette.background }]}>
                    <Text style={[styles.subTitle, { color: palette.textSecondary }]}>Items</Text>
                    {entry.entry_lines.map((line) => (
                      <View key={line.id} style={styles.lineRow}>
                        <Text style={[styles.lineItem, { color: palette.textPrimary }]}>
                          {formatQuantityMilli(line.quantity_milli)} {line.unit} × {line.item_name} @{' '}
                          {formatEtb(line.unit_price_santim)}
                        </Text>
                        <Text style={[styles.lineTotal, { color: palette.textPrimary }]}>
                          {formatEtb(line.line_total_santim)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {entry.note ? (
                  <Text style={[styles.noteText, { color: palette.textSecondary }]}>
                    Note: {entry.note}
                  </Text>
                ) : null}

                {canEditOrVoid ? (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        { backgroundColor: palette.primaryButtonBg },
                        pressed && { opacity: 0.9 },
                      ]}
                      disabled={mutating}
                      onPress={() =>
                        router.push({ pathname: '/edit-entry/[id]', params: { id: entry.id } })
                      }
                    >
                      <Feather name="edit-2" size={14} color={palette.primaryButtonText} />
                      <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                        Edit entry
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.voidBtn,
                        {
                          backgroundColor: palette.dangerLight,
                          borderColor: palette.danger,
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                      disabled={mutating}
                      onPress={() => setShowVoidModal(true)}
                    >
                      <Feather name="slash" size={14} color={palette.danger} />
                      <Text style={[styles.voidBtnText, { color: palette.danger }]}>Void</Text>
                    </Pressable>
                  </View>
                ) : !entry.voided ? (
                  <Text
                    style={[
                      styles.permissionNote,
                      { color: palette.textSecondary, backgroundColor: palette.surfaceMuted },
                    ]}
                  >
                    Added by {creator?.display_name ?? 'your partner'}. Only the creator can edit or void.
                  </Text>
                ) : null}
              </View>

              {openDispute ? (
                <View
                  style={[
                    styles.disputeCard,
                    { backgroundColor: palette.orangeLight, borderColor: palette.orange },
                  ]}
                >
                  <Text style={[styles.disputeTitle, { color: palette.orange }]}>
                    Disputed by{' '}
                    {findMember(members, openDispute.raised_by)?.display_name ?? 'Partner'}
                  </Text>
                  <Text style={[styles.disputeBody, { color: palette.textPrimary }]}>
                    “{openDispute.note}”
                  </Text>

                  {canResolve ? (
                    <View style={styles.resolveBox}>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            borderColor: palette.borderStrong,
                            color: palette.textPrimary,
                            backgroundColor: palette.surface,
                          },
                        ]}
                        value={resolutionNote}
                        onChangeText={setResolutionNote}
                        placeholder="Resolution note"
                        placeholderTextColor={palette.textMuted}
                        editable={!mutating}
                        maxLength={500}
                      />
                      <Pressable
                        style={[
                          styles.primaryBtn,
                          { backgroundColor: palette.primaryButtonBg },
                          mutating && styles.disabled,
                        ]}
                        disabled={mutating}
                        onPress={() => void handleResolveDispute()}
                      >
                        <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                          Mark resolved
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={[styles.metaText, { color: palette.textSecondary }]}>
                      Waiting for {creator?.display_name ?? 'creator'} to edit, void, or resolve.
                    </Text>
                  )}
                </View>
              ) : canFlag ? (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: palette.surface, borderColor: palette.border },
                  ]}
                >
                  {!showDisputeForm ? (
                    <Pressable
                      style={[
                        styles.disputeOutlineBtn,
                        {
                          borderColor: palette.orange,
                          backgroundColor: palette.orangeLight,
                        },
                      ]}
                      onPress={() => setShowDisputeForm(true)}
                    >
                      <Feather name="flag" size={14} color={palette.orange} />
                      <Text style={[styles.disputeOutlineText, { color: palette.orange }]}>
                        Flag entry as disputed
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={{ gap: Space.s12 }}>
                      <Text style={[styles.subTitle, { color: palette.textSecondary }]}>
                        What looks wrong
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            borderColor: palette.borderStrong,
                            color: palette.textPrimary,
                            backgroundColor: palette.background,
                          },
                        ]}
                        value={disputeNote}
                        onChangeText={setDisputeNote}
                        placeholder="e.g. Milk was 90 ETB, or wrong shop"
                        placeholderTextColor={palette.textMuted}
                        editable={!mutating}
                        maxLength={500}
                      />
                      <View style={styles.actionRow}>
                        <Pressable
                          style={[
                            styles.cancelBtn,
                            {
                              borderColor: palette.borderStrong,
                              backgroundColor: palette.surface,
                            },
                          ]}
                          disabled={mutating}
                          onPress={() => {
                            setShowDisputeForm(false);
                            setDisputeNote('');
                          }}
                        >
                          <Text style={[styles.cancelBtnText, { color: palette.textSecondary }]}>
                            Cancel
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.disputeSubmitBtn,
                            { backgroundColor: palette.orangeSolidBg },
                            mutating && styles.disabled,
                          ]}
                          disabled={mutating}
                          onPress={() => void handleRaiseDispute()}
                        >
                          <Text style={styles.disputeSubmitText}>Send flag</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              ) : null}

              <View style={styles.section}>
                <View style={styles.headerBetween}>
                  <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>
                    Entry history
                  </Text>
                  <Text style={[styles.metaMono, { color: palette.textMuted }]}>{history.length}</Text>
                </View>

                {history.length === 0 ? (
                  <View
                    style={[
                      styles.card,
                      { backgroundColor: palette.surface, borderColor: palette.border },
                    ]}
                  >
                    <Text style={[styles.mutedText, { color: palette.textMuted }]}>
                      No audit events recorded yet.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.historyList}>
                    {history.map((item) => {
                      const actor = item.actor_id ? findMember(members, item.actor_id) : undefined;
                      const formatted = describeEntryHistoryRecord(item);
                      return (
                        <View
                          key={item.id}
                          style={[
                            styles.historyCard,
                            { backgroundColor: palette.surface, borderColor: palette.border },
                          ]}
                        >
                          <View style={styles.historyHeader}>
                            <Text style={[styles.historyTitle, { color: palette.textPrimary }]}>
                              {formatted.title}
                            </Text>
                            <Text style={[styles.historyActor, { color: palette.primary }]}>
                              {actor?.display_name ?? 'System'}
                            </Text>
                          </View>
                          <Text style={[styles.historyTime, { color: palette.textMuted }]}>
                            {new Date(item.at).toLocaleString()}
                          </Text>
                          {formatted.details.map((line, i) => (
                            <Text
                              key={i}
                              style={[styles.historyDetail, { color: palette.textSecondary }]}
                            >
                              {line}
                            </Text>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showVoidModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowVoidModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: palette.surface,
                borderTopColor: palette.border,
                paddingBottom: Math.max(Space.s24, insets.bottom + Space.s12),
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: palette.borderStrong }]} />
            <Text style={[styles.modalTitle, { color: palette.textPrimary }]}>Void entry</Text>
            <Text style={[styles.mutedText, { color: palette.textSecondary }]}>
              Voided entries stay visible in history and do not count toward balances.
            </Text>

            <View style={styles.presetRow}>
              {VOID_PRESET_REASONS.map((preset) => (
                <Pressable
                  key={preset}
                  style={[styles.presetChip, { backgroundColor: palette.surfaceMuted }]}
                  onPress={() => setVoidReason(preset)}
                >
                  <Text style={[styles.presetChipText, { color: palette.textPrimary }]}>
                    {preset}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[
                styles.input,
                {
                  borderColor: palette.borderStrong,
                  color: palette.textPrimary,
                  backgroundColor: palette.background,
                },
              ]}
              value={voidReason}
              onChangeText={setVoidReason}
              placeholder="Reason for voiding"
              placeholderTextColor={palette.textMuted}
              editable={!mutating}
              maxLength={500}
            />

            <View style={styles.actionRow}>
              <Pressable
                style={[
                  styles.cancelBtn,
                  { borderColor: palette.borderStrong, backgroundColor: palette.surface },
                ]}
                disabled={mutating}
                onPress={() => setShowVoidModal(false)}
              >
                <Text style={[styles.cancelBtnText, { color: palette.textSecondary }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.voidConfirmBtn,
                  { backgroundColor: palette.dangerSolidBg },
                  mutating && styles.disabled,
                ]}
                disabled={mutating}
                onPress={() => void handleVoidEntry()}
              >
                <Text style={styles.voidConfirmText}>Confirm void</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: {
    paddingHorizontal: Space.s16,
    paddingTop: Space.s16,
    paddingBottom: Space.s40,
    gap: Space.s20,
  },
  card: {
    borderRadius: Radius.card,
    padding: Space.s16,
    borderWidth: 1,
    gap: Space.s12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Space.s12 },
  headerBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  memberDot: { width: 10, height: 10, borderRadius: 5 },
  entryType: { fontFamily: Fonts.sansMedium, fontSize: 16, lineHeight: 20 },
  metaText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  metaMono: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  amountBig: {
    fontFamily: Fonts.monoMedium,
    fontSize: 28,
    lineHeight: 32,
    fontVariant: ['tabular-nums'],
  },
  voidedStrike: { textDecorationLine: 'line-through' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s8 },
  tag: {
    borderRadius: Radius.tag,
    paddingHorizontal: Space.s8,
    paddingVertical: Space.s4,
  },
  tagText: { fontFamily: Fonts.monoMedium, fontSize: 11, lineHeight: 14 },
  voidBanner: { borderRadius: Radius.control, padding: Space.s12, gap: Space.s4 },
  voidBannerTitle: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  voidBannerText: { fontFamily: Fonts.sans, fontSize: 12 },
  linesBox: { borderRadius: Radius.innerCard, padding: Space.s12, gap: Space.s8 },
  subTitle: { fontFamily: Fonts.sansMedium, fontSize: 13, lineHeight: 16 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Space.s12 },
  lineItem: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
  lineTotal: {
    fontFamily: Fonts.monoMedium,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  noteText: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
  permissionNote: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    padding: Space.s12,
    borderRadius: Radius.control,
  },
  actionRow: { flexDirection: 'row', gap: Space.s8, marginTop: Space.s4 },
  primaryBtn: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    gap: Space.s8,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  voidBtn: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    gap: Space.s8,
    borderWidth: 1,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voidBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  disputeCard: {
    borderRadius: Radius.card,
    padding: Space.s16,
    borderWidth: 1,
    gap: Space.s12,
  },
  disputeTitle: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  disputeBody: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 20 },
  resolveBox: { gap: Space.s8, marginTop: Space.s4 },
  disputeOutlineBtn: {
    height: 44,
    flexDirection: 'row',
    gap: Space.s8,
    borderWidth: 1,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disputeOutlineText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  disputeSubmitBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disputeSubmitText: { color: '#FFFFFF', fontFamily: Fonts.sansMedium, fontSize: 14 },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  section: { gap: Space.s8 },
  sectionTitle: { fontFamily: Fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  historyList: { gap: Space.s8 },
  historyCard: {
    borderRadius: Radius.innerCard,
    padding: Space.s12,
    borderWidth: 1,
    gap: Space.s4,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: Space.s8 },
  historyTitle: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 14 },
  historyActor: { fontFamily: Fonts.sansMedium, fontSize: 12 },
  historyTime: { fontFamily: Fonts.mono, fontSize: 11, fontVariant: ['tabular-nums'] },
  historyDetail: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 13, 10, 0.48)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: 1,
    paddingHorizontal: Space.s20,
    paddingTop: Space.s12,
    gap: Space.s12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Space.s4,
  },
  modalTitle: { fontFamily: Fonts.sansMedium, fontSize: 18, lineHeight: 24 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s8 },
  presetChip: {
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s8,
  },
  presetChipText: { fontFamily: Fonts.sansMedium, fontSize: 12 },
  voidConfirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voidConfirmText: { color: '#FFFFFF', fontFamily: Fonts.sansMedium, fontSize: 14 },
  mutedText: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    borderRadius: Radius.control,
    padding: Space.s12,
  },
  errorText: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
  disabled: { opacity: 0.6 },
});
