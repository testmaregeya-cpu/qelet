import { getSupabaseClient } from '../lib/supabase';

export const PLATFORM_SUPER_ADMIN_EMAILS = [
  'tensaylemessa@gmail.com',
  'testmaregeyaa@gmail.com',
] as const;

export function isPlatformAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return (PLATFORM_SUPER_ADMIN_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}

export interface PlatformMetrics {
  total_households: number;
  total_users: number;
  total_shops: number;
  gross_credit_santim: number;
  gross_payments_santim: number;
  total_banned_users: number;
}

export interface PlatformUserItem {
  user_id: string;
  email: string;
  display_name: string;
  household_id: string | null;
  household_name: string;
  role: string;
  created_at: string;
  is_banned: boolean;
  ban_reason: string | null;
}

export interface PlatformHouseholdItem {
  household_id: string;
  household_name: string;
  invite_code: string;
  created_at: string;
  member_count: number;
  shop_count: number;
  total_balance_santim: number;
}

export async function checkIsPlatformAdmin(): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('check_is_platform_admin');
  if (error) {
    return false;
  }
  return Boolean(data);
}

export async function fetchPlatformMetrics(): Promise<PlatformMetrics> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_platform_metrics');
  if (error) {
    throw new Error(error.message);
  }
  return data as PlatformMetrics;
}

export async function fetchPlatformUsers(): Promise<PlatformUserItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('list_platform_users');
  if (error) {
    throw new Error(error.message);
  }
  return (data as PlatformUserItem[]) ?? [];
}

export async function fetchPlatformHouseholds(): Promise<PlatformHouseholdItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('list_platform_households');
  if (error) {
    throw new Error(error.message);
  }
  return (data as PlatformHouseholdItem[]) ?? [];
}

export async function banPlatformUser(userId: string, reason: string = 'Violation of platform rules'): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('ban_platform_user', {
    p_target_user_id: userId,
    p_reason: reason.trim() || 'Suspended by platform admin',
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function unbanPlatformUser(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('unban_platform_user', {
    p_target_user_id: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
}
