# Master Implementation Plan: Shop Crash, 1-Tap Actions, Offline Ledger, Push Alerts & Global Platform Super Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 
1. Fix Android crash when clicking/selecting shops.
2. Enable 1-tap direct Add Charge / Record Payment from shop cards.
3. Enable offline startup into the existing ledger without bouncing to `/link-household`.
4. Fix partner push notifications so partners receive instant push alerts on new charges and payments.
5. Redesign shop creation into a clean modal with Ethiopian presets.
6. Build a complete runnable data seeder (`scripts/seed.ts`).
7. **Build the Global Platform Super Admin Console** (`platform_admins`, `banned_users`, platform metrics, user ban/unban controls, all-households directory, accessible by Tensay).

**Architecture:**
- **Crash Prevention:** Replace `performAndroidHapticsAsync` with universal `Haptics.selectionAsync()` / `impactAsync()` in `src/lib/haptics.ts`.
- **1-Tap Actions:** Direct `[ + Charge ]` and `[ Pay ]` triggers on `ShopRow.tsx` + `ShopQuickActionsModal.tsx` on card tap.
- **Offline Ledger Caching:** `src/services/offlineStorage.ts` caching household context and ledger snapshots in `AsyncStorage`.
- **Partner Push Alerts:** Authenticated JWT support in `notify-partner` Edge Function and client dispatch in `src/services/ledger.ts`.
- **Shop Creation UI:** `CreateShopModal.tsx` with presets (*Suq, Kiosk, Bakery, Butcher, Pharmacy, Cafe*) and in-flow triggers.
- **Global Platform Super Admin:** Migration `0009_platform_super_admin.sql` with `platform_admins`, `banned_users`, RPCs for metrics, user listing, and ban/unban. Master screen `src/app/platform-console.tsx` guarded for Tensay (`tensaylemessa@gmail.com` / `testmaregeyaa@gmail.com`).

**Tech Stack:** React Native 0.88, Expo SDK 58, Expo Router, Supabase JS v2, PostgreSQL (RPCs + RLS), `AsyncStorage`, TypeScript 5, Jest.

---

### Task 1: Fix Android Crash on Shop Click & Selection

**Files:**
- Modify: `src/lib/haptics.ts`
- Modify: `src/app/shop/[id].tsx:45-145`
- Create: `__tests__/haptics.test.ts`
- Test: `__tests__/haptics.test.ts`

- [ ] **Step 1: Write the failing test for haptics resilience**

Create `__tests__/haptics.test.ts`:
```typescript
import * as Haptics from 'expo-haptics';
import { triggerHaptic } from '../src/lib/haptics';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

describe('triggerHaptic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('triggers selection haptics without throwing on any platform', async () => {
    expect(() => triggerHaptic('selection')).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('handles native haptic rejections silently without process termination', async () => {
    (Haptics.notificationAsync as jest.Mock).mockRejectedValueOnce(new Error('Native error'));
    expect(() => triggerHaptic('error')).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Update `src/lib/haptics.ts` to use universal safe methods**

Edit `src/lib/haptics.ts`:
```typescript
import * as Haptics from 'expo-haptics';

export type HapticKind = 'success' | 'error' | 'selection' | 'impact';

export function triggerHaptic(kind: HapticKind): void {
  void (async () => {
    try {
      switch (kind) {
        case 'success':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        case 'error':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        case 'selection':
          await Haptics.selectionAsync();
          return;
        case 'impact':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          return;
      }
    } catch {
      // Non-fatal on hardware without vibrator
    }
  })();
}
```

- [ ] **Step 3: Guard `src/app/shop/[id].tsx` against unmounted shop access**

Ensure `shopId` parsing handles strings and arrays defensively, and wrap header rendering in null checks.

- [ ] **Step 4: Run tests and verify**

Run: `npx jest __tests__/haptics.test.ts --runInBand`
Expected: PASS

- [ ] **Step 5: Commit check**
Check `auto_commit` setting. If enabled:
```bash
git add src/lib/haptics.ts src/app/shop/[id].tsx __tests__/haptics.test.ts
git commit -m "fix: prevent android crash on shop click by using universal haptics"
```

---

### Task 2: 1-Tap Shop Direct Actions (Add Charge / Record Payment)

**Files:**
- Create: `src/components/ShopQuickActionsModal.tsx`
- Modify: `src/components/ShopRow.tsx`
- Modify: `src/app/shops.tsx`
- Create: `__tests__/ShopQuickActionsModal.test.tsx`
- Test: `__tests__/ShopQuickActionsModal.test.tsx`

- [ ] **Step 1: Write test for `ShopQuickActionsModal`**

Create `__tests__/ShopQuickActionsModal.test.tsx`:
```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ShopQuickActionsModal } from '../src/components/ShopQuickActionsModal';
import { ThemeProvider } from '../src/theme/ThemeContext';
import type { Shop } from '../src/types/phase1';

