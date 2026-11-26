export type MemberRole = 'super_admin' | 'member';

export interface Household {
  id: string;
  name: string;
  currency_code: 'ETB';
  invite_code: string;
  created_by: string;
  created_at: string;
}

export interface Member {
  user_id: string;
  household_id: string;
  role: MemberRole;
  display_name: string;
  avatar_color: string;
  joined_at: string;
}

export interface Shop {
  id: string;
  household_id: string;
  name: string;
  archived: boolean;
  needs_review: boolean;
  merged_into_shop_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdContextData {
  household: Household;
  currentMember: Member;
  members: Member[];
}
