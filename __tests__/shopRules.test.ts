import {
  canManageShops,
  findMember,
  isSuperAdmin,
  normalizeInviteCode,
  splitShopsByStatus,
  validateDisplayName,
  validateShopName,
} from '../src/lib/shopRules';
import type { Member, Shop } from '../src/types/phase1';

const sampleMembers: Member[] = [
  {
    user_id: 'u1',
    household_id: 'h1',
    role: 'super_admin',
    display_name: 'Tensay',
    avatar_color: '#1E6B52',
    joined_at: '2026-11-25T10:00:00Z',
  },
  {
    user_id: 'u2',
    household_id: 'h1',
    role: 'member',
    display_name: 'Partner',
    avatar_color: '#B45309',
    joined_at: '2026-11-25T10:05:00Z',
  },
];

const baseShop: Omit<Shop, 'id' | 'name' | 'needs_review' | 'archived' | 'merged_into_shop_id'> = {
  household_id: 'h1',
  created_by: 'u2',
  created_at: '2026-11-25T10:10:00Z',
  updated_at: '2026-11-25T10:10:00Z',
};

describe('Phase 1 role, validation, and shop grouping rules', () => {
  test('distinguishes super_admin vs member capabilities', () => {
    expect(isSuperAdmin('super_admin')).toBe(true);
    expect(isSuperAdmin('member')).toBe(false);
    expect(canManageShops('super_admin')).toBe(true);
    expect(canManageShops('member')).toBe(false);
    expect(canManageShops(null)).toBe(false);
  });

  test('validates shop names and display names', () => {
    expect(validateShopName('  Abebe Shop  ')).toBe('Abebe Shop');
    expect(() => validateShopName('   ')).toThrow();
    expect(() => validateShopName('a'.repeat(81))).toThrow();

    expect(validateDisplayName(' Tensay ')).toBe('Tensay');
    expect(() => validateDisplayName('')).toThrow();
  });

  test('normalizes and validates 6-char invite codes', () => {
    expect(normalizeInviteCode(' ab23cd ')).toBe('AB23CD');
    expect(() => normalizeInviteCode('12345')).toThrow(); // 1 is disallowed & too short
    expect(() => normalizeInviteCode('AB01CD')).toThrow(); // 0 and 1 disallowed
  });

  test('splits shops into needsReview, activeApproved, and archivedOrMerged sorted alphabetically', () => {
    const shops: Shop[] = [
      { ...baseShop, id: 's1', name: 'Zebra Bakery', needs_review: false, archived: false, merged_into_shop_id: null },
      { ...baseShop, id: 's2', name: 'New Corner Kiosk', needs_review: true, archived: false, merged_into_shop_id: null },
      { ...baseShop, id: 's3', name: 'Abebe Mart', needs_review: false, archived: false, merged_into_shop_id: null },
      { ...baseShop, id: 's4', name: 'Old Shop', needs_review: false, archived: true, merged_into_shop_id: null },
      { ...baseShop, id: 's5', name: 'Dup Abebe', needs_review: false, archived: true, merged_into_shop_id: 's3' },
    ];

    const grouped = splitShopsByStatus(shops);
    expect(grouped.needsReview.map((s) => s.id)).toEqual(['s2']);
    expect(grouped.activeApproved.map((s) => s.id)).toEqual(['s3', 's1']);
    expect(grouped.archivedOrMerged.map((s) => s.id)).toEqual(['s5', 's4']);
  });

  test('finds member by user_id', () => {
    expect(findMember(sampleMembers, 'u1')?.display_name).toBe('Tensay');
    expect(findMember(sampleMembers, 'missing')).toBeUndefined();
  });
});
