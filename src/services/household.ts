import { getSupabaseClient } from '../lib/supabase';
import { normalizeInviteCode, validateDisplayName } from '../lib/shopRules';
import type { Household, HouseholdContextData, Member } from '../types/phase1';
export type { HouseholdContextData };

export async function fetchHouseholdContext(userId: string): Promise<HouseholdContextData | null> {
  const supabase = getSupabaseClient();

  const { data: currentMember, error: memberError } = await supabase
    .from('members')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<Member>();

  if (memberError) {
    throw new Error(memberError.message);
  }
  if (!currentMember) {
    return null;
  }

  const [{ data: household, error: householdError }, { data: members, error: membersError }] =
    await Promise.all([
      supabase
        .from('households')
        .select('*')
        .eq('id', currentMember.household_id)
        .single<Household>(),
      supabase
        .from('members')
        .select('*')
        .eq('household_id', currentMember.household_id)
        .order('joined_at', { ascending: true })
        .returns<Member[]>(),
    ]);

  if (householdError) {
    throw new Error(householdError.message);
  }
  if (membersError) {
    throw new Error(membersError.message);
  }

  return {
    household,
    currentMember,
    members: members ?? [currentMember],
  };
}

export async function createHousehold(params: {
  householdName: string;
  displayName: string;
}): Promise<HouseholdContextData> {
  const householdName = params.householdName.trim();
  if (!householdName || householdName.length > 80) {
    throw new Error('Household name must be between 1 and 80 characters');
  }
  const displayName = validateDisplayName(params.displayName);

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('create_household', {
    p_household_name: householdName,
    p_display_name: displayName,
  });

  if (error) {
    throw new Error(error.message);
  }

  const payload = data as { household: Household; member: Member };
  return {
    household: payload.household,
    currentMember: payload.member,
    members: [payload.member],
  };
}

export async function joinHouseholdByCode(params: {
  inviteCode: string;
  displayName: string;
}): Promise<HouseholdContextData> {
  const inviteCode = normalizeInviteCode(params.inviteCode);
  const displayName = validateDisplayName(params.displayName);

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('join_household_by_code', {
    p_invite_code: inviteCode,
    p_display_name: displayName,
  });

  if (error) {
    throw new Error(error.message);
  }

  const payload = data as { household: Household; member: Member };
  const refreshed = await fetchHouseholdContext(payload.member.user_id);
  if (refreshed) {
    return refreshed;
  }

  return {
    household: payload.household,
    currentMember: payload.member,
    members: [payload.member],
  };
}

export async function rotateInviteCode(householdId: string): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('rotate_invite_code', {
    p_household_id: householdId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return String(data);
}
