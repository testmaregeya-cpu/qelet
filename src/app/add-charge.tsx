import Feather from '@expo/vector-icons/Feather';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeyboardAwareScroll } from '../lib/useKeyboardInset';
import { ChargeLinesEditor } from '../components/ChargeLinesEditor';
import { CreateShopModal } from '../components/CreateShopModal';
import { DateStepperInput } from '../components/DateStepperInput';
import { LedgerHeader } from '../components/LedgerHeader';
import {
  formatBillMonthLabel,
  getAddisAbabaDateString,
  resolveDefaultBillMonth,
  shiftCalendarDays,
  shiftYearMonth,
  validateDateString,
} from '../domain/billing';
import { mergeItemSuggestions } from '../domain/dashboard';
import { predictSmartChargeSuggestions } from '../domain/ml/ledgerMl';
import {
  computeEditableLinesSummary,
  type EditableChargeLine,
  makeEditableLineFromSuggestion,
  makeEmptyEditableLine,
  validateEditableLinesToDrafts,
} from '../lib/chargeForm';
import { triggerHaptic } from '../lib/haptics';
import { formatEtb, formatSantimForInput } from '../lib/money';
import { fetchCatalogItems, fetchCategories } from '../services/catalog';
import {
  createChargeEntry,
  fetchShopEntries,
  fetchShopPriceMemory,
} from '../services/ledger';
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
import type { ChargeLineDraft, LedgerEntry, PriceMemoryItem } from '../types/phase2';
import type { CatalogItem, Category, ItemSuggestion } from '../types/phase4to6';