const mockShop: Shop = {
  id: 's-1',
  household_id: 'hh-1',
  name: 'Abebe Suq',
  archived: false,
  needs_review: false,
  merged_into_shop_id: null,
  created_by: 'u-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('ShopQuickActionsModal', () => {
  it('triggers onAddCharge and onRecordPayment callbacks', () => {
    const onAddCharge = jest.fn();
    const onRecordPayment = jest.fn();
    const onViewStatement = jest.fn();
    const onClose = jest.fn();

    const { getByText } = render(
      <ThemeProvider>
        <ShopQuickActionsModal
          visible={true}
          shop={mockShop}
          balanceText="450 ETB"
          onClose={onClose}
          onAddCharge={onAddCharge}
          onRecordPayment={onRecordPayment}
          onViewStatement={onViewStatement}
        />
      </ThemeProvider>
    );

    fireEvent.press(getByText('Add credit charge'));
    expect(onAddCharge).toHaveBeenCalledWith(mockShop);

    fireEvent.press(getByText('Record payment'));
    expect(onRecordPayment).toHaveBeenCalledWith(mockShop);
  });
});
```

- [ ] **Step 2: Implement `src/components/ShopQuickActionsModal.tsx`**

Build modal with shop monogram, balance owed, `[ + Add credit charge ]`, `[ Record payment ]`, and `[ View statement ]`.

- [ ] **Step 3: Update `src/components/ShopRow.tsx` with direct 1-tap buttons**

Add `[ + Charge ]` and `[ Pay ]` pill buttons directly to the card. Tapping the card body opens `ShopQuickActionsModal`.

- [ ] **Step 4: Connect actions in `src/app/shops.tsx`**

Navigate directly to `/add-charge?shopId=...` or `/record-payment?shopId=...`.

- [ ] **Step 5: Run tests and verify**

Run: `npx jest __tests__/ShopQuickActionsModal.test.tsx --runInBand`
Expected: PASS

- [ ] **Step 6: Commit check**
Check `auto_commit` setting. If enabled:
```bash
git add src/components/ShopQuickActionsModal.tsx src/components/ShopRow.tsx src/app/shops.tsx __tests__/ShopQuickActionsModal.test.tsx
git commit -m "feat: 1-tap direct charge and payment triggers on shop cards"
```

---

### Task 3: Offline-First Startup & Local Ledger Storage

**Files:**
- Create: `src/services/offlineStorage.ts`
- Modify: `src/state/SessionContext.tsx`
- Modify: `src/hooks/useHouseholdLedger.ts`
- Modify: `src/hooks/useShopDetail.ts`
- Create: `__tests__/offlineStorage.test.ts`
- Test: `__tests__/offlineStorage.test.ts`

- [ ] **Step 1: Write test for offline storage**

Create `__tests__/offlineStorage.test.ts` verifying `cacheHouseholdContext`, `getCachedHouseholdContext`, `cacheHouseholdLedger`, `getCachedHouseholdLedger`.

- [ ] **Step 2: Implement `src/services/offlineStorage.ts`**

Implement AsyncStorage caching for household context, shops, entries, and disputes.

- [ ] **Step 3: Update `SessionContext.tsx`, `useHouseholdLedger.ts`, and `useShopDetail.ts`**

Restore cached context on startup so `index.tsx` routes directly to `/shops` when offline. Immediately display cached ledger on mount.

- [ ] **Step 4: Run tests and verify**

Run: `npx jest __tests__/offlineStorage.test.ts --runInBand`
Expected: PASS

- [ ] **Step 5: Commit check**
Check `auto_commit` setting. If enabled:
```bash
git add src/services/offlineStorage.ts src/state/SessionContext.tsx src/hooks/useHouseholdLedger.ts src/hooks/useShopDetail.ts __tests__/offlineStorage.test.ts
git commit -m "feat: offline-first local storage for household context and ledger"
```

---

### Task 4: Dual-Channel Partner Push Notifications & Edge Function

**Files:**
- Modify: `supabase/functions/notify-partner/index.ts`
- Modify: `src/services/notifications.ts`
- Modify: `src/services/ledger.ts`
- Create: `__tests__/partnerNotifications.test.ts`
- Test: `__tests__/partnerNotifications.test.ts`

- [ ] **Step 1: Write test for partner notification payload**

Create `__tests__/partnerNotifications.test.ts` testing copy generation for charges and payments in ETB.

- [ ] **Step 2: Update `supabase/functions/notify-partner/index.ts`**

Support authenticated user JWT tokens and deploy to Supabase using `npx supabase functions deploy notify-partner`.

- [ ] **Step 3: Trigger push alerts from `src/services/ledger.ts`**

Call `notifyPartnerOfLedgerEntry` inside `createChargeEntry` and `createPaymentEntry`.

- [ ] **Step 4: Run tests and verify**

Run: `npx jest __tests__/partnerNotifications.test.ts --runInBand`
Expected: PASS

- [ ] **Step 5: Commit check**
Check `auto_commit` setting. If enabled:
```bash
git add supabase/functions/notify-partner/index.ts src/services/notifications.ts src/services/ledger.ts __tests__/partnerNotifications.test.ts
git commit -m "feat: partner push alerts on credit charges and payments"
```

---

### Task 5: Production Data Seeder Script

**Files:**
- Create: `scripts/seedPlan.ts`
- Create: `scripts/seed.ts`
- Create: `__tests__/dataSeeder.test.ts`
- Test: `__tests__/dataSeeder.test.ts`

- [ ] **Step 1: Write test for data seeder models and invariants**

Create `__tests__/dataSeeder.test.ts` testing plan generation.

- [ ] **Step 2: Implement `scripts/seedPlan.ts` and `scripts/seed.ts`**

Define Ethiopian shops (*Abebe Suq, Bole Mini Market, Shoa Bakery, Merkato Butcher*), catalog items, and multi-month entries. Make runnable with `npx tsx scripts/seed.ts`.

- [ ] **Step 3: Run seeder test**

Run: `npx jest __tests__/dataSeeder.test.ts --runInBand`
Expected: PASS

- [ ] **Step 4: Commit check**
Check `auto_commit` setting. If enabled:
```bash
git add scripts/seedPlan.ts scripts/seed.ts __tests__/dataSeeder.test.ts
git commit -m "feat: automated test data seeder for shops, catalog, and ledger"
```

---

### Task 6: Redesign Shop Creation UI (Warm Ledger Design System)

**Files:**
- Create: `src/components/CreateShopModal.tsx`
- Modify: `src/app/shops.tsx`
- Modify: `src/app/add-charge.tsx`
- Modify: `src/app/record-payment.tsx`
- Create: `__tests__/CreateShopModal.test.tsx`
- Test: `__tests__/CreateShopModal.test.tsx`

- [ ] **Step 1: Write test for `CreateShopModal`**

Create `__tests__/CreateShopModal.test.tsx` testing validation and preset clicks.

- [ ] **Step 2: Implement `src/components/CreateShopModal.tsx`**

Build bottom sheet modal with Ethiopian presets (*Suq, Kiosk, Bakery, Butcher, Pharmacy, Cafe*), live validation, and role badge.

- [ ] **Step 3: Integrate into `shops.tsx`, `add-charge.tsx`, and `record-payment.tsx`**

Add "+ New Shop" trigger to shop selector strips.

- [ ] **Step 4: Run tests and verify**

Run: `npx jest __tests__/CreateShopModal.test.tsx --runInBand`
Expected: PASS

- [ ] **Step 5: Commit check**
Check `auto_commit` setting. If enabled:
```bash
git add src/components/CreateShopModal.tsx src/app/shops.tsx src/app/add-charge.tsx src/app/record-payment.tsx __tests__/CreateShopModal.test.tsx
git commit -m "feat: redesigned shop creation modal with presets and inline selector support"
```

---

### Task 7: Global Platform Super Admin (Backend Migration, Service & Console Screen)

**Files:**
- Create: `supabase/migrations/0009_platform_super_admin.sql`
- Create: `src/services/platformAdmin.ts`
- Create: `src/app/platform-console.tsx`
- Modify: `src/app/settings.tsx`
- Modify: `src/app/_layout.tsx`
- Create: `__tests__/platformAdmin.test.ts`
- Test: `__tests__/platformAdmin.test.ts`

- [ ] **Step 1: Write test for Platform Admin service**

Create `__tests__/platformAdmin.test.ts`:
```typescript
import {
  isPlatformAdminEmail,
  formatPlatformMetrics,
} from '../src/services/platformAdmin';

