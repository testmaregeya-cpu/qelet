import {
  ETHIOPIAN_SHOP_TEMPLATES,
  ETHIOPIAN_STAPLE_ITEMS,
  generateSeedPlan,
  generateSeedSql,
} from '../scripts/seedPlan';

describe('Data Seeder (seedPlan)', () => {
  const mockHouseholdId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const mockUserId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('contains expected Ethiopian staple items and shop templates', () => {
    expect(ETHIOPIAN_SHOP_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(ETHIOPIAN_SHOP_TEMPLATES.some((s) => s.name === 'Abebe Suq')).toBe(true);
    expect(ETHIOPIAN_STAPLE_ITEMS.some((i) => i.name.includes('Sugar'))).toBe(true);
  });

  it('generates a consistent multi-shop, multi-item seed plan', () => {
    const plan = generateSeedPlan({
      householdId: mockHouseholdId,
      userId: mockUserId,
      billMonth: '2026-11',
      currentDate: '2026-11-26',
    });

    expect(plan.shops).toHaveLength(4);
    expect(plan.entries.length).toBeGreaterThanOrEqual(6);
    expect(plan.entryLines.length).toBeGreaterThanOrEqual(6);

    // Household ID & User ID consistency
    for (const shop of plan.shops) {
      expect(shop.household_id).toBe(mockHouseholdId);
      expect(shop.created_by).toBe(mockUserId);
    }

    for (const entry of plan.entries) {
      expect(entry.household_id).toBe(mockHouseholdId);
      expect(entry.created_by).toBe(mockUserId);
      if (entry.type === 'charge') {
        expect(entry.bill_month).toBe('2026-11');
      } else {
        expect(entry.bill_month).toBeNull();
      }
      expect(entry.total_amount_santim).toBeGreaterThan(0);
    }

    // Mathematical integrity
    expect(plan.summary.totalChargeSantim).toBeGreaterThan(plan.summary.totalPaymentSantim);
    expect(plan.summary.netBalanceSantim).toBe(
      plan.summary.totalChargeSantim - plan.summary.totalPaymentSantim
    );
  });

  it('generates valid, idempotent SQL containing transactional guards', () => {
    const plan = generateSeedPlan({
      householdId: mockHouseholdId,
      userId: mockUserId,
    });
    const sql = generateSeedSql(plan);

    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
    expect(sql).toContain('INSERT INTO public.shops');
    expect(sql).toContain('INSERT INTO public.entries');
    expect(sql).toContain('INSERT INTO public.entry_lines');
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
  });
});
