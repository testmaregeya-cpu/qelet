import Feather from '@expo/vector-icons/Feather';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateStepperInput } from '../components/DateStepperInput';
import { CreateShopModal } from '../components/CreateShopModal';
import { LedgerHeader } from '../components/LedgerHeader';
import {
  calculateShopLedgerSummary,
  getAddisAbabaDateString,
  previewPaymentAllocation,
  shiftCalendarDays,
  validateDateString,
} from '../domain/billing';
import { triggerHaptic } from '../lib/haptics';
import { formatEtb, formatSantimForInput, parseEtbToSantim } from '../lib/money';
import { createPaymentEntry, fetchShopEntries } from '../services/ledger';
import { markEntryLoggedTodayAndSyncReminder } from '../services/notifications';
import {
  createClientRequestId,
  enqueueOfflineMutation,
  isLikelyNetworkError,
} from '../services/offlineQueue';
import {
  getCachedHouseholdLedger,
  getCachedShopDetail,
} from '../services/offlineStorage';
import { fetchShops } from '../services/shops';
import { useSession } from '../state/SessionContext';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Hairline, Radius, Space } from '../theme/tokens';
import type { Shop } from '../types/phase1';
import type { LedgerEntry } from '../types/phase2';

export default function RecordPaymentScreen() {
  const { palette } = useTheme();
  const { shopId: paramShopId } = useLocalSearchParams<{ shopId?: string }>();
  const initialParamShopId = Array.isArray(paramShopId) ? paramShopId[0] : paramShopId;

  const { loading, session, householdContext } = useSession();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>(initialParamShopId ?? '');
  const [showCreateShopModal, setShowCreateShopModal] = useState(false);
  const [shopEntries, setShopEntries] = useState<LedgerEntry[]>([]);

  const todayDate = getAddisAbabaDateString();
  const [entryDate, setEntryDate] = useState(todayDate);
  const [amountEtb, setAmountEtb] = useState('');
  const [note, setNote] = useState('');
  const [loadingInit, setLoadingInit] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRequestIdRef = useRef<string | null>(null);

  const householdId = householdContext?.household.id ?? null;

  useEffect(() => {
    if (!householdId) return;
    let active = true;

    // Fast-path: pre-hydrate active shops from offline cache immediately
    void getCachedHouseholdLedger(householdId).then((cached) => {
      if (cached && active && cached.shops.length > 0) {
        const activeShops = cached.shops.filter(
          (s) => !s.archived && s.merged_into_shop_id === null
        );
        if (activeShops.length > 0) {
          setShops(activeShops);
          if (!initialParamShopId) {
            setSelectedShopId((prev) => prev || activeShops[0].id);
          }
          setLoadingInit(false);
        }
      }
    });

    void fetchShops(householdId)
      .then((list) => {
        if (!active) return;
        setError(null);
        const activeShops = list.filter(
          (s) => !s.archived && s.merged_into_shop_id === null
        );
        setShops(activeShops);
        if (!initialParamShopId && activeShops.length > 0) {
          setSelectedShopId((prev) => prev || activeShops[0].id);
        } else if (initialParamShopId) {
          setSelectedShopId(initialParamShopId);
        }
      })
      .catch(async (err) => {
        if (!active) return;
        const cached = await getCachedHouseholdLedger(householdId);
        const hasCachedShops = Boolean(
          cached && cached.shops.some((s) => !s.archived && s.merged_into_shop_id === null)
        );
        if (isLikelyNetworkError(err)) {
          if (!hasCachedShops) {
            setError('You are offline. Connect to the internet to load your shops.');
          } else {
            setError(null);
          }
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load shops');
        }
      })
      .finally(() => {
        if (active) setLoadingInit(false);
      });

    return () => {
      active = false;
    };
  }, [householdId, initialParamShopId]);

  useEffect(() => {
    if (!selectedShopId) return;
    let active = true;

    // Fast-path: pre-hydrate shop entries from offline cache
    void getCachedShopDetail(selectedShopId).then((cached) => {
      if (cached && active) {
        setShopEntries(cached.entries);
      }
    });

    void fetchShopEntries(selectedShopId)
      .then((entries) => {
        if (!active) return;
        setError(null);
        setShopEntries(entries);
      })
      .catch(async (err) => {
        if (!active) return;
        const cached = await getCachedShopDetail(selectedShopId);
        if (isLikelyNetworkError(err)) {
          if (cached) {
            setError(null);
          }
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load shop balance');
        }
      });

    return () => {
      active = false;
    };
  }, [selectedShopId]);

  const summary = useMemo(
    () => calculateShopLedgerSummary(shopEntries, todayDate),
    [shopEntries, todayDate]
  );

  const parsedSantim = useMemo(() => {
    try {
      const value = parseEtbToSantim(amountEtb);
      return value > 0 ? value : null;
    } catch {
      return null;
    }
  }, [amountEtb]);

  const preview = useMemo(() => {
    if (parsedSantim === null) return null;
    return previewPaymentAllocation(summary, parsedSantim);
  }, [summary, parsedSantim]);

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }
  if (!loading && !householdContext) {
    return <Redirect href="/link-household" />;
  }

  const yesterdayDate = shiftCalendarDays(todayDate, -1);

  const handleSave = async () => {
    if (submitting) return;
    setError(null);
    if (!selectedShopId) {
      triggerHaptic('error');
      setError('Select a shop');
      return;
    }

    let validDate: string;
    let amountSantim: number;
    try {
      validDate = validateDateString(entryDate);
      amountSantim = parseEtbToSantim(amountEtb);
      if (amountSantim <= 0) {
        throw new Error('Payment amount must be greater than 0 ETB');
      }
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Check amount and date');
      return;
    }

    const requestId = pendingRequestIdRef.current ?? createClientRequestId();
    pendingRequestIdRef.current = requestId;

    setSubmitting(true);
    try {
      await createPaymentEntry({
        shopId: selectedShopId,
        entryDate: validDate,
        amountSantim,
        note,
        clientRequestId: requestId,
      });
      pendingRequestIdRef.current = null;
      triggerHaptic('success');
      router.back();
    } catch (err) {
      if (householdId && isLikelyNetworkError(err)) {
        await enqueueOfflineMutation({
          id: requestId,
          kind: 'payment',
          householdId,
          shopId: selectedShopId,
          createdAt: new Date().toISOString(),
          payload: {
            shopId: selectedShopId,
            entryDate: validDate,
            amountSantim,
            note,
            clientRequestId: requestId,
          },
        });
        await markEntryLoggedTodayAndSyncReminder(validDate).catch(() => undefined);
        pendingRequestIdRef.current = null;
        triggerHaptic('success');
        router.back();
        return;
      }
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <LedgerHeader title="Record payment" backLabel="Cancel" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: palette.dangerLight }]}>
              <Feather name="alert-circle" size={16} color={palette.danger} />
              <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
            </View>
          ) : null}

          {loadingInit ? (
            <ActivityIndicator color={palette.primary} />
          ) : shops.length === 0 ? (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  alignItems: 'center',
                  padding: Space.s20,
                  gap: Space.s12,
                },
              ]}
            >
              <Text style={[styles.mutedText, { color: palette.textMuted, textAlign: 'center' }]}>
                No active shops yet. Add a shop to record payments.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: palette.primaryButtonBg, marginTop: Space.s4 },
                  pressed && { opacity: 0.9 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Add new shop"
                onPress={() => setShowCreateShopModal(true)}
              >
                <Feather name="plus" size={16} color={palette.primaryButtonText} />
                <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                  Add New Shop
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
                <View style={styles.rowBetween}>
                  <Text style={[styles.label, { color: palette.textSecondary }]}>Shop</Text>
                  <Pressable
                    style={({ pressed }) => [
                      { flexDirection: 'row', alignItems: 'center', gap: Space.s4 },
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Add new shop inline"
                    onPress={() => {
                      triggerHaptic('selection');
                      setShowCreateShopModal(true);
                    }}
                  >
                    <Feather name="plus" size={13} color={palette.primary} />
                    <Text style={{ fontFamily: Fonts.sansMedium, fontSize: 12, color: palette.primary }}>
                      New Shop
                    </Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {shops.map((s) => {
                    const selected = s.id === selectedShopId;
                    return (
                      <Pressable
                        key={s.id}
                        style={[
                          styles.chip,
                          {
                            borderColor: selected ? palette.primary : palette.borderStrong,
                            backgroundColor: selected
                              ? palette.primaryLight
                              : palette.background,
                          },
                        ]}
                        onPress={() => setSelectedShopId(s.id)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: selected ? palette.primary : palette.textPrimary },
                          ]}
                        >
                          {s.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor: palette.primary,
                        backgroundColor: palette.surfaceMuted,
                        borderStyle: 'dashed',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: Space.s4,
                      },
                      pressed && { opacity: 0.8 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Create another shop"
                    onPress={() => {
                      triggerHaptic('selection');
                      setShowCreateShopModal(true);
                    }}
                  >
                    <Feather name="plus" size={12} color={palette.primary} />
                    <Text style={[styles.chipText, { color: palette.primary }]}>Add shop</Text>
                  </Pressable>
                </ScrollView>

                <View style={[styles.balanceBox, { backgroundColor: palette.background, borderColor: palette.border }]}>
                  <View style={{ gap: Space.s4 }}>
                    <Text style={[styles.balanceSubLabel, { color: palette.textSecondary }]}>
                      Current owed
                    </Text>
                    <Text style={[styles.balanceValue, { color: palette.textPrimary }]}>
                      {formatEtb(Math.max(0, summary.balanceSantim))}
                    </Text>
                  </View>
                  {summary.balanceSantim > 0 ? (
                    <Pressable
                      style={[styles.fillBtn, { backgroundColor: palette.primaryLight }]}
                      onPress={() => setAmountEtb(formatSantimForInput(summary.balanceSantim))}
                    >
                      <Text style={[styles.fillBtnText, { color: palette.primary }]}>
                        Pay full balance
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: palette.textSecondary }]}>
                    Payment amount
                  </Text>
                  <View
                    style={[
                      styles.heroAmountCard,
                      { backgroundColor: palette.background, borderColor: palette.border },
                    ]}
                  >
                    <TextInput
                      style={[
                        styles.heroAmountInput,
                        { color: palette.textPrimary },
                      ]}
                      value={amountEtb}
                      onChangeText={setAmountEtb}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={palette.textMuted}
                    />
                    <Text style={[styles.currencySuffix, { color: palette.textSecondary }]}>ETB</Text>
                  </View>
                </View>

                {preview ? (
                  <View style={[styles.previewBox, { backgroundColor: palette.primaryLight }]}>
                    <Text style={[styles.previewTitle, { color: palette.primary }]}>
                      Applied oldest bill first
                    </Text>
                    {preview.allocations.length === 0 ? (
                      <Text style={[styles.previewLine, { color: palette.textPrimary }]}>
                        Balance is settled — records {formatEtb(preview.creditCarrySantim)} credit.
                      </Text>
                    ) : (
                      preview.allocations.map((item) => (
                        <View key={item.billMonth} style={styles.previewRow}>
                          <Text style={[styles.previewLine, { color: palette.textPrimary }]}>
                            {item.label}
                          </Text>
                          <Text style={[styles.previewLineMono, { color: palette.textPrimary }]}>
                            -{formatEtb(item.allocatedSantim)} (
                            {item.remainingAfterSantim === 0
                              ? 'Paid'
                              : `${formatEtb(item.remainingAfterSantim)} left`}
                            )
                          </Text>
                        </View>
                      ))
                    )}
                    {preview.allocations.length > 0 && preview.creditCarrySantim > 0 ? (
                      <Text style={[styles.previewLineMono, { color: palette.primary }]}>
                        Extra credit: {formatEtb(preview.creditCarrySantim)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: palette.textSecondary }]}>Payment date</Text>
                  <View style={styles.dateQuickRow}>
                    <Pressable
                      style={[
                        styles.chip,
                        {
                          borderColor:
                            entryDate === todayDate ? palette.primary : palette.borderStrong,
                          backgroundColor:
                            entryDate === todayDate ? palette.primaryLight : palette.background,
                        },
                      ]}
                      onPress={() => setEntryDate(todayDate)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color:
                              entryDate === todayDate ? palette.primary : palette.textPrimary,
                          },
                        ]}
                      >
                        Today ({todayDate})
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.chip,
                        {
                          borderColor:
                            entryDate === yesterdayDate ? palette.primary : palette.borderStrong,
                          backgroundColor:
                            entryDate === yesterdayDate
                              ? palette.primaryLight
                              : palette.background,
                        },
                      ]}
                      onPress={() => setEntryDate(yesterdayDate)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color:
                              entryDate === yesterdayDate
                                ? palette.primary
                                : palette.textPrimary,
                          },
                        ]}
                      >
                        Yesterday
                      </Text>
                    </Pressable>
                  </View>
                  <DateStepperInput value={entryDate} onChangeDate={setEntryDate} />
                </View>

                <View style={styles.fieldGroup}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.label, { color: palette.textSecondary }]}>Note</Text>
                    <Text style={[styles.monoHint, { color: palette.textMuted }]}>Optional</Text>
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
                    value={note}
                    onChangeText={setNote}
                    placeholder="Cash or Telebirr"
                    placeholderTextColor={palette.textMuted}
                    maxLength={500}
                  />
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: palette.primaryButtonBg },
                    submitting && styles.disabled,
                    pressed && { opacity: 0.9 },
                  ]}
                  disabled={submitting}
                  onPress={() => void handleSave()}
                >
                  {submitting ? (
                    <ActivityIndicator color={palette.primaryButtonText} />
                  ) : (
                    <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                      Save payment
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {householdId && session ? (
        <CreateShopModal
          visible={showCreateShopModal}
          onClose={() => setShowCreateShopModal(false)}
          onCreated={(newShop) => {
            setShops((prev) => [...prev, newShop]);
            setSelectedShopId(newShop.id);
          }}
          householdId={householdId}
          userId={session.user.id}
          isSuperAdmin={householdContext?.currentMember.role === 'super_admin'}
          existingShopNames={shops.map((s) => s.name)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    paddingHorizontal: Space.s16,
    paddingTop: Space.s16,
    paddingBottom: Space.s40,
    gap: Space.s16,
  },
  card: {
    borderRadius: Radius.card,
    padding: Space.s16,
    borderWidth: Hairline,
    gap: Space.s16,
  },
  fieldGroup: {
    gap: Space.s8,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  monoHint: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
  },
  chipRow: { gap: Space.s8 },
  dateQuickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s8 },
  chip: {
    borderWidth: Hairline,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s8,
  },
  chipText: { fontFamily: Fonts.sansMedium, fontSize: 13, lineHeight: 16 },
  balanceBox: {
    borderWidth: Hairline,
    borderRadius: Radius.innerCard,
    padding: Space.s12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceSubLabel: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 16 },
  balanceValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: 20,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  fillBtn: {
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: Space.s8,
  },
  fillBtnText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  input: {
    height: 44,
    borderWidth: Hairline,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  heroAmountCard: {
    height: 64,
    borderWidth: Hairline,
    borderRadius: Radius.innerCard,
    paddingHorizontal: Space.s16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroAmountInput: {
    flex: 1,
    fontFamily: Fonts.sansSemi,
    fontSize: 28,
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
  },
  currencySuffix: {
    fontFamily: Fonts.monoMedium,
    fontSize: 15,
    lineHeight: 20,
    marginLeft: Space.s8,
  },
  amountInput: {
    height: 52,
    borderWidth: Hairline,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.monoMedium,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
  },
  previewBox: {
    borderRadius: Radius.innerCard,
    padding: Space.s12,
    gap: Space.s8,
  },
  previewTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space.s8,
  },
  previewLine: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
  previewLineMono: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  primaryBtn: {
    height: 48,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  mutedText: { fontFamily: Fonts.sans, fontSize: 14, textAlign: 'center' },
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
