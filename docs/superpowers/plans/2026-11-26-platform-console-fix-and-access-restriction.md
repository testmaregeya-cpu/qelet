# Platform Console RPC Fix, Dual Super Admin & Top Balance Crash Fix Plan (Revised)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 
1. Retain strictly and exclusively `tensaylemessa@gmail.com` and `testmaregeyaa@gmail.com` as Platform Super Admins across DB RLS and client UI.
2. Fix the PostgreSQL type mismatch error (`42804`) in `list_platform_households()` so all households, users, and metrics populate cleanly.
3. Fix the Top Balance click crash in `src/app/shops.tsx` and harden `src/components/StatusBadge.tsx` and Expo Router route error boundaries against fatal crashes.
4. Ship the complete update instantly Over-The-Air via EAS Update.

**Tech Stack:** Supabase (PostgreSQL 15, PL/pgSQL, RLS), React Native, Expo Router, TypeScript, Jest, EAS Update.

---

### Task 1: Remote Database Remediation

**Files:**
- Remote Supabase database: project `ealmdyoxypgmhlpbilwf`

- [ ] **Step 1: Verify and clean `public.platform_admins`**
Run query to ensure only `tensaylemessa@gmail.com` and `testmaregeyaa@gmail.com` are present:
```sql
DELETE FROM public.platform_admins 
WHERE user_id NOT IN (
  SELECT id FROM auth.users WHERE lower(email) IN ('tensaylemessa@gmail.com', 'testmaregeyaa@gmail.com')
);
```

- [ ] **Step 2: Update `list_platform_households()` RPC on remote DB**
Recreate function with `::BIGINT` cast on column 7 (`total_balance_santim`):
```sql
CREATE OR REPLACE FUNCTION public.list_platform_households()
RETURNS TABLE (
  household_id UUID,
  household_name TEXT,
  invite_code TEXT,
  created_at TIMESTAMPTZ,
  member_count BIGINT,
  shop_count BIGINT,
  total_balance_santim BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Platform admin only';
  END IF;

  RETURN QUERY
  SELECT
    h.id AS household_id,
    h.name AS household_name,
    h.invite_code,
    h.created_at,
    (SELECT count(*) FROM public.members m WHERE m.household_id = h.id) AS member_count,
    (SELECT count(*) FROM public.shops s WHERE s.household_id = h.id AND s.archived = false) AS shop_count,
    (
      SELECT coalesce(sum(CASE WHEN e.type = 'charge' THEN e.total_amount_santim ELSE -e.total_amount_santim END), 0)::BIGINT
      FROM public.entries e
      WHERE e.household_id = h.id AND e.voided = false
    ) AS total_balance_santim
  FROM public.households h
  ORDER BY h.created_at DESC;
END;
$$;
```

---

### Task 2: Fix Top Balance Click Action & Crash Hardening

**Files:**
- Modify: `src/app/shops.tsx:567, 608-634`
- Modify: `src/components/StatusBadge.tsx:15-39`
- Modify: `src/app/shop/[id].tsx`
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Wire Top Balances row to Quick Action Sheet in `src/app/shops.tsx`**
In `src/app/shops.tsx`:
Change `topBalances` row `onPress={() => openShopDetail(shop)}` to:
```tsx
onPress={() => {
  triggerHaptic('selection');
  setQuickActionShop(shop);
}}
```
And in `upcomingAndDue` line 567, also change to `setQuickActionShop(shop)`.
This gives immediate 1-tap access to Add Charge and Record Payment on top balances, matching user request.

- [ ] **Step 2: Harden `src/components/StatusBadge.tsx` against unmapped values**
Add default fallback in `switch (status)` and `LABEL_BY_STATUS` lookup to guarantee `colors` is never undefined.

- [ ] **Step 3: Add `ErrorBoundary` to `src/app/shop/[id].tsx` and `src/app/_layout.tsx`**
Export Expo Router `ErrorBoundary` so any rendering or runtime error displays an in-app error card with retry instead of crashing the native process.

---

### Task 3: Dual-Admin Whitelist & Console Screen Hardening

**Files:**
- Modify: `src/services/platformAdmin.ts`
- Modify: `src/app/settings.tsx`
- Modify: `src/app/platform-console.tsx`
- Modify: `supabase/migrations/0009_platform_super_admin.sql`

- [ ] **Step 1: Add whitelist helper to `src/services/platformAdmin.ts`**
Export `isPlatformAdminEmail(email)` with `['tensaylemessa@gmail.com', 'testmaregeyaa@gmail.com']`.

- [ ] **Step 2: Guard `settings.tsx` and `platform-console.tsx`**
Ensure only whitelisted emails see the card or can load the platform console.

- [ ] **Step 3: Update `0009_platform_super_admin.sql`**
Keep the migration file synchronized with the `::BIGINT` cast and dual-admin seed.

---

### Task 4: Unit Testing & Verification

**Files:**
- Run: `npm test`
- Run: `npx tsc --noEmit`
- Run: `npx expo lint`

Expected: 0 type errors, 0 lint errors, all tests passing.

---

### Task 5: Deploy Over-The-Air Update (EAS OTA)

- [ ] **Step 1: Git commit and push to GitHub (`master` and `main`)**
- [ ] **Step 2: Publish EAS update to channel `preview`**
Run:
```bash
npx eas-cli update --channel preview --message "Fix platform console RPC type, retain dual super admins, and fix top balance click crash"
```
