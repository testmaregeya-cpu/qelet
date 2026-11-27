import Feather from '@expo/vector-icons/Feather';
import { Redirect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdminShopsTab } from '../components/admin/AdminShopsTab';
import { AuditLogTab } from '../components/admin/AuditLogTab';
import { ExportTab } from '../components/admin/ExportTab';
import { SavedItemsTab } from '../components/admin/SavedItemsTab';
import { AppBottomNav } from '../components/AppBottomNav';
import { ShopManageModal } from '../components/ShopManageModal';
import { createTrailingDebouncer } from '../lib/debounce';
import { triggerHaptic } from '../lib/haptics';
import { parseEtbToSantim } from '../lib/money';
import { isSuperAdmin } from '../lib/shopRules';
import { buildEntriesCsv } from '../lib/statement';
import { useKeyboardAwareScroll } from '../lib/useKeyboardInset';
import {
  exportHouseholdJsonAndShare,
  exportTextFileAndShare,
  fetchFullAuditLog,
} from '../services/admin';
import {
  createCatalogItem,
  createCategory,
  fetchCatalogItems,
  fetchCategories,
  setCatalogItemArchived,
  setCategoryArchived,
  subscribeToCatalogRealtime,
} from '../services/catalog';
import { fetchHouseholdEntries } from '../services/ledger';
import {
  approveShop,
  fetchShops,
  mergeShops,
  renameShop,
  setShopArchived,
  subscribeToHouseholdRealtime,
} from '../services/shops';
import { useSession } from '../state/SessionContext';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';
import type { Shop } from '../types/phase1';
import type { AuditLogRow, CatalogItem, Category } from '../types/phase4to6';

type AdminTab = 'saved' | 'shops' | 'audit' | 'export';

const AUDIT_PAGE_SIZE = 40;

