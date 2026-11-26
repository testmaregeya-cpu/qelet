import { getSupabaseClient } from '../lib/supabase';
import { validateShopName } from '../lib/shopRules';
import type { Shop } from '../types/phase1';

export async function fetchShops(householdId: string): Promise<Shop[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('household_id', householdId)
    .order('name', { ascending: true })
    .returns<Shop[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function createShop(params: {
  householdId: string;
  name: string;
  createdBy: string;
}): Promise<Shop> {
  const cleanName = validateShopName(params.name);
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('shops')
    .insert({
      household_id: params.householdId,
      name: cleanName,
      created_by: params.createdBy,
    })
    .select('*')
    .single<Shop>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function approveShop(shopId: string): Promise<Shop> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('shops')
    .update({ needs_review: false })
    .eq('id', shopId)
    .select('*')
    .single<Shop>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function renameShop(shopId: string, newName: string): Promise<Shop> {
  const cleanName = validateShopName(newName);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('shops')
    .update({ name: cleanName })
    .eq('id', shopId)
    .select('*')
    .single<Shop>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function setShopArchived(shopId: string, archived: boolean): Promise<Shop> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('shops')
    .update({ archived })
    .eq('id', shopId)
    .select('*')
    .single<Shop>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function mergeShops(sourceShopId: string, targetShopId: string): Promise<Shop> {
  if (sourceShopId === targetShopId) {
    throw new Error('Choose a different target shop to merge into');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('merge_shops', {
    p_source_shop_id: sourceShopId,
    p_target_shop_id: targetShopId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as Shop;
}

export function subscribeToHouseholdRealtime(
  householdId: string,
  onSyncEvent: () => void
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`household:${householdId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shops',
        filter: `household_id=eq.${householdId}`,
      },
      onSyncEvent
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'members',
        filter: `household_id=eq.${householdId}`,
      },
      onSyncEvent
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'households',
        filter: `id=eq.${householdId}`,
      },
      onSyncEvent
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
