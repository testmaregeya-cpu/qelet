import type { Member, MemberRole, Shop } from '../types/phase1';

export function isSuperAdmin(role: MemberRole | null | undefined): boolean {
  return role === 'super_admin';
}

export function canManageShops(role: MemberRole | null | undefined): boolean {
  return isSuperAdmin(role);
}

export function validateShopName(rawName: string): string {
  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    throw new Error('Shop name cannot be empty');
  }
  if (trimmed.length > 80) {
    throw new Error('Shop name must be 80 characters or fewer');
  }
  return trimmed;
}

export function normalizeInviteCode(rawCode: string): string {
  const normalized = rawCode.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(normalized)) {
    throw new Error('Invite code must be 6 characters (A-Z, 2-9)');
  }
  return normalized;
}

export function validateDisplayName(rawName: string): string {
  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    throw new Error('Display name cannot be empty');
  }
  if (trimmed.length > 50) {
    throw new Error('Display name must be 50 characters or fewer');
  }
  return trimmed;
}

export function splitShopsByStatus(shops: Shop[]): {
  needsReview: Shop[];
  activeApproved: Shop[];
  archivedOrMerged: Shop[];
} {
  const needsReview: Shop[] = [];
  const activeApproved: Shop[] = [];
  const archivedOrMerged: Shop[] = [];

  for (const shop of shops) {
    if (shop.archived || shop.merged_into_shop_id !== null) {
      archivedOrMerged.push(shop);
    } else if (shop.needs_review) {
      needsReview.push(shop);
    } else {
      activeApproved.push(shop);
    }
  }

  const byName = (a: Shop, b: Shop) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  needsReview.sort(byName);
  activeApproved.sort(byName);
  archivedOrMerged.sort(byName);

  return { needsReview, activeApproved, archivedOrMerged };
}

export function findMember(members: readonly Member[], userId: string): Member | undefined {
  return members.find((m) => m.user_id === userId);
}