export default function AdminScreen() {
  const { palette } = useTheme();
  const { loading, session, householdContext } = useSession();

  const [tab, setTab] = useState<AdminTab>('saved');
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);
  const [hasMoreAudit, setHasMoreAudit] = useState(false);
  const [loadingMoreAudit, setLoadingMoreAudit] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('pcs');
  const [newItemPriceEtb, setNewItemPriceEtb] = useState('');
  const [newItemCategoryId, setNewItemCategoryId] = useState<string | null>(null);

  const householdId = householdContext?.household.id ?? null;
  const adminUser = householdContext
    ? isSuperAdmin(householdContext.currentMember.role)
    : false;
  const { scrollRef, handleInputFocus, scrollViewHandlers } = useKeyboardAwareScroll();

  const loadAdminData = useCallback(async () => {
    if (!householdId || !adminUser) return;
    try {
      const [cats, items, shopList, audit] = await Promise.all([
        fetchCategories(householdId),
        fetchCatalogItems(householdId),
        fetchShops(householdId),
        fetchFullAuditLog(householdId, AUDIT_PAGE_SIZE, 0),
      ]);
      setError(null);
      setCategories(cats);
      setCatalogItems(items);
      setShops(shopList);
      setAuditRows(audit);
      setHasMoreAudit(audit.length === AUDIT_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin console');
    } finally {
      setLoadingData(false);
    }
  }, [householdId, adminUser]);

  useEffect(() => {
    if (!householdId || !adminUser) return;
    let active = true;

    void Promise.all([
      fetchCategories(householdId),
      fetchCatalogItems(householdId),
      fetchShops(householdId),
      fetchFullAuditLog(householdId, AUDIT_PAGE_SIZE, 0),
    ])
      .then(([cats, items, shopList, audit]) => {
        if (!active) return;
        setError(null);
        setCategories(cats);
        setCatalogItems(items);
        setShops(shopList);
        setAuditRows(audit);
        setHasMoreAudit(audit.length === AUDIT_PAGE_SIZE);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load admin console');
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    const debouncedReload = createTrailingDebouncer(() => {
      if (active) void loadAdminData();
    }, 350);

    const unsubCat = subscribeToCatalogRealtime(householdId, debouncedReload.trigger);
    const unsubHouse = subscribeToHouseholdRealtime(householdId, debouncedReload.trigger);
    return () => {
      active = false;
      debouncedReload.cancel();
      unsubCat();
      unsubHouse();
    };
  }, [householdId, adminUser, loadAdminData]);

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

  if (!adminUser) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>
            Owner access only
          </Text>
          <Text style={[styles.mutedBody, { color: palette.textSecondary }]}>
            Only the household owner can manage saved quick-add items, audit logs, and backups.
          </Text>
        </View>
        <AppBottomNav active="admin" isSuperAdmin={false} />
      </SafeAreaView>
    );
  }

  const handleLoadMoreAudit = async () => {
    if (!householdId || loadingMoreAudit || !hasMoreAudit) return;
    setLoadingMoreAudit(true);
    try {
      const older = await fetchFullAuditLog(householdId, AUDIT_PAGE_SIZE, auditRows.length);
      setAuditRows((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...older.filter((row) => !seen.has(row.id))];
      });
      setHasMoreAudit(older.length === AUDIT_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load older audit events');
    } finally {
      setLoadingMoreAudit(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!householdId || busy) return;
    setError(null);
    setBusy(true);
    try {
      await createCategory(householdId, newCategoryName);
      triggerHaptic('success');
      setNewCategoryName('');
      await loadAdminData();
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Failed to add item group');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCategoryArchived = async (categoryId: string, nextArchived: boolean) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await setCategoryArchived(categoryId, nextArchived);
      triggerHaptic('selection');
      await loadAdminData();
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Failed to update item group');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCatalogItem = async () => {
    if (!householdId || busy) return;
    setError(null);
    setBusy(true);
    try {
      const priceSantim = newItemPriceEtb.trim() ? parseEtbToSantim(newItemPriceEtb) : 0;
      await createCatalogItem({
        householdId,
        categoryId: newItemCategoryId,
        name: newItemName,
        defaultUnit: newItemUnit,
        defaultPriceSantim: priceSantim,
      });
      triggerHaptic('success');
      setNewItemName('');
      setNewItemPriceEtb('');
      await loadAdminData();
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Failed to save quick-add item');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCatalogItemArchived = async (itemId: string, nextArchived: boolean) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await setCatalogItemArchived(itemId, nextArchived);
      triggerHaptic('selection');
      await loadAdminData();
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'Failed to update quick-add item');
    } finally {
      setBusy(false);
    }
  };

  const handleExportJson = async () => {
    if (!householdId) return;
    setError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      await exportHouseholdJsonAndShare(householdId);
      triggerHaptic('success');
      setStatusMessage('Full JSON backup ready to share.');
      await loadAdminData();
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'JSON export failed');
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = async () => {
    if (!householdId) return;
    setError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      const entries = await fetchHouseholdEntries(householdId);
      const csv = buildEntriesCsv(entries, shops, householdContext.members);
      await exportTextFileAndShare(`qelet-ledger-${Date.now()}.csv`, csv, 'text/csv');
      triggerHaptic('success');
      setStatusMessage('CSV ledger exported.');
    } catch (err) {
      triggerHaptic('error');
      setError(err instanceof Error ? err.message : 'CSV export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: palette.surface, borderBottomColor: palette.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>Admin console</Text>
      </View>

      <View style={[styles.tabBar, { backgroundColor: palette.surfaceMuted }]}>
        {(
          [
            ['saved', 'Saved items'],
            ['shops', 'Shops'],
            ['audit', 'Audit'],
            ['export', 'Export'],
          ] as const
        ).map(([key, label]) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              style={[styles.tabItem, active && { backgroundColor: palette.surface }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                triggerHaptic('selection');
                setTab(key);
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: active ? palette.textPrimary : palette.textSecondary,
                    fontFamily: active ? Fonts.sansMedium : Fonts.sans,
                  },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          {...scrollViewHandlers}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadAdminData().finally(() => setRefreshing(false));
              }}
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
          {statusMessage ? (
            <View style={[styles.errorBox, { backgroundColor: palette.primaryLight }]}>
              <Feather name="check-circle" size={16} color={palette.primary} />
              <Text style={[styles.errorText, { color: palette.primary }]}>{statusMessage}</Text>
            </View>
          ) : null}

          {loadingData ? (
            <ActivityIndicator style={{ marginTop: Space.s24 }} color={palette.primary} />
          ) : tab === 'saved' ? (
            <SavedItemsTab
              categories={categories}
              catalogItems={catalogItems}
              busy={busy}
              newCategoryName={newCategoryName}
              onChangeNewCategoryName={setNewCategoryName}
              onCreateCategory={() => void handleCreateCategory()}
              onToggleCategoryArchived={(id, next) => void handleToggleCategoryArchived(id, next)}
              newItemName={newItemName}
              onChangeNewItemName={setNewItemName}
              newItemUnit={newItemUnit}
              onChangeNewItemUnit={setNewItemUnit}
              newItemPriceEtb={newItemPriceEtb}
              onChangeNewItemPriceEtb={setNewItemPriceEtb}
              newItemCategoryId={newItemCategoryId}
              onSelectCategoryId={setNewItemCategoryId}
              onCreateCatalogItem={() => void handleCreateCatalogItem()}
              onToggleCatalogItemArchived={(id, next) =>
                void handleToggleCatalogItemArchived(id, next)
              }
              onInputFocus={handleInputFocus}
            />
          ) : tab === 'shops' ? (
            <AdminShopsTab shops={shops} onManageShop={setSelectedShop} />
          ) : tab === 'audit' ? (
            <AuditLogTab
              auditRows={auditRows}
              members={householdContext.members}
              hasMoreAudit={hasMoreAudit}
              loadingMoreAudit={loadingMoreAudit}
              onLoadMoreAudit={() => void handleLoadMoreAudit()}
            />
          ) : (
            <ExportTab
              busy={busy}
              onExportJson={() => void handleExportJson()}
              onExportCsv={() => void handleExportCsv()}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ShopManageModal
        shop={selectedShop}
        mergeTargets={shops}
        busy={busy}
        onClose={() => setSelectedShop(null)}
        onApprove={async (id) => {
          setBusy(true);
          try {
            await approveShop(id);
            await loadAdminData();
          } finally {
            setBusy(false);
          }
        }}
        onRename={async (id, name) => {
          setBusy(true);
          try {
            await renameShop(id, name);
            await loadAdminData();
          } finally {
            setBusy(false);
          }
        }}
        onToggleArchive={async (id, archived) => {
          setBusy(true);
          try {
            await setShopArchived(id, archived);
            await loadAdminData();
          } finally {
            setBusy(false);
          }
        }}
        onMerge={async (src, dst) => {
          setBusy(true);
          try {
            await mergeShops(src, dst);
            await loadAdminData();
          } finally {
            setBusy(false);
          }
        }}
      />

      <AppBottomNav active="admin" isSuperAdmin={true} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Space.s24,
    gap: Space.s8,
  },
  header: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: Space.s16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 18,
    lineHeight: 24,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: Space.s16,
    marginTop: Space.s12,
    borderRadius: Radius.control,
    padding: Space.s4,
    gap: Space.s4,
  },
  tabItem: {
    flex: 1,
    height: 36,
    borderRadius: Radius.tag,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 12,
    lineHeight: 16,
  },
  container: {
    paddingHorizontal: Space.s16,
    paddingTop: Space.s16,
    paddingBottom: Space.s32,
    gap: Space.s20,
  },
  mutedBody: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    borderRadius: Radius.control,
    padding: Space.s12,
  },
  errorText: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
});