describe('platformAdmin', () => {
  it('identifies authorized master emails', () => {
    expect(isPlatformAdminEmail('tensaylemessa@gmail.com')).toBe(true);
    expect(isPlatformAdminEmail('testmaregeyaa@gmail.com')).toBe(true);
    expect(isPlatformAdminEmail('random@gmail.com')).toBe(false);
  });

  it('formats platform metrics summary', () => {
    const summary = formatPlatformMetrics({
      totalUsers: 6,
      totalHouseholds: 2,
      totalShops: 5,
      totalEntries: 20,
      totalVolumeSantim: 540000,
      bannedUsers: 0,
    });
    expect(summary.volumeEtb).toBe('5,400 ETB');
    expect(summary.totalUsers).toBe(6);
  });
});
```

- [ ] **Step 2: Write database migration `supabase/migrations/0009_platform_super_admin.sql`**

Create `0009_platform_super_admin.sql`:
1. `public.platform_admins (user_id, email, granted_at)`
2. Seed initial admins for `tensaylemessa@gmail.com` and `testmaregeyaa@gmail.com`.
3. `public.banned_users (user_id, banned_by, reason, banned_at)`
4. `public.is_platform_admin()` helper function.
5. RPC `public.get_platform_metrics()` returning aggregate users, households, shops, volume.
6. RPC `public.list_platform_users(search, limit, offset)` joining `auth.users`, `members`, `households`, `banned_users`.
7. RPC `public.ban_platform_user(target_user_id, reason)` and `public.unban_platform_user(target_user_id)`.
8. RPC `public.list_platform_households(search, limit, offset)`.
9. Apply migration to remote database: `npx supabase db push --remote --yes`.

- [ ] **Step 3: Implement `src/services/platformAdmin.ts`**

Implement client functions calling the new Supabase RPCs:
- `checkIsPlatformAdmin(): Promise<boolean>`
- `fetchPlatformMetrics(): Promise<PlatformMetrics>`
- `fetchPlatformUsers(search, limit, offset): Promise<PlatformUserItem[]>`
- `fetchPlatformHouseholds(search, limit, offset): Promise<PlatformHouseholdItem[]>`
- `banUser(userId, reason): Promise<void>`
- `unbanUser(userId): Promise<void>`

- [ ] **Step 4: Implement `src/app/platform-console.tsx`**

Build `src/app/platform-console.tsx`:
- Header: "Platform Master Console" with live metrics badges.
- Tab 1: **All Registered Users**
  - Search by email or name.
  - User item card with Email, Household Name, Role, Date Registered, Status.
  - 1-tap **[ Ban User ]** / **[ Unban User ]** button with confirmation alert.
- Tab 2: **All Households Directory**
  - Search by household name.
  - Cards showing Household Name, Invite Code, Member Count, Active Shops, Total Owed ETB.
- Tab 3: **System Status & Health**
  - Database connectivity, total volume tracked in ETB, audit stats.

- [ ] **Step 5: Connect Platform Console entry point in `src/app/settings.tsx` and `_layout.tsx`**

1. Register `<Stack.Screen name="platform-console" />` in `src/app/_layout.tsx`.
2. In `src/app/settings.tsx`: If `session?.user.email` is in platform admins list or `checkIsPlatformAdmin()` is true, display a gold/emerald card: **"Platform Master Console"** that navigates to `/platform-console`.

- [ ] **Step 6: Run tests and verify**

Run: `npx jest __tests__/platformAdmin.test.ts --runInBand`
Expected: PASS

- [ ] **Step 7: Commit check**
Check `auto_commit` setting. If enabled:
```bash
git add supabase/migrations/0009_platform_super_admin.sql src/services/platformAdmin.ts src/app/platform-console.tsx src/app/settings.tsx src/app/_layout.tsx __tests__/platformAdmin.test.ts
git commit -m "feat: global platform super admin console with user ban controls and metrics"
```

---

### Task 8: Comprehensive Verification & Doctor Gate

**Files:**
- Entire repository

- [ ] **Step 1: Run typecheck**
Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Run linter**
Run: `npx expo lint`
Expected: 0 errors, 0 warnings

- [ ] **Step 3: Run full automated test suite**
Run: `npm test`
Expected: All test suites pass

- [ ] **Step 4: Run Expo Doctor**
Run: `npx expo-doctor`
Expected: 20/20 checks passed without errors

- [ ] **Step 5: Review with user before GitHub push**
Confirm all 5 core goals are verified:
1. Shop click & selection works without crashes on Android.
2. 1-tap direct Add Charge / Record Payment from shop cards.
3. App opens existing cached ledger offline without redirecting to `/link-household`.
4. Partner push notifications trigger on new entries.
5. Global Platform Super Admin Console gives Tensay full oversight and ban controls over all 6+ users and households.
Wait for explicit user instruction before pushing to GitHub or building APK.