export default function AddChargeScreen() {
  const { palette } = useTheme();
  const params = useLocalSearchParams<{
    shopId?: string;
    presetItemName?: string;
    presetUnit?: string;
    presetPriceSantim?: string;
    presetCatalogItemId?: string;
  }>();
  const initialParamShopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId;
  const presetItemName = Array.isArray(params.presetItemName)
    ? params.presetItemName[0]
    : params.presetItemName;
  const presetUnit = Array.isArray(params.presetUnit) ? params.presetUnit[0] : params.presetUnit;
  const presetPriceSantim = Array.isArray(params.presetPriceSantim)
    ? params.presetPriceSantim[0]
    : params.presetPriceSantim;
  const presetCatalogItemId = Array.isArray(params.presetCatalogItemId)
    ? params.presetCatalogItemId[0]
    : params.presetCatalogItemId;

  const { loading, session, householdContext } = useSession();
  const { scrollRef, handleInputFocus, scrollViewHandlers } = useKeyboardAwareScroll();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>(initialParamShopId ?? '');
  const [showCreateShopModal, setShowCreateShopModal] = useState(false);
  const [shopEntries, setShopEntries] = useState<LedgerEntry[]>([]);
  const [priceMemory, setPriceMemory] = useState<PriceMemoryItem[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const todayDate = getAddisAbabaDateString();
  const [entryDate, setEntryDate] = useState(todayDate);
  const [forceNextMonth, setForceNextMonth] = useState<boolean | null>(null);
  const [lines, setLines] = useState<EditableChargeLine[]>(() => {
    if (presetItemName && presetPriceSantim) {
      const parsed = Number.parseInt(presetPriceSantim, 10);
      return [
        {
          key: 'line-preset-0',
          catalogItemId: presetCatalogItemId ?? null,
          itemName: presetItemName,
          quantity: '1',
          unit: presetUnit || 'pcs',
          unitPriceEtb: Number.isSafeInteger(parsed) ? formatSantimForInput(parsed) : '',
        },
      ];
    }
    return [makeEmptyEditableLine(0)];
  });
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

    void Promise.all([
      fetchShops(householdId),
      fetchCatalogItems(householdId).catch(() => [] as CatalogItem[]),
      fetchCategories(householdId).catch(() => [] as Category[]),
    ])
      .then(([list, items, cats]) => {
        if (!active) return;
        setError(null);
        const activeShops = list.filter(
          (s) => !s.archived && s.merged_into_shop_id === null
        );
        setShops(activeShops);
        setCatalogItems(items);
        setCategories(cats);
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

    // Fast-path: pre-hydrate shop entries and price memory from offline cache
    void getCachedShopDetail(selectedShopId).then((cached) => {
      if (cached && active) {
        setShopEntries(cached.entries);
        setPriceMemory(cached.priceMemory);
      }
    });

    void Promise.all([
      fetchShopEntries(selectedShopId),
      fetchShopPriceMemory(selectedShopId),
    ])
      .then(([entries, memory]) => {
        if (!active) return;
        setError(null);
        setShopEntries(entries);
        setPriceMemory(memory);
      })
      .catch(async (err) => {
        if (!active) return;
        const cached = await getCachedShopDetail(selectedShopId);
        if (isLikelyNetworkError(err)) {
          if (cached) {
            setError(null);
          }
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load shop items');
        }
      });

    return () => {
      active = false;
    };
  }, [selectedShopId]);

  const mergedSuggestions = useMemo(
    () => mergeItemSuggestions(priceMemory, catalogItems, categories),
    [priceMemory, catalogItems, categories]
  );

  const quickChips = useMemo(
    () =>
      predictSmartChargeSuggestions({
        baseSuggestions: mergedSuggestions,
        shopEntries,
        currentLineItemNames: lines.map((l) => l.itemName),
        targetDate: entryDate,
        limit: 8,
      }),
    [mergedSuggestions, shopEntries, lines, entryDate]
  );

  const billResolution = useMemo(() => {
    try {
      const validDate = validateDateString(entryDate);
      const resolved = resolveDefaultBillMonth(shopEntries, validDate);
      const day = Number.parseInt(validDate.slice(8, 10), 10);
      const inPaydayWindow = day >= 24 && day <= 26;
      const effectiveBillMonth =
        inPaydayWindow && forceNextMonth !== null
          ? forceNextMonth
            ? shiftYearMonth(validDate.slice(0, 7), 1)
            : validDate.slice(0, 7)
          : resolved.billMonth;

      return {
        validDate,
        inPaydayWindow,
        rolledAfterPayoff:
          forceNextMonth === null ? resolved.rolledAfterPayoff : forceNextMonth,
        billMonth: effectiveBillMonth,
      };
    } catch {
      return null;
    }
  }, [entryDate, shopEntries, forceNextMonth]);

  const parsedLines = useMemo(() => computeEditableLinesSummary(lines), [lines]);

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }
  if (!loading && !householdContext) {
    return <Redirect href="/link-household" />;
  }

  const updateLine = (key: string, patch: Partial<EditableChargeLine>) => {
    pendingRequestIdRef.current = null;
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const applySuggestion = (suggestion: ItemSuggestion) => {
    pendingRequestIdRef.current = null;
    triggerHaptic('selection');
    setLines((prev) => {
      const blankIdx = prev.findIndex((l) => l.itemName.trim().length === 0);
      if (blankIdx >= 0) {
        return prev.map((line, i) =>
          i === blankIdx ? makeEditableLineFromSuggestion(suggestion, i) : line
        );
      }
      return [...prev, makeEditableLineFromSuggestion(suggestion, prev.length)];
    });
  };

  const handleSave = async () => {
    if (submitting) return;
    setError(null);
    if (!selectedShopId) {
      setError('Select a shop');
      triggerHaptic('error');
      return;
    }
    if (!billResolution) {
      setError('Enter a valid date in YYYY-MM-DD format');
      triggerHaptic('error');
      return;
    }

    let drafts: ChargeLineDraft[];
    try {
      drafts = validateEditableLinesToDrafts(lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check your item lines');
      triggerHaptic('error');
      return;
    }

    const requestId = pendingRequestIdRef.current ?? createClientRequestId();
    pendingRequestIdRef.current = requestId;

    setSubmitting(true);
    try {
      await createChargeEntry({
        shopId: selectedShopId,
        entryDate: billResolution.validDate,
        billMonth: billResolution.billMonth,
        note,
        lines: drafts,
        clientRequestId: requestId,
      });
      pendingRequestIdRef.current = null;
      triggerHaptic('success');
      router.back();
    } catch (err) {
      if (householdId && isLikelyNetworkError(err)) {
        await enqueueOfflineMutation({
          id: requestId,
          kind: 'charge',
          householdId,
          shopId: selectedShopId,
          createdAt: new Date().toISOString(),
          payload: {
            shopId: selectedShopId,
            entryDate: billResolution.validDate,
            billMonth: billResolution.billMonth,
            note,
            lines: drafts,
            clientRequestId: requestId,
          },
        });
        await markEntryLoggedTodayAndSyncReminder(billResolution.validDate).catch(() => undefined);
        pendingRequestIdRef.current = null;
        triggerHaptic('success');
        router.back();
        return;
      }
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Failed to save charge');
    } finally {
      setSubmitting(false);
    }
  };

  const yesterdayDate = shiftCalendarDays(todayDate, -1);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <LedgerHeader title="Add credit charge" backLabel="Cancel" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          {...scrollViewHandlers}
        >
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
                No active shops yet. Add a shop to record credit charges.
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
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Shop ${s.name}`}
                        onPress={() => {
                          triggerHaptic('selection');
                          setSelectedShopId(s.id);
                        }}
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
              </View>

              <View
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
                <View style={styles.rowBetween}>
                  <Text style={[styles.label, { color: palette.textSecondary }]}>Date</Text>
                  <Text style={[styles.monoHint, { color: palette.textMuted }]}>Addis Ababa</Text>
                </View>

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
                    accessibilityRole="button"
                    accessibilityState={{ selected: entryDate === todayDate }}
                    onPress={() => {
                      setEntryDate(todayDate);
                      setForceNextMonth(null);
                    }}
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: entryDate === yesterdayDate }}
                    onPress={() => {
                      setEntryDate(yesterdayDate);
                      setForceNextMonth(null);
                    }}
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

                <DateStepperInput
                  value={entryDate}
                  onChangeDate={(text) => {
                    setEntryDate(text);
                    setForceNextMonth(null);
                  }}
                />

                {billResolution ? (
                  <View style={[styles.billInfoBox, { backgroundColor: palette.primaryLight }]}>
                    <Text style={[styles.billInfoText, { color: palette.primary }]}>
                      Counts toward {formatBillMonthLabel(billResolution.billMonth)} bill
                      {billResolution.rolledAfterPayoff
                        ? ' · Rolled past payoff'
                        : ''}
                    </Text>
                    {billResolution.inPaydayWindow ? (
                      <Pressable
                        onPress={() =>
                          setForceNextMonth((prev) =>
                            prev === null ? !billResolution.rolledAfterPayoff : !prev
                          )
                        }
                      >
                        <Text style={[styles.rollToggleText, { color: palette.amber }]}>
                          Switch month
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {quickChips.length > 0 ? (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: palette.surface, borderColor: palette.border },
                  ]}
                >
                  <Text style={[styles.label, { color: palette.textSecondary }]}>
                    Suggested items
                  </Text>
                  <View style={styles.memoryWrap}>
                    {quickChips.map((item) => (
                      <Pressable
                        key={item.key}
                        style={[
                          styles.memoryChip,
                          {
                            backgroundColor: palette.background,
                            borderColor: palette.border,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Quick add ${item.item_name}`}
                        onPress={() => applySuggestion(item)}
                      >
                        <Text style={[styles.memoryChipText, { color: palette.textPrimary }]}>
                          {item.item_name}
                        </Text>
                        <Text style={[styles.memoryPrice, { color: palette.primary }]}>
                          {formatEtb(item.unit_price_santim)}
                        </Text>
                        {item.badgeHint ? (
                          <Text style={[styles.memoryHint, { color: palette.textMuted }]}>
                            · {item.badgeHint}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              <ChargeLinesEditor
                lines={lines}
                lineTotals={parsedLines.lineTotals}
                mergedSuggestions={mergedSuggestions}
                onUpdateLine={updateLine}
                onRemoveLine={(key) => {
                  pendingRequestIdRef.current = null;
                  setLines((prev) => prev.filter((l) => l.key !== key));
                }}
                onAddLine={() => {
                  pendingRequestIdRef.current = null;
                  setLines((prev) => [...prev, makeEmptyEditableLine(prev.length)]);
                }}
                onInputFocus={handleInputFocus}
              />

              <View
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
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
                  onFocus={(e) => handleInputFocus(e.currentTarget)}
                  onChangeText={(text) => {
                    pendingRequestIdRef.current = null;
                    setNote(text);
                  }}
                  accessibilityLabel="Receipt note"
                  placeholder="Receipt note"
                  placeholderTextColor={palette.textMuted}
                  maxLength={500}
                />

                <View style={[styles.grandTotalRow, { borderTopColor: palette.border }]}>
                  <Text style={[styles.grandTotalLabel, { color: palette.textSecondary }]}>
                    Total charge
                  </Text>
                  <Text style={[styles.grandTotalValue, { color: palette.textPrimary }]}>
                    {formatEtb(parsedLines.grandTotalSantim)}
                  </Text>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: palette.primaryButtonBg },
                    submitting && styles.disabled,
                    pressed && { opacity: 0.9 },
                  ]}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Save charge"
                  onPress={() => void handleSave()}
                >
                  {submitting ? (
                    <ActivityIndicator color={palette.primaryButtonText} />
                  ) : (
                    <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                      Save charge
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
    gap: Space.s12,
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
  input: {
    height: 44,
    borderWidth: Hairline,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  billInfoBox: {
    borderRadius: Radius.control,
    padding: Space.s12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Space.s8,
  },
  billInfoText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  rollToggleText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  memoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.s8,
  },
  memoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s6,
    borderWidth: Hairline,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.s12,
    paddingVertical: 6,
  },
  memoryChipText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  memoryPrice: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  memoryHint: {
    fontFamily: Fonts.sans,
    fontSize: 11,
  },
  grandTotalRow: {
    borderTopWidth: Hairline,
    paddingTop: Space.s12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  grandTotalLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  grandTotalValue: {
    fontFamily: Fonts.sansSemi,
    fontSize: 24,
    lineHeight: 30,
    fontVariant: ['tabular-nums'],
  },
  primaryBtn: {
    height: 48,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
  },
  mutedText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
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
  disabled: {
    opacity: 0.6,
  },
});
