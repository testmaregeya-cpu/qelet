import Feather from '@expo/vector-icons/Feather';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
import { ChargeLinesEditor } from '../../components/ChargeLinesEditor';
import { DateStepperInput } from '../../components/DateStepperInput';
import { LedgerHeader } from '../../components/LedgerHeader';
import {
  formatBillMonthLabel,
  getStandardBillMonth,
  shiftYearMonth,
  validateDateString,
} from '../../domain/billing';
import { mergeItemSuggestions } from '../../domain/dashboard';
import {
  computeEditableLinesSummary,
  type EditableChargeLine,
  makeEmptyEditableLine,
  validateEditableLinesToDrafts,
} from '../../lib/chargeForm';
import { canEditOrVoidEntry } from '../../lib/entryHistory';
import { triggerHaptic } from '../../lib/haptics';
import {
  formatEtb,
  formatQuantityMilli,
  formatSantimForInput,
  parseEtbToSantim,
} from '../../lib/money';
import { fetchCatalogItems, fetchCategories } from '../../services/catalog';
import {
  editChargeEntry,
  editPaymentEntry,
  fetchEntryDetail,
  fetchShopPriceMemory,
} from '../../services/ledger';
import { useSession } from '../../state/SessionContext';
import { useTheme } from '../../theme/ThemeContext';
import { Fonts, Radius, Space } from '../../theme/tokens';
import type { LedgerEntry, PriceMemoryItem } from '../../types/phase2';
import type { CatalogItem, Category } from '../../types/phase4to6';

