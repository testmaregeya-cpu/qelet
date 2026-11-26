import { getSupabaseClient } from '../lib/supabase';
import type { CatalogItem, Category } from '../types/phase4to6';

export async function fetchCategories(householdId: string): Promise<Category[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .returns<Category[]>();

  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function createCategory(householdId: string, name: string): Promise<Category> {
  const clean = name.trim();
  if (!clean || clean.length > 60) {
    throw new Error('Category name must be 1 to 60 characters');
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('categories')
    .insert({ household_id: householdId, name: clean })
    .select('*')
    .single<Category>();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function setCategoryArchived(categoryId: string, archived: boolean): Promise<Category> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('categories')
    .update({ archived })
    .eq('id', categoryId)
    .select('*')
    .single<Category>();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function fetchCatalogItems(householdId: string): Promise<CatalogItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('catalog_items')
    .select('*')
    .eq('household_id', householdId)
    .order('name', { ascending: true })
    .returns<CatalogItem[]>();

  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function createCatalogItem(params: {
  householdId: string;
  categoryId: string | null;
  name: string;
  defaultUnit: string;
  defaultPriceSantim: number;
}): Promise<CatalogItem> {
  const clean = params.name.trim();
  if (!clean || clean.length > 80) {
    throw new Error('Item name must be 1 to 80 characters');
  }
  if (!Number.isSafeInteger(params.defaultPriceSantim) || params.defaultPriceSantim < 0) {
    throw new Error('Default price cannot be negative');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('catalog_items')
    .insert({
      household_id: params.householdId,
      category_id: params.categoryId,
      name: clean,
      default_unit: params.defaultUnit.trim() || 'pcs',
      default_price_santim: params.defaultPriceSantim,
    })
    .select('*')
    .single<CatalogItem>();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function updateCatalogItem(params: {
  id: string;
  categoryId: string | null;
  name: string;
  defaultUnit: string;
  defaultPriceSantim: number;
}): Promise<CatalogItem> {
  const clean = params.name.trim();
  if (!clean || clean.length > 80) {
    throw new Error('Item name must be 1 to 80 characters');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('catalog_items')
    .update({
      category_id: params.categoryId,
      name: clean,
      default_unit: params.defaultUnit.trim() || 'pcs',
      default_price_santim: params.defaultPriceSantim,
    })
    .eq('id', params.id)
    .select('*')
    .single<CatalogItem>();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function setCatalogItemArchived(itemId: string, archived: boolean): Promise<CatalogItem> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('catalog_items')
    .update({ archived })
    .eq('id', itemId)
    .select('*')
    .single<CatalogItem>();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export function subscribeToCatalogRealtime(
  householdId: string,
  onSync: () => void
): () => void {
  const supabase = getSupabaseClient();
  const subId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const channel = supabase
    .channel(`catalog:${householdId}:${subId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'categories',
        filter: `household_id=eq.${householdId}`,
      },
      onSync
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'catalog_items',
        filter: `household_id=eq.${householdId}`,
      },
      onSync
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