export default function EditEntryScreen() {
  const { palette } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Array.isArray(id) ? id[0] : id;

  const { loading, session, householdContext } = useSession();
  const [entry, setEntry] = useState<LedgerEntry | null>(null);
  const [priceMemory, setPriceMemory] = useState<PriceMemoryItem[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entryDate, setEntryDate] = useState('');
  const [billMonth, setBillMonth] = useState('');
  const [note, setNote] = useState('');
  const [amountEtb, setAmountEtb] = useState('');
  const [lines, setLines] = useState<EditableChargeLine[]>([]);

  const householdId = householdContext?.household.id ?? null;

  useEffect(() => {
    if (!entryId) return;
    let active = true;

    void fetchEntryDetail(entryId)
      .then(async ({ entry: fetched }) => {
        if (!active) return;
        setEntry(fetched);
        if (fetched) {
          setEntryDate(fetched.entry_date);
          setBillMonth(fetched.bill_month ?? getStandardBillMonth(fetched.entry_date));
          setNote(fetched.note);
          setAmountEtb(formatSantimForInput(fetched.total_amount_santim));
          if (fetched.type === 'charge') {
            setLines(
              (fetched.entry_lines ?? []).map((line, idx) => ({
                key: line.id || `line-${idx}`,
                catalogItemId: line.catalog_item_id ?? null,
                itemName: line.item_name,
                quantity: formatQuantityMilli(line.quantity_milli),
                unit: line.unit,
                unitPriceEtb: formatSantimForInput(line.unit_price_santim),
              }))
            );
            const [memory, items, cats] = await Promise.all([
              fetchShopPriceMemory(fetched.shop_id),
              householdId
                ? fetchCatalogItems(householdId).catch(() => [] as CatalogItem[])
                : Promise.resolve([] as CatalogItem[]),
              householdId
                ? fetchCategories(householdId).catch(() => [] as Category[])
                : Promise.resolve([] as Category[]),
            ]);
            if (active) {
              setPriceMemory(memory);
              setCatalogItems(items);
              setCategories(cats);
            }
          }
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load entry');
      })
      .finally(() => {
        if (active) setLoadingInit(false);
      });

    return () => {
      active = false;
    };
  }, [entryId, householdId]);

  const mergedSuggestions = useMemo(
    () => mergeItemSuggestions(priceMemory, catalogItems, categories),
    [priceMemory, catalogItems, categories]
  );

  const parsedCharge = useMemo(() => computeEditableLinesSummary(lines), [lines]);

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }
  if (!loading && !householdContext) {
    return <Redirect href="/link-household" />;
  }
  if (!session) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </SafeAreaView>
    );
  }

  const allowed = entry ? canEditOrVoidEntry(entry, session.user.id) : false;

  const updateLine = (key: string, patch: Partial<EditableChargeLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const handleSave = async () => {
    if (!entry || submitting) return;
    setError(null);

    let validDate: string;
    try {
      validDate = validateDateString(entryDate);
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Invalid date');
      return;
    }

    setSubmitting(true);
    try {
      if (entry.type === 'payment') {
        const amountSantim = parseEtbToSantim(amountEtb);
        if (amountSantim <= 0) {
          throw new Error('Payment amount must be greater than 0 ETB');
        }
        await editPaymentEntry({
          entryId: entry.id,
          entryDate: validDate,
          amountSantim,
          note,
        });
      } else {
        const drafts = validateEditableLinesToDrafts(lines);
        await editChargeEntry({
          entryId: entry.id,
          entryDate: validDate,
          billMonth,
          note,
          lines: drafts,
        });
      }

      triggerHaptic('success');
      router.back();
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSubmitting(false);
    }
  };

  const day = /^\d{4}-\d{2}-\d{2}$/.test(entryDate)
    ? Number.parseInt(entryDate.slice(8, 10), 10)
    : 0;
  const inPaydayWindow = day >= 24 && day <= 26;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <LedgerHeader
        title={entry?.type === 'payment' ? 'Edit payment' : 'Edit charge'}
        backLabel="Cancel"
      />

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
          ) : !entry ? (
            <View
              style={[
                styles.card,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              <Text style={[styles.mutedText, { color: palette.textMuted }]}>Entry not found.</Text>
            </View>
          ) : !allowed ? (
            <View
              style={[
                styles.card,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              <Text style={[styles.mutedText, { color: palette.textMuted }]}>
                Only the creator can edit a non-voided entry.
              </Text>
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}
              >
                <Text style={[styles.label, { color: palette.textSecondary }]}>Date</Text>
                <DateStepperInput
                  value={entryDate}
                  onChangeDate={(text) => {
                    setEntryDate(text);
                    if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(text)) {
                      setBillMonth(getStandardBillMonth(text));
                    }
                  }}
                />

                {entry.type === 'charge' && billMonth ? (
                  <View style={[styles.billRow, { backgroundColor: palette.primaryLight }]}>
                    <Text style={[styles.billText, { color: palette.primary }]}>
                      Bill: {formatBillMonthLabel(billMonth)}
                    </Text>
                    {inPaydayWindow ? (
                      <Pressable
                        onPress={() => {
                          const base = entryDate.slice(0, 7);
                          setBillMonth((prev) =>
                            prev === base ? shiftYearMonth(base, 1) : base
                          );
                        }}
                      >
                        <Text style={[styles.toggleText, { color: palette.amber }]}>
                          Switch month
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {entry.type === 'payment' ? (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: palette.surface, borderColor: palette.border },
                  ]}
                >
                  <Text style={[styles.label, { color: palette.textSecondary }]}>
                    Payment amount (ETB)
                  </Text>
                  <TextInput
                    style={[
                      styles.bigInput,
                      {
                        borderColor: palette.borderStrong,
                        color: palette.textPrimary,
                        backgroundColor: palette.background,
                      },
                    ]}
                    value={amountEtb}
                    onChangeText={setAmountEtb}
                    accessibilityLabel="Payment amount in ETB"
                    keyboardType="decimal-pad"
                  />
                </View>
              ) : (
                <ChargeLinesEditor
                  lines={lines}
                  lineTotals={parsedCharge.lineTotals}
                  mergedSuggestions={mergedSuggestions}
                  onUpdateLine={updateLine}
                  onRemoveLine={(key) => setLines((prev) => prev.filter((l) => l.key !== key))}
                  onAddLine={() =>
                    setLines((prev) => [...prev, makeEmptyEditableLine(prev.length)])
                  }
                />
              )}

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
                  onChangeText={setNote}
                  accessibilityLabel="Receipt note"
                  placeholder="Receipt note"
                  placeholderTextColor={palette.textMuted}
                  maxLength={500}
                />

                {entry.type === 'charge' ? (
                  <View style={[styles.totalRow, { borderTopColor: palette.border }]}>
                    <Text style={[styles.totalLabel, { color: palette.textSecondary }]}>
                      Updated total
                    </Text>
                    <Text style={[styles.totalValue, { color: palette.textPrimary }]}>
                      {formatEtb(parsedCharge.grandTotalSantim)}
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: palette.primaryButtonBg },
                    submitting && styles.disabled,
                    pressed && { opacity: 0.9 },
                  ]}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Save changes"
                  onPress={() => void handleSave()}
                >
                  {submitting ? (
                    <ActivityIndicator color={palette.primaryButtonText} />
                  ) : (
                    <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
                      Save changes
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
    gap: Space.s16,
  },
  card: {
    borderRadius: Radius.card,
    padding: Space.s16,
    borderWidth: 1,
    gap: Space.s12,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontFamily: Fonts.sansMedium, fontSize: 13, lineHeight: 16 },
  monoHint: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 16 },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  bigInput: {
    height: 52,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.s12,
    fontFamily: Fonts.monoMedium,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
  },
  billRow: {
    borderRadius: Radius.control,
    padding: Space.s12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  toggleText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  totalRow: {
    borderTopWidth: 1,
    paddingTop: Space.s12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  totalLabel: { fontFamily: Fonts.sans, fontSize: 14 },
  totalValue: {
    fontFamily: Fonts.monoMedium,
    fontSize: 22,
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
